import { useContext } from "react";
import { ModelCodeWarnings } from "#ui/components/architecture-model/ModelCodeFindings.tsx";
import { useModelCodeFindings } from "#ui/hooks/architecture-model/use-model-code-findings.ts";
import { ModelExplanationMenu } from "#ui/components/architecture-model/ModelExplanationMenu.tsx";
import { useModelExplanation } from "#ui/hooks/architecture-model/use-model-explanation.ts";
import { useAcceptedScene } from "#ui/hooks/architecture-model/use-accepted-scene.ts";
import { useModelMoves } from "#ui/hooks/architecture-model/use-model-moves.ts";
import { useModelReading } from "#ui/hooks/architecture-model/use-model-reading.ts";
import type { Sidebar } from "#ui/hooks/semantic-board-canvas/use-sidebar.ts";
import { useBoardCamera } from "#ui/hooks/semantic-board-canvas/use-board-camera.ts";
import { PeekProvider } from "#ui/components/semantic-board-canvas/Peek.tsx";
import { useCallback, useMemo, useRef, useState, type JSX, type ReactNode } from "react";
import type { ArchitectureModelRead } from "@archboard/board/model";
import type { activateCodeTarget } from "@archboard/code-opener/code-target";
import { ModelModeControls } from "#ui/components/architecture-model/ModelModeControls.tsx";
import {
	flowSubjects,
	collectionSubjects,
	withCollectionFlows,
} from "#ui/rules/architecture-model/flow-reading.ts";
import { ModelCaption } from "#ui/components/architecture-model/ModelCaption.tsx";
import { ModelFilters } from "#ui/components/architecture-model/ModelFilters.tsx";
import { ModelComparisonNotice } from "#ui/components/architecture-model/ModelStateDetails.tsx";
import { ModelBreadcrumbs } from "#ui/components/architecture-model/ModelBreadcrumbs.tsx";
import { ModelSelectionBar } from "#ui/components/architecture-model/ModelSelectionBar.tsx";
import { useProjectedSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import { ModelPaneContext } from "#ui/state/architecture-model/presentation.ts";
import { ModelReadingCanvas } from "#ui/components/architecture-model/ModelReadingCanvas.tsx";
import { ModelReadingSidebar } from "#ui/components/architecture-model/ModelReadingSidebar.tsx";

type Model = Extract<ArchitectureModelRead, { success: true }>;
interface ModelReadingProps {
	overlay?: ReactNode;
	/** The state the accepted scene shows, so its details never run ahead of the picture. */
	overview?: (shown: Model) => ReactNode;
	subject: string | null;
	onCodeTargetNotice: Parameters<typeof activateCodeTarget>[0]["onNotice"];
	vault: string;
	model: Model;
	/** Whether the model is the answer to this address, not the last answer kept on screen. */
	settled: boolean;
	paneId: string;
	reducedMotion: boolean;
}

/**
 * A scope changes the reading of the existing model without copying its content.
 * The address asks for a destination, and everything that reads what is on screen
 * reads the accepted scene until that destination is drawn.
 * @param props The coherent model.
 * @returns Recursive navigation and the selected scope.
 */
function ModelReading(props: ModelReadingProps): JSX.Element {
	const { model, vault, reducedMotion } = props;
	const { location, comparison, structure, request } = useModelReading(
		vault,
		props.paneId,
		model,
		props.settled,
	);
	const { open, reveal, filters, focus, scope, grammar, flow, openFlow, setFocus } = location;
	const { id: modelId } = model.manifest;
	const pane = useContext(ModelPaneContext);
	if (pane === null) throw new Error("A model reading requires its pane presentation.");
	const { sidebar } = pane;
	const { open: openTab } = sidebar;
	const accepted = useAcceptedScene(request, pane.selection.ids);
	const { scene, shown } = accepted;
	const selection = useProjectedSelection(shown.projection, pane.selection);
	const { clear, select } = selection;
	const camera = useBoardCamera(reducedMotion);
	const area = useRef<HTMLDivElement | null>(null);
	const openModule = useCallback(
		(next: string | null): void => {
			clear();
			open(modelId, next);
		},
		[clear, modelId, open],
	);
	const { move, cut, ahead } = useModelMoves({
		camera,
		area,
		scene,
		reading: request.reading,
		model,
		reference: comparison.reference,
		reducedMotion,
		open: openModule,
	});
	const onOpen = useCallback(
		(next: string | null): void => {
			openTab("board");
			move(next);
		},
		[move, openTab],
	);
	const chooseSearch = useCallback(
		(id: string): void => {
			const module = model.modules.find((candidate) => candidate.id === id);
			if (module === undefined) return;
			open(modelId, module.parent ?? null);
			select(id);
		},
		[model.modules, modelId, open, select],
	);
	const code = useModelCodeFindings(vault, shown.model);
	const reporting = useMemo(
		() => ({ ready: accepted.ready, presentation: null }),
		[accepted.ready],
	);
	const explanation = useModelExplanation(
		vault,
		shown.model,
		shown.reading,
		accepted.selected,
		reporting,
	);
	const [explanationOpen, setExplanationOpen] = useState(false);
	const behavioralIds = useMemo(() => {
		const collections = [model, comparison.reference].flatMap((source) =>
			source === undefined ? [] : collectionSubjects(source),
		);
		return new Set(
			[...flowSubjects(structure.depicted.flows), ...collections].map((one) => one.id),
		);
	}, [model, structure.depicted.flows, comparison.reference]);
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
	const attach = useReadingKeys(clear, model, sidebar, setExplanationOpen);
	const controls = (
		<>
			<ModelBreadcrumbs
				name={model.manifest.name}
				scope={structure.opened}
				trail={structure.trail}
				pending={accepted.pending}
				onOpen={onOpen}
			/>
			<ModelSelectionBar
				selection={selection}
				focus={focus}
				onFocus={setFocus}
				architectural={grammar === "architecture"}
				canFocus={![...selection.ids].some((id) => behavioralIds.has(id))}
			>
				{model.migrationPreview === undefined && (
					<ModelExplanationMenu
						open={explanationOpen}
						onOpenChange={setExplanationOpen}
						model={shown.model}
						selected={selection.ids}
						unavailable={explanation.unavailable}
						onAction={explanation.act}
					/>
				)}
				<ModelCodeWarnings reading={code.reading} onSelect={selection.select} />
				<ModelModeControls
					content={structure.depicted}
					subjects={subjects}
					grammar={grammar}
					flow={flow}
					onGrammar={location.selectGrammar}
					onFlow={location.selectFlow}
				/>
				{grammar === "architecture" && (
					<ModelFilters model={model} filters={filters} onToggle={location.toggleFilter} />
				)}
			</ModelSelectionBar>
		</>
	);
	return (
		<PeekProvider selection={soleSelected(selection.ids)}>
			<div
				ref={attach}
				data-slot="model-reading"
				data-scope={scope ?? ""}
				data-grammar={grammar}
				className="flex min-h-0 min-w-0 flex-1"
			>
				<div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
					<ModelComparisonNotice comparison={comparison} />
					<ModelCaption
						projection={shown.projection}
						everyLine={filters.everyLine}
						onToggle={location.toggleEveryLine}
					/>
					<ModelReadingCanvas
						scene={scene}
						request={request}
						pending={accepted.pending}
						leaving={accepted.leaving}
						failure={accepted.failure}
						camera={camera}
						area={area}
						cut={cut}
						floating={sidebar.floating}
						selection={selection}
						warnings={code.warnings}
						reducedMotion={reducedMotion}
						onOpen={onOpen}
						onAttention={ahead}
						overlay={props.overlay}
					/>
				</div>
				<ModelReadingSidebar
					{...props}
					overview={props.overview?.(shown.model)}
					model={shown.model}
					code={code}
					projection={shown.projection}
					selection={selection}
					sidebar={sidebar}
					scope={shown.projection.opened}
					onOpen={onOpen}
					onSearch={chooseSearch}
					onReveal={revealSelection}
					onRevealFlow={openFlow}
					grammar={shown.reading.grammar}
					controls={controls}
				/>
			</div>
		</PeekProvider>
	);
}

/**
 * The subject a sidebar row belongs to.
 * @param ids The selected identities.
 * @returns The one selected identity, or null.
 */
function soleSelected(ids: ReadonlySet<string>): string | null {
	return ids.size === 1 ? ([...ids][0] ?? null) : null;
}

/**
 * Hear the reading's own keys: Escape clears the selection, and the menu key opens its actions.
 * @param clear Clear the selection.
 * @param model The coherent model.
 * @param sidebar The pane's sidebar, which holds the action menu.
 * @param openMenu Open or close the action menu.
 * @returns A callback ref for the reading's element.
 */
function useReadingKeys(
	clear: () => void,
	model: Model,
	sidebar: Sidebar,
	openMenu: (open: boolean) => void,
) {
	return useCallback(
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
				openMenu(true);
			}
			element.addEventListener("keydown", keyDown);
			element.addEventListener("contextmenu", contextMenu);
			return (): void => {
				element.removeEventListener("keydown", keyDown);
				element.removeEventListener("contextmenu", contextMenu);
			};
		},
		[clear, model.migrationPreview, sidebar, openMenu],
	);
}

export { ModelReading };
