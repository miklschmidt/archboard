import { useContext } from "react";
import { ModelCodeWarnings } from "#ui/components/architecture-model/ModelCodeFindings.tsx";
import { useModelCodeFindings } from "#ui/hooks/architecture-model/use-model-code-findings.ts";
import { ModelExplanationMenu } from "#ui/components/architecture-model/ModelExplanationMenu.tsx";
import { useModelExplanation } from "#ui/hooks/architecture-model/use-model-explanation.ts";
import { useCallback, useMemo, useState, type JSX, type ReactNode } from "react";
import type { ArchitectureModelRead } from "@archboard/board/model";
import type { activateCodeTarget } from "@archboard/code-opener/code-target";
import { ModelModeControls } from "#ui/components/architecture-model/ModelModeControls.tsx";
import {
	projectFlow,
	flowSubjects,
	collectionSubjects,
	withCollectionFlows,
} from "#ui/rules/architecture-model/flow-reading.ts";
import { ModelFilters } from "#ui/components/architecture-model/ModelFilters.tsx";
import { useModelComparison } from "#ui/hooks/architecture-model/use-model-comparison.ts";
import { ModelComparisonNotice } from "#ui/components/architecture-model/ModelStateDetails.tsx";
import { ModelBreadcrumbs } from "#ui/components/architecture-model/ModelBreadcrumbs.tsx";
import { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import { ModelSelectionBar } from "#ui/components/architecture-model/ModelSelectionBar.tsx";
import { useProjectedSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import { ModelPaneContext } from "#ui/state/architecture-model/presentation.ts";
import { ModelReadingCanvas } from "#ui/components/architecture-model/ModelReadingCanvas.tsx";
import { ModelReadingSidebar } from "#ui/components/architecture-model/ModelReadingSidebar.tsx";
import { projectModel } from "@archboard/board/content";
import { importedReadings } from "#ui/rules/architecture-model/imported-readings.ts";

type Model = Extract<ArchitectureModelRead, { success: true }>;
interface ModelReadingProps {
	overlay?: ReactNode;
	overview?: ReactNode;
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
	const bookmarkReading = importedReading(model);
	const location = useModelLocation(props.paneId, bookmarkReading);
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
	const pane = useContext(ModelPaneContext);
	if (pane === null) throw new Error("A model reading requires its pane presentation.");
	const { sidebar } = pane;
	const { open: openTab } = sidebar;
	const onOpen = useCallback(
		(next: string | null): void => {
			openTab("board");
			open(modelId, next);
		},
		[modelId, open, openTab],
	);
	const projection = useMemo(
		() =>
			projectModel(model, scope, focus, filters, comparison.reference, bookmarkReading?.visibility),
		[model, scope, focus, filters, comparison.reference, bookmarkReading?.visibility],
	);
	const selection = useProjectedSelection(projection, pane.selection);
	const visibleProjection = useMemo(() => {
		const selectedFlow = projection.depicted.flows.find((entry) => entry.id === flow);
		return grammar === "architecture" || selectedFlow === undefined
			? projection
			: projectFlow(projection, selectedFlow);
	}, [projection, grammar, flow]);
	const code = useModelCodeFindings(props.vault, model);
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
				if (!sidebar.shown) sidebar.toggle();
				setExplanationOpen(true);
			}
			element.addEventListener("keydown", keyDown);
			element.addEventListener("contextmenu", contextMenu);
			return (): void => {
				element.removeEventListener("keydown", keyDown);
				element.removeEventListener("contextmenu", contextMenu);
			};
		},
		[clear, model.migrationPreview, sidebar],
	);
	const controls = (
		<>
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
				<ModelCodeWarnings reading={code.reading} onSelect={selection.select} />
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
		</>
	);
	return (
		<div
			ref={attach}
			data-slot="model-reading"
			data-scope={scope ?? ""}
			data-grammar={grammar}
			className="flex min-h-0 min-w-0 flex-1"
		>
			<div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
				<ModelComparisonNotice comparison={comparison} />
				<ModelReadingCanvas
					model={model}
					projection={visibleProjection}
					selection={selection}
					warnings={code.warnings}
					scope={scope}
					reducedMotion={props.reducedMotion}
					onOpen={onOpen}
					grammar={grammar}
					flow={flow}
					overlay={props.overlay}
				/>
			</div>
			<ModelReadingSidebar
				{...props}
				code={code}
				projection={visibleProjection}
				selection={selection}
				sidebar={sidebar}
				scope={scope}
				onOpen={onOpen}
				onReveal={revealSelection}
				onRevealFlow={openFlow}
				grammar={grammar}
				controls={controls}
			/>
		</div>
	);
}

/**
 * Keep optional imported reading intent separate from the ordinary model reader.
 * @param model The coherent architecture response.
 * @returns Its selected bookmark reading, when present.
 */
function importedReading(model: Model) {
	return importedReadings(model)?.bookmark?.reading;
}

export { ModelReading };
