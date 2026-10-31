import { useCallback, useMemo, useState, type JSX, type ReactNode } from "react";
import type { ArchitectureModelRead } from "@archboard/board/model";
import type { activateCodeTarget } from "@archboard/code-opener/code-target";
import { Button } from "@archboard/ui-kit/components";
import { ModelAbout } from "#ui/components/architecture-model/ModelAbout.tsx";
import { ModelCaption } from "#ui/components/architecture-model/ModelCaption.tsx";
import { ModelCodeDetails } from "#ui/components/architecture-model/ModelCodeFindings.tsx";
import { ModelExplanationMenu } from "#ui/components/architecture-model/ModelExplanationMenu.tsx";
import { ModelKey } from "#ui/components/architecture-model/ModelKey.tsx";
import { ModelPanel } from "#ui/components/architecture-model/ModelPanel.tsx";
import { ModelPanelSubject } from "#ui/components/architecture-model/ModelPanelSubject.tsx";
import { ModelReadingCanvas } from "#ui/components/architecture-model/ModelReadingCanvas.tsx";
import { ModelSelectionBar } from "#ui/components/architecture-model/ModelSelectionBar.tsx";
import { ModelComparisonNotice } from "#ui/components/architecture-model/ModelStateDetails.tsx";
import { PeekProvider } from "#ui/components/semantic-board-canvas/Peek.tsx";
import { useModelCodeFindings } from "#ui/hooks/architecture-model/use-model-code-findings.ts";
import { useModelExplanation } from "#ui/hooks/architecture-model/use-model-explanation.ts";
import { usePanelWait } from "#ui/hooks/architecture-model/use-panel-wait.ts";
import { useReaderKeys } from "#ui/hooks/architecture-model/use-reader-keys.ts";
import type { Reader } from "#ui/hooks/architecture-model/use-reader.ts";
import { flowSubjects, collectionSubjects } from "#ui/rules/architecture-model/flow-reading.ts";
import { selectedSubject } from "#ui/rules/architecture-model/selected-subject.ts";

type Model = Extract<ArchitectureModelRead, { success: true }>;

/** Inputs for what the middle of a reading shows. */
interface ModelReadingSurfaceProps {
	overlay?: ReactNode;
	overview?: (shown: Model) => ReactNode;
	comparison?: (shown: Model) => ReactNode;
	onCodeTargetNotice: Parameters<typeof activateCodeTarget>[0]["onNotice"];
	paneId: string;
	reducedMotion: boolean;
	reader: Reader;
	/** What the stage has to say over the picture, which it never moves. */
	children?: ReactNode;
}

/**
 * The identities of what belongs to behavior rather than architecture.
 * @param reader The reader.
 * @returns The identities.
 */
function useBehavioralIds(reader: Reader): ReadonlySet<string> {
	const { model, structure, comparison } = reader;
	const { flows } = structure.depicted;
	return useMemo(() => {
		const collections = [model, comparison.reference].flatMap((source) =>
			source === undefined ? [] : collectionSubjects(source),
		);
		return new Set([...flowSubjects(flows), ...collections].map((one) => one.id));
	}, [model, flows, comparison.reference]);
}

/** What can be done with a selection, wherever it is explained. */
interface SelectionActions {
	readonly reader: Reader;
	readonly behavioralIds: ReadonlySet<string>;
	readonly explanation: ReturnType<typeof useModelExplanation>;
	readonly menu: boolean;
	readonly onMenu: (open: boolean) => void;
}

/**
 * What can be done with the selection.
 * @param props The reader and what the panel says of it.
 * @returns The controls.
 */
