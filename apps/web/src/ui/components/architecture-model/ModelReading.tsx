import { ModelExplanationMenu } from "#ui/components/architecture-model/ModelExplanationMenu.tsx";
import { useModelExplanation } from "#ui/hooks/architecture-model/use-model-explanation.ts";
import { lazy, Suspense, useCallback, useMemo, useState, type JSX } from "react";
import type { ArchitectureModelRead } from "@archboard/board/model";
import type { activateCodeTarget } from "@archboard/code-opener/code-target";
import { DiagramGrammarSchema, type DiagramGrammar } from "@archboard/board/views";
import { ModelModeControls } from "#ui/components/architecture-model/ModelModeControls.tsx";
import {
	projectFlow,
	flowSubjects,
	collectionSubjects,
	withCollectionFlows,
} from "#ui/rules/architecture-model/flow-reading.ts";
import { ModelFilters } from "#ui/components/architecture-model/ModelFilters.tsx";
import { ModelHiddenSelection } from "#ui/components/architecture-model/ModelHiddenSelection.tsx";
import { useModelComparison } from "#ui/hooks/architecture-model/use-model-comparison.ts";
import { ModelComparisonNotice } from "#ui/components/architecture-model/ModelStateDetails.tsx";
import { ModelConnections } from "#ui/components/architecture-model/ModelConnections.tsx";
import { ModelSelectionDetails } from "#ui/components/architecture-model/ModelSelectionDetails.tsx";
import { ModelBreadcrumbs } from "#ui/components/architecture-model/ModelBreadcrumbs.tsx";
import { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import { ModelSelectionBar } from "#ui/components/architecture-model/ModelSelectionBar.tsx";
import {
	useModelSelection,
	type ModelSelection,
} from "#ui/hooks/architecture-model/use-model-selection.ts";
import { useModelPick } from "#ui/hooks/architecture-model/use-model-pick.ts";
import { projectModel } from "#ui/rules/architecture-model/projection.ts";

const ModelDiagram = lazy(async () => {
	const module = await import("#ui/components/architecture-model/ModelDiagram.tsx");
	return { default: module.ModelDiagram };
});

const LOADING_DIAGRAM = (
	<output className="text-body text-muted-foreground min-w-0 flex-1 p-8">Loading diagram…</output>
);

type Model = Extract<ArchitectureModelRead, { success: true }>;
interface ModelReadingProps {
	subject: string | null;
	onCodeTargetNotice: Parameters<typeof activateCodeTarget>[0]["onNotice"];
	vault: string;
	model: Model;
	paneId: string;
	reducedMotion: boolean;
}

/**
 * A scope changes the reading of the existing model without copying its content.
 * @param props The coherent model.
 * @returns Recursive navigation and the selected scope.
 */
function ModelReading(props: ModelReadingProps): JSX.Element {
	const { model } = props;
	const comparison = useModelComparison(props.vault, model);
	const location = useModelLocation(props.paneId);
	const {
		scope,
		open,
		focus,
		setFocus,
		filters,
		toggleFilter,
		reveal,
		grammar,
		flow,
		selectGrammar,
		selectFlow,
		openFlow,
	} = location;
	const { id: modelId } = model.manifest;
	const onOpen = useCallback((next: string | null): void => open(modelId, next), [modelId, open]);
	const projection = useMemo(
		() => projectModel(model, scope, focus, filters, comparison.reference),
		[model, scope, focus, filters, comparison.reference],
	);
	const selection = useModelSelection(projection, props.subject);
	const explanation = useModelExplanation(props.vault, model, location, selection.ids);
	const { clear } = selection;
	const [explanationOpen, setExplanationOpen] = useState(false);
	const behavioralIds = useMemo(() => {
		const collections = [model, comparison.reference].flatMap((reading) =>
			reading === undefined ? [] : collectionSubjects(reading),
		);
		return new Set(
			[...flowSubjects(projection.depicted.flows), ...collections].map((subject) => subject.id),
		);
	}, [model, projection.depicted.flows, comparison.reference]);
	const canFocus = ![...selection.ids].some((id) => behavioralIds.has(id));
	const subjects = useMemo(() => {
		const traced =
			selection.ids.size > 0 ? selection.ids : new Set(focus ?? (scope === null ? [] : [scope]));
		const expanded = withCollectionFlows(model, traced);
		return comparison.reference === undefined
			? expanded
			: withCollectionFlows(comparison.reference, expanded);
	}, [selection.ids, focus, scope, model, comparison.reference]);
	const revealSelection = useCallback((): void => {
		const kinds = model.relationships
			.filter((edge) => selection.ids.has(edge.id))
			.map((edge) => edge.kind);
		reveal(
			[...selection.ids].filter((id) => !behavioralIds.has(id)),
			kinds,
		);
	}, [model.relationships, selection.ids, reveal, behavioralIds]);
	const attach = useCallback(
		(element: HTMLDivElement | null) => {
			if (element === null) return undefined;
			/**
			 * Clear selection only while input belongs to this reading.
			 * @param event The key pressed within the reading.
			 */
			function keyDown(event: KeyboardEvent): void {
				if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
					contextMenu(event);
					return;
				}
				if (event.key === "Escape" && !event.defaultPrevented) clear();
			}
			/**
			 * Open the shared action menu for the selection already visible in this reading.
			 * @param event The context request inside this reading.
			 */
			function contextMenu(event: Event): void {
				if (model.migrationPreview !== undefined) return;
				event.preventDefault();
				setExplanationOpen(true);
			}
			element.addEventListener("keydown", keyDown);
			element.addEventListener("contextmenu", contextMenu);
			return (): void => {
				element.removeEventListener("keydown", keyDown);
				element.removeEventListener("contextmenu", contextMenu);
			};
		},
		[clear, model.migrationPreview],
	);
	return (
		<div
			ref={attach}
			data-slot="model-reading"
			data-scope={scope ?? ""}
			data-grammar={grammar}
			className="flex min-h-0 flex-1 flex-col"
		>
			<ModelComparisonNotice comparison={comparison} />
			<ModelBreadcrumbs
				name={model.manifest.name}
				scope={scope}
				trail={projection.trail}
				onOpen={onOpen}
			/>
			<ModelSelectionBar
				selection={selection}
				focus={focus}
				onFocus={setFocus}
				architectural={grammar === "architecture"}
				canFocus={canFocus}
			>
				{model.migrationPreview === undefined && (
					<ModelExplanationMenu
						open={explanationOpen}
						onOpenChange={setExplanationOpen}
						model={model}
						selected={selection.ids}
						unavailable={explanation.unavailable}
						onAction={explanation.act}
					/>
				)}
				<ModelModeControls
					content={projection.depicted}
					subjects={subjects}
					grammar={grammar}
					flow={flow}
					onGrammar={selectGrammar}
					onFlow={selectFlow}
				/>
				{grammar === "architecture" && (
					<ModelFilters model={model} filters={filters} onToggle={toggleFilter} />
				)}
			</ModelSelectionBar>
			<ModelReadingContent
				paneId={props.paneId}
				vault={props.vault}
				onCodeTargetNotice={props.onCodeTargetNotice}
				model={model}
				selection={selection}
				scope={scope}
				projection={projection}
				reducedMotion={props.reducedMotion}
				onOpen={onOpen}
				onReveal={revealSelection}
				onRevealFlow={openFlow}
				grammar={grammar}
				flow={flow}
			/>
		</div>
	);
}