function SelectionControls(props: SelectionActions): JSX.Element {
	const { reader, behavioralIds, explanation } = props;
	const { selection, location, model, accepted } = reader;
	const { shown } = accepted;
	return (
		<ModelSelectionBar
			selection={selection}
			onFocus={location.setFocus}
			architectural={location.grammar === "architecture"}
			canFocus={![...selection.ids].some((id) => behavioralIds.has(id))}
			oneLine={selectedSubject({ ...shown, ids: selection.ids }).kind === "connection"}
		>
			{model.migrationPreview === undefined && (
				<ModelExplanationMenu
					open={props.menu}
					onOpenChange={props.onMenu}
					model={shown.model}
					selected={selection.ids}
					unavailable={explanation.unavailable}
					onAction={explanation.act}
				/>
			)}
		</ModelSelectionBar>
	);
}

/**
 * The line over the picture: what the open module does, and what its reading leaves out.
 * @param props The reader and what the stage says of the comparison.
 * @param props.reader The reader.
 * @param props.comparison What the reading is compared with.
 * @returns The caption.
 */
function ReadingCaption(props: {
	readonly reader: Reader;
	readonly comparison: ReactNode;
}): JSX.Element {
	const { reader } = props;
	const { location, accepted } = reader;
	const { focus, filters, grammar, setFocus } = location;
	const clearFocus = useCallback((): void => setFocus(null), [setFocus]);
	return (
		<ModelCaption
			model={accepted.shown.model}
			projection={accepted.shown.projection}
			everyLine={filters.everyLine}
			onToggle={location.toggleEveryLine}
			comparison={props.comparison}
		>
			{grammar === "architecture" && focus !== null && (
				<Button data-slot="model-clear-focus" variant="ghost" size="sm" onClick={clearFocus}>
					Clear focus ({focus.length})
				</Button>
			)}
		</ModelCaption>
	);
}

/** What the right panel of a reading holds. */
interface ReadingPanelProps {
	readonly surface: ModelReadingSurfaceProps;
	readonly code: ReturnType<typeof useModelCodeFindings>;
	readonly open: boolean;
	/** The selection it explains, which it keeps while it leaves. */
	readonly ids: ReadonlySet<string>;
	readonly actions: SelectionActions;
	readonly onReveal: () => void;
}

/**
 * What the reading's selection opens over the picture.
 * @param props The surface and what the panel explains.
 * @returns The panel.
 */
function ReadingPanel(props: ReadingPanelProps): JSX.Element {
	const { surface, code, ids } = props;
	const { reader } = surface;
	const { accepted, selection, tree, location } = reader;
	const { shown } = accepted;
	const pathOf = useCallback((id: string) => tree.owner.get(id)?.path, [tree]);
	const held = useMemo(() => ({ ...selection, ids }), [selection, ids]);
	return (
		<ModelPanel open={props.open} subject={[...ids].join()} onClose={selection.clear}>
			<ModelPanelSubject
				vault={reader.vault}
				paneId={surface.paneId}
				onCodeTargetNotice={surface.onCodeTargetNotice}
				model={shown.model}
				projection={shown.projection}
				selection={held}
				scope={shown.projection.opened}
				onOpen={reader.onOpen}
				onReveal={props.onReveal}
				onRevealFlow={location.openFlow}
				code={code.reading}
				pathOf={pathOf}
			>
				<SelectionControls {...props.actions} />
			</ModelPanelSubject>
		</ModelPanel>
	);
}

/**
 * The picture of a reading, with the Key at its lower left and the panel over its right edge.
 * @param props The surface, the code findings and what lies over the picture.
 * @param props.surface The surface's inputs.
 * @param props.warnings What the code findings mark on the picture.
 * @param props.keyOpen Whether the Key is open.
 * @param props.onKey Open or close the Key.
 * @param props.panelOpen Whether the panel lies over the picture.
 * @param props.settled The selection once its wait is over.
 * @param props.children The panel.
 * @returns The picture.
 */