interface ScopedModelReadingProps extends Pick<
	ModelReadingProps,
	"vault" | "paneId" | "onCodeTargetNotice"
> {
	model: Model;
	selection: ModelSelection;
	onReveal: () => void;
	onRevealFlow: (id: string) => void;
	scope: string | null;
	projection: ReturnType<typeof projectModel>;
	reducedMotion: boolean;
	onOpen: (scope: string | null) => void;
}

/**
 * A behavioral reading requires its exact authored flow, independently of the structural scope.
 * @param props The requested mode, flow, and underlying architecture reading.
 * @returns A coherent diagram or explicit unavailable state.
 */
function ModelReadingContent(
	props: ScopedModelReadingProps & { grammar: string; flow: string | null },
): JSX.Element {
	const parsed = DiagramGrammarSchema.safeParse(props.grammar);
	if (!parsed.success)
		return (
			<output data-slot="model-mode-unavailable" className="text-body p-8">
				The requested diagram mode is unavailable: {props.grammar}. Choose a supported mode.
			</output>
		);
	if (parsed.data !== "architecture") return <BehavioralReading {...props} grammar={parsed.data} />;
	if (props.projection.missing)
		return (
			<output data-slot="model-missing-scope" className="text-body p-8">
				The requested module is absent from this reading: {props.scope}. Open the repository from
				the path above.
			</output>
		);
	return (
		<>
			<FocusAvailability missing={props.projection.missingFocus} />
			<ScopedModelReading key={props.scope ?? "root"} {...props} grammar={parsed.data} />
		</>
	);
}

/**
 * Never replace a missing explicit flow with another exchange.
 * @param props The complete model and exact requested flow identity.
 * @returns The whole selected behavior or its recovery instruction.
 */
function BehavioralReading(
	props: ScopedModelReadingProps & { grammar: DiagramGrammar; flow: string | null },
): JSX.Element {
	const selected = props.projection.depicted.flows.find((entry) => entry.id === props.flow);
	const projection = useMemo(
		() => (selected === undefined ? null : projectFlow(props.projection, selected)),
		[props.projection, selected],
	);
	if (projection === null)
		return (
			<output
				data-slot={props.flow === null ? "model-flow-required" : "model-flow-missing"}
				className="text-body p-8"
			>
				{props.flow === null
					? "Choose an authored flow to read its behavior."
					: `The selected flow is unavailable: ${props.flow}. Choose another flow or restore its architecture.`}
			</output>
		);
	return (
		<ScopedModelReading
			key={`${props.grammar}:${props.flow}`}
			{...props}
			projection={projection}
			grammar={props.grammar}
		/>
	);
}

/**
 * Only selection is local state; authored content remains the query snapshot.
 * @param props The coherent model and scope projection.
 * @returns Immediate children, nearby context, and authored details.
 */
function ScopedModelReading(
	props: ScopedModelReadingProps & { grammar: DiagramGrammar },
): JSX.Element {
	const { model } = props;
	const { ids: selected, select } = props.selection;
	const { children, context } = props.projection;
	return (
		<div className="flex min-h-0 flex-1">
			<nav
				aria-label={props.grammar === "architecture" ? "Modules" : "Participants"}
				className="border-border w-80 shrink-0 overflow-y-auto border-r px-6 py-8"
			>
				<h3 className="text-title mb-4 font-semibold">
					{props.grammar === "architecture" ? "Modules" : "Participants"}
				</h3>
				{children.length === 0 && (
					<p className="text-body text-muted-foreground">This scope has no child modules.</p>
				)}
				<ul data-slot="module-list" className="space-y-1">
					{children.map((entry) => (
						<ModuleRow
							key={entry.id}
							module={entry}
							selected={selected.has(entry.id)}
							onSelect={select}
						/>
					))}
				</ul>
				{context.length > 0 && (
					<>
						<h3 className="text-title mt-8 mb-4 font-semibold">Nearby modules</h3>
						<ul data-slot="module-context" className="space-y-1">
							{context.map((entry) => (
								<ModuleRow
									key={entry.id}
									module={entry}
									selected={selected.has(entry.id)}
									onSelect={select}
								/>
							))}
						</ul>
					</>
				)}
				<ModelConnections
					model={model}
					connections={props.projection.connections}
					reference={props.projection.reference}
					selected={selected}
					onSelect={select}
				/>
			</nav>
			<Suspense fallback={LOADING_DIAGRAM}>
				<ModelDiagram
					grammar={props.grammar}
					model={model}
					projection={props.projection}
					selected={selected}
					onSelect={select}
					onSelectMany={props.selection.selectMany}
					onOpen={props.onOpen}
					reducedMotion={props.reducedMotion}
				/>
			</Suspense>
			<div className="border-border w-80 shrink-0 overflow-y-auto border-l px-6 py-8">
				<ModelHiddenSelection
					projection={props.projection}
					selected={selected}
					onReveal={props.onReveal}
					onRevealFlow={props.onRevealFlow}
				/>
				<ModelSelectionDetails {...props} />
			</div>
		</div>
	);
}

interface ModuleRowProps {
	module: ReturnType<typeof projectModel>["children"][number];
	selected: boolean;
	onSelect: ModelSelection["select"];
}

/**
 * A native button keeps each module reachable from the keyboard.
 * @param props The module, its selection state, and the selection action.
 * @returns One root module row.
 */
function ModuleRow(props: ModuleRowProps): JSX.Element {
	const { module, onSelect } = props;
	const { id } = module;
	const pick = useModelPick(id, onSelect);
	return (
		<li>
			<button
				type="button"
				data-module-id={id}
				aria-pressed={props.selected}
				{...pick}
				className="hover:bg-muted aria-pressed:bg-muted aria-pressed:shadow-raised rounded-control w-full space-y-1 px-3 py-3 text-left"
			>
				<span className="text-control block font-semibold">{module.name}</span>
				{module.responsibility && (
					<span className="text-body text-muted-foreground block">{module.responsibility}</span>
				)}
			</button>
		</li>
	);
}

/**
 * Missing focus targets never select replacement architecture.
 * @param props The requested identities absent from this reading.
 * @param props.missing Unavailable canonical identities.
 * @returns An explicit partial-reading notice, or no notice.
 */
function FocusAvailability(props: { missing: readonly string[] }): JSX.Element | null {
	if (props.missing.length === 0) return null;
	return (
		<output data-slot="model-focus-missing" className="text-body border-border border-b px-6 py-3">
			{props.missing.length} focused subjects are unavailable. Change focus or restore the missing
			architecture.
		</output>
	);
}

export { ModelReading };