function ReadingPicture(props: {
	readonly surface: ModelReadingSurfaceProps;
	readonly warnings: ReturnType<typeof useModelCodeFindings>["warnings"];
	readonly keyOpen: boolean;
	readonly onKey: (open: boolean) => void;
	readonly panelOpen: boolean;
	readonly settled: ReadonlySet<string>;
	readonly children: ReactNode;
}): JSX.Element {
	const { surface } = props;
	const { reader, overlay } = surface;
	const { accepted, location, request, camera, area, moves, selection, model } = reader;
	const { comparison, vault } = reader;
	return (
		<ModelReadingCanvas
			scene={accepted.scene}
			request={request}
			vault={vault}
			paneId={surface.paneId}
			pending={accepted.pending}
			comparing={comparison.status === "loading"}
			leaving={accepted.leaving}
			failure={accepted.failure}
			onRetry={accepted.retry}
			onWholeScope={reader.onWholeScope}
			onOpenState={location.selectState}
			notices={
				<>
					{surface.children}
					<ModelComparisonNotice comparison={comparison} />
				</>
			}
			camera={camera}
			area={area}
			cut={moves.cut}
			panelOpen={props.panelOpen}
			settled={props.settled}
			selection={selection}
			warnings={props.warnings}
			reducedMotion={surface.reducedMotion}
			onOpen={reader.onOpen}
			onAttention={moves.ahead}
			overlay={overlay}
		>
			{location.grammar === "architecture" && (
				<ModelKey
					model={model}
					projection={accepted.shown.projection}
					picture={accepted.scene?.picture.key ?? null}
					filters={location.filters}
					onToggle={location.toggleFilter}
					open={props.keyOpen}
					onOpenChange={props.onKey}
				/>
			)}
			{props.children}
		</ModelReadingCanvas>
	);
}

/**
 * What the reading of a pane shows while no walkthrough does: the caption and the picture, the
 * panel that a selection lays over it, and About. Only one of them lies over the picture at a
 * time. It reports the reading, so a walkthrough that replaces it reports alone.
 * @param props The reader and the pane's parts.
 * @returns The surface.
 */
function ModelReadingSurface(props: ModelReadingSurfaceProps): JSX.Element {
	const { reader } = props;
	const { model, vault, location, accepted, selection, comparison, page } = reader;
	const { reveal, grammar, scope } = location;
	const { shown } = accepted;
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
	const [menu, setMenu] = useState(false);
	const [keyOpen, setKeyOpen] = useState(false);
	const behavioralIds = useBehavioralIds(reader);
	const actions = useMemo(
		() => ({ reader, behavioralIds, explanation, menu, onMenu: setMenu }),
		[reader, behavioralIds, explanation, menu],
	);
	const revealSelection = useCallback((): void => {
		const kinds = model.relationships
			.filter((edge) => selection.ids.has(edge.id))
			.map((edge) => edge.kind);
		reveal(
			[...selection.ids].filter((id) => !behavioralIds.has(id)),
			kinds,
		);
	}, [model.relationships, selection.ids, reveal, behavioralIds]);
	const { settled, last } = usePanelWait(selection.ids);
	const panelOpen = settled.size > 0 && page === "diagram" && !keyOpen;
	const attach = useReadingKeys(selection, model, setMenu, page === "about");
	useReaderKeys(reader.onMove);
	return (
		<PeekProvider selection={soleSelected(selection.ids)}>
			<div
				ref={attach}
				data-slot="model-reading"
				data-scope={scope ?? ""}
				data-grammar={grammar}
				data-comparison={comparison.status}
				className="relative flex min-h-0 min-w-0 flex-1 flex-col"
			>
				<ReadingCaption reader={reader} comparison={props.comparison?.(shown.model)} />
				<ReadingPicture
					surface={props}
					warnings={code.warnings}
					keyOpen={keyOpen}
					onKey={setKeyOpen}
					panelOpen={panelOpen}
					settled={settled}
				>
					<ReadingPanel
						surface={props}
						code={code}
						open={panelOpen}
						ids={last}
						actions={actions}
						onReveal={revealSelection}
					/>
				</ReadingPicture>
				{page === "about" && (
					<ReadingAbout surface={props} code={code} actions={actions} onReveal={revealSelection} />
				)}
			</div>
		</PeekProvider>
	);
}

/**
 * The About page of the open module, over the picture so that the picture keeps its camera.
 * @param props The surface, and what the page offers.
 * @param props.surface The surface's inputs.
 * @param props.code The code findings of the reading.
 * @param props.actions What can be done with the selection.
 * @param props.onReveal Bring a hidden selection into the reading.
 * @returns The page.
 */
function ReadingAbout(props: {
	readonly surface: ModelReadingSurfaceProps;
	readonly code: ReturnType<typeof useModelCodeFindings>;
	readonly actions: SelectionActions;
	readonly onReveal: () => void;
}): JSX.Element {
	const { surface, code } = props;
	const { reader } = surface;
	const { accepted, selection, location, structure, model, onPage } = reader;
	const { shown, scene } = accepted;
	const { select } = selection;
	const onWarning = useCallback(
		(id: string | null): void => {
			select(id);
			if (id !== null) onPage("diagram");
		},
		[select, onPage],
	);
	const appearances = useMemo(
		() => new Map(scene?.picture.appearances.map((one) => [one.id, one])),
		[scene],
	);
	const evidence = useMemo(
		() => (
			<ModelCodeDetails
				reading={code.reading}
				selected={selection.ids}
				scope={shown.projection.opened}
			/>
		),
		[code.reading, selection.ids, shown.projection.opened],
	);
	const opened = shown.projection.opened;
	return (
		<ModelAbout
			subject={reader.aboutSubject}
			onSubject={reader.onAbout}
			overview={surface.overview?.(shown.model) ?? null}
			code={code.reading}
			onWarning={onWarning}
			appearances={appearances}
			scopeName={nameIn(structure.trail, opened) ?? model.manifest.name}
			reducedMotion={surface.reducedMotion}
			evidence={evidence}
			vault={reader.vault}
			paneId={surface.paneId}
			onCodeTargetNotice={surface.onCodeTargetNotice}
			model={shown.model}
			scope={opened}
			projection={shown.projection}
			selection={selection}
			onOpen={reader.onOpen}
			onReveal={props.onReveal}
			onRevealFlow={location.openFlow}
		>
			<SelectionControls {...props.actions} />
		</ModelAbout>
	);
}

/**
 * What a list of modules calls one of them.
 * @param modules The list.
 * @param id The module.
 * @returns Its name, while the list holds it.
 */
function nameIn(
	modules: readonly { readonly id: string; readonly name: string }[],
	id: string | null,
): string | undefined {
	return modules.find((entry) => entry.id === id)?.name;
}

/**
 * The subject a row of the reading belongs to.
 * @param ids The selected identities.
 * @returns The one selected identity, or null.
 */
function soleSelected(ids: ReadonlySet<string>): string | null {
	return ids.size === 1 ? ([...ids][0] ?? null) : null;
}

/**
 * Hear the reading's own keys: Escape clears the selection, and the menu key opens its actions.
 * The picture offers them only for a selection, and About offers them always.
 * @param selection The selection.
 * @param model The coherent model.
 * @param openMenu Open or close the action menu.
 * @param about Whether About is open.
 * @returns A callback ref for the reading's element.
 */
function useReadingKeys(
	selection: Reader["selection"],
	model: Model,
	openMenu: (open: boolean) => void,
	about: boolean,
) {
	const { clear, ids } = selection;
	const selecting = ids.size > 0;
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
				if (model.migrationPreview !== undefined || !(selecting || about)) return;
				event.preventDefault();
				openMenu(true);
			}
			element.addEventListener("keydown", keyDown);
			element.addEventListener("contextmenu", contextMenu);
			return (): void => {
				element.removeEventListener("keydown", keyDown);
				element.removeEventListener("contextmenu", contextMenu);
			};
		},
		[clear, model.migrationPreview, selecting, about, openMenu],
	);
}

export { ModelReadingSurface };
