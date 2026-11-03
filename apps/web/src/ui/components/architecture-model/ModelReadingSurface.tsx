import { useCallback, useMemo, useState, type JSX, type ReactNode } from "react";
import type { ArchitectureModelRead } from "@archboard/model/contract";
import type { activateCodeTarget } from "@archboard/code-opener/code-target";
import { ModelAbout, scopeHead } from "#ui/components/architecture-model/ModelAbout.tsx";
import type { AboutPlace } from "#ui/components/architecture-model/ModelAboutFrame.tsx";
import {
	ModelCodeDetails,
	ModelCodeWarnings,
} from "#ui/components/architecture-model/ModelCodeFindings.tsx";
import { ModelEngine } from "#ui/components/architecture-model/ModelEngine.tsx";
import { ModelHoverLight } from "#ui/components/architecture-model/ModelHoverLight.tsx";
import { ModelFlowHead } from "#ui/components/architecture-model/ModelFlowHead.tsx";
import { ModelInterfaceLine } from "#ui/components/architecture-model/ModelInterfaceLine.tsx";
import { ModelLegend } from "#ui/components/architecture-model/ModelLegend.tsx";
import { ModelPanel } from "#ui/components/architecture-model/ModelPanel.tsx";
import { ModelPanelContext } from "#ui/components/architecture-model/ModelPanelContext.tsx";
import { ModelPanelExpanded } from "#ui/components/architecture-model/ModelPanelExpanded.tsx";
import {
	ModelPanelActions,
	ModelPanelScope,
	ModelPanelSubject,
} from "#ui/components/architecture-model/ModelPanelSubject.tsx";
import { ModelReadingCanvas } from "#ui/components/architecture-model/ModelReadingCanvas.tsx";
import {
	ReadingExplain,
	SelectionControls,
	type SelectionActions,
} from "#ui/components/architecture-model/ModelReadingControls.tsx";
import {
	ModelComparisonNotice,
	ModelStateStanding,
} from "#ui/components/architecture-model/ModelStateDetails.tsx";
import { PeekProvider } from "#ui/components/canvas/Peek.tsx";
import { useAboutPlace } from "#ui/hooks/architecture-model/use-about-place.ts";
import { useHistoryOnSelection } from "#ui/hooks/architecture-model/use-history-on-selection.ts";
import { useModelCodeFindings } from "#ui/hooks/architecture-model/use-model-code-findings.ts";
import { useModelExplanation } from "#ui/hooks/architecture-model/use-model-explanation.ts";
import { ModelSubjectMenu } from "#ui/components/architecture-model/ModelSubjectMenu.tsx";
import { useReaderKeys } from "#ui/hooks/architecture-model/use-reader-keys.ts";
import type { Reader } from "#ui/hooks/architecture-model/use-reader.ts";
import { useSubjectMenu } from "#ui/hooks/architecture-model/use-subject-menu.ts";
import { useShowSubject } from "#ui/hooks/architecture-model/use-show-subject.ts";
import {
	flowSubjects,
	collectionSubjects,
	walkthroughSubjects,
	flowCollections,
} from "#ui/rules/architecture-model/flow-reading.ts";
import { scopeSubjects, walkthroughsAbout } from "#ui/rules/architecture-model/relevance.ts";

type Model = Extract<ArchitectureModelRead, { success: true }>;

/** What a flow reading filters: nothing, because it keeps its whole exchange. */
const NO_FILTERS = {};

/** Inputs for what the middle of a reading shows. */
interface ModelReadingSurfaceProps {
	overlay?: ReactNode;
	overview?: (shown: Model) => ReactNode;
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
		const held = [model, comparison.reference].flatMap((source) =>
			source === undefined ? [] : [...collectionSubjects(source), ...walkthroughSubjects(source)],
		);
		return new Set([...flowSubjects(flows), ...held].map((one) => one.id));
	}, [model, flows, comparison.reference]);
}

/**
 * What the marks of the picture on screen mean, and what lays out a picture of the structure.
 * @param props The reader.
 * @param props.reader The reader.
 * @returns The legend and the engine.
 */
function ReadingLegend(props: { readonly reader: Reader }): JSX.Element {
	const { accepted, location, selection } = props.reader;
	const { shown, scene } = accepted;
	const picture = scene?.picture.legend ?? null;
	return (
		<>
			<ModelLegend
				model={shown.model}
				projection={shown.projection}
				picture={picture}
				filters={location.grammar === "architecture" ? location.filters : NO_FILTERS}
				onToggle={location.toggleFilter}
				onShowAll={location.showAllKinds}
				selection={selection}
			/>
			{scene?.layout !== undefined && (
				<>
					<ModelEngine />
					<ModelHoverLight />
				</>
			)}
		</>
	);
}

/**
 * What touches what the panel explains.
 * @param props The reader and the selection.
 * @param props.reader The reader.
 * @param props.selected What the panel explains.
 * @returns The lists.
 */
function ReadingContext(props: {
	readonly reader: Reader;
	readonly selected: ReadonlySet<string>;
}): JSX.Element {
	const { accepted, choices } = props.reader;
	const { model, projection, reading } = accepted.shown;
	return (
		<ModelPanelContext
			model={model}
			projection={projection}
			selected={props.selected}
			flow={reading.grammar === "architecture" ? null : reading.flow}
			onFlow={choices.findFlow}
			onWalkthrough={choices.findWalkthrough}
		/>
	);
}

/** What the right panel of a reading holds. */
interface ReadingPanelProps {
	readonly surface: ModelReadingSurfaceProps;
	readonly code: ReturnType<typeof useModelCodeFindings>;
	readonly actions: SelectionActions;
	readonly onReveal: () => void;
	/** Open the interface section of About. */
	readonly onAbout: () => void;
}

/**
 * The column beside the picture: what is selected, or else what is open, and what touches it,
 * over the legend and the engine. Only the engine stands under the legend, so a selection never
 * moves a group tag out from under the pointer.
 * @param props The surface and what the panel explains.
 * @returns The panel.
 */
function ReadingPanel(props: ReadingPanelProps): JSX.Element {
	const { surface, code } = props;
	const { reader } = surface;
	const { accepted, selection, tree, location, choices } = reader;
	const { shown } = accepted;
	const { model, projection } = shown;
	const scope = projection.opened;
	const ids = selectionToExplain(selection.ids, accepted.selected);
	useHistoryOnSelection(reader.vault, model, ids);
	const held = useMemo(() => ({ ...selection, ids }), [selection, ids]);
	const selecting = ids.size > 0;
	const pathOf = useCallback((id: string) => tree.owner.get(id)?.path, [tree]);
	const head = scopeHead({ model, scope, tree, projection });
	const context = <ReadingContext reader={reader} selected={ids} />;
	const { flow, reference } = projection;
	const { grammar, selectGrammar } = location;
	const flowHead = useMemo(
		() =>
			flow === null ? undefined : (
				<ModelFlowHead
					flow={flow}
					collection={flowCollections(model, reference).get(flow.id)}
					grammar={grammar}
					onGrammar={selectGrammar}
				/>
			),
		[flow, model, reference, grammar, selectGrammar],
	);
	const { onAbout } = props;
	const onShow = useShowSubject(reader);
	const { onPage } = reader;
	const openAbout = useCallback((): void => onPage("about"), [onPage]);
	const line = useMemo(() => ({ onShow: choices.showHere, onAbout }), [choices.showHere, onAbout]);
	const subject = {
		vault: reader.vault,
		paneId: surface.paneId,
		onCodeTargetNotice: surface.onCodeTargetNotice,
		model,
		projection,
		selection: held,
		scope,
		onOpen: reader.onOpen,
		onToggle: reader.onToggle,
		onReveal: props.onReveal,
		onRevealFlow: reader.openFlow,
		code: code.reading,
		pathOf,
		context,
		flowHead,
		line,
	};
	return (
		<ModelPanel onClose={selecting ? selection.clear : undefined} covered={reader.page === "about"}>
			<ModelPanel.Subject key={[scope, ...ids].join()}>
				{selecting ? (
					<ModelPanelSubject {...subject} />
				) : (
					<ModelPanelScope
						name={head.name}
						description={head.description ?? head.lead}
						flowHead={flowHead}
					>
						<ModelInterfaceLine
							{...line}
							inspection={projection.inspection}
							projection={projection}
						/>
						<ModelPanelExpanded
							model={model}
							projection={projection}
							selection={held}
							onToggle={reader.onToggle}
						/>
						<ModelCodeDetails reading={code.reading} selected={ids} scope={scope} />
						<ModelStateStanding model={model} onOpen={openAbout} />
						{context}
					</ModelPanelScope>
				)}
			</ModelPanel.Subject>
			<ModelPanel.Foot>
				<ModelCodeWarnings reading={code.reading} onSelect={onShow} />
				{selecting ? (
					<ModelPanelActions {...subject}>
						<SelectionControls {...props.actions} />
					</ModelPanelActions>
				) : (
					<ReadingExplain {...props.actions} />
				)}
			</ModelPanel.Foot>
			<ReadingLegend reader={reader} />
		</ModelPanel>
	);
}

/**
 * The picture of a reading, with the right panel beside it.
 * @param props The surface, the code findings and the panel.
 * @param props.surface The surface's inputs.
 * @param props.warnings What the code findings mark on the picture.
 * @param props.children The panel.
 * @returns The picture.
 */
function ReadingPicture(props: {
	readonly surface: ModelReadingSurfaceProps;
	readonly warnings: ReturnType<typeof useModelCodeFindings>["warnings"];
	readonly children: ReactNode;
}): JSX.Element {
	const { surface } = props;
	const { reader, overlay } = surface;
	const { accepted, location, request, camera, area, moves, selection } = reader;
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
			selection={selection}
			warnings={props.warnings}
			reducedMotion={surface.reducedMotion}
			onOpen={reader.onOpen}
			onToggle={reader.onToggle}
			onAttention={moves.ahead}
			overlay={overlay}
		>
			{props.children}
		</ModelReadingCanvas>
	);
}

/**
 * What the reading of a pane shows while no walkthrough does: the caption, the picture with the
 * right panel beside it, and About over both. It reports the reading, so a walkthrough that
 * replaces it reports alone.
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
	const attach = useReadingKeys(selection, model, setMenu, page === "about");
	const subjectMenu = useSubjectMenu(reader);
	useReaderKeys(reader.onMove);
	const about = aboutKey(reader);
	const place = useAboutPlace(about);
	const { onPage } = reader;
	const onInterface = useCallback((): void => {
		place.ask("interface");
		onPage("about");
	}, [place, onPage]);
	return (
		<PeekProvider selection={soleSelected(selection.ids)}>
			<div
				ref={attach}
				data-slot="model-reading"
				data-scope={scope ?? ""}
				data-grammar={grammar}
				data-comparison={comparison.status}
				className="@container/reading relative flex min-h-0 min-w-0 flex-1 flex-col"
				onContextMenu={subjectMenu.onContextMenu}
			>
				<ModelSubjectMenu
					actions={actions}
					menu={subjectMenu.menu}
					onOpenChange={subjectMenu.onOpenChange}
				/>
				<ReadingPicture surface={props} warnings={code.warnings}>
					<ReadingPanel
						surface={props}
						code={code}
						actions={actions}
						onReveal={revealSelection}
						onAbout={onInterface}
					/>
				</ReadingPicture>
				{page === "about" && (
					<ReadingAbout
						key={about}
						surface={props}
						code={code}
						actions={actions}
						place={place}
						onReveal={revealSelection}
					/>
				)}
			</div>
		</PeekProvider>
	);
}

/**
 * What the panel explains. A selection that comes with a move explains the picture it comes with,
 * so the panel waits for that picture, and a selection let go leaves at once.
 * @param ids The selected identities.
 * @param shown The selection of the picture on show.
 * @returns The identities.
 */
function selectionToExplain(
	ids: ReadonlySet<string>,
	shown: ReadonlySet<string>,
): ReadonlySet<string> {
	return ids.size === 0 ? ids : shown;
}

/**
 * What About describes, as a key: the page starts again, with its own place, for each.
 * @param reader The reader.
 * @returns The key.
 */
function aboutKey(reader: Reader): string {
	const { aboutSubject, accepted, selection } = reader;
	const chosen = aboutSubject === "scope" ? "" : [...selection.ids].join();
	return `${aboutSubject}:${accepted.shown.projection.opened}:${chosen}`;
}

/**
 * The About page of the open module, over the picture so that the picture keeps its camera.
 * @param props The surface, and what the page offers.
 * @param props.surface The surface's inputs.
 * @param props.code The code findings of the reading.
 * @param props.actions What can be done with the selection.
 * @param props.place Where the page was scrolled to, which it comes back to.
 * @param props.onReveal Bring a hidden selection into the reading.
 * @returns The page.
 */
function ReadingAbout(props: {
	readonly surface: ModelReadingSurfaceProps;
	readonly code: ReturnType<typeof useModelCodeFindings>;
	readonly actions: SelectionActions;
	readonly place: AboutPlace;
	readonly onReveal: () => void;
}): JSX.Element {
	const { surface, code } = props;
	const { reader } = surface;
	const { accepted, selection, aboutSubject } = reader;
	const { shown, scene } = accepted;
	const walkthroughs = useMemo(
		() => walkthroughsAbout(shown.model, scopeSubjects(shown.projection.opened)),
		[shown.model, shown.projection.opened],
	);
	const onShow = useShowSubject(reader);
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
	return (
		<ModelAbout
			subject={aboutSubject}
			onSubject={reader.onAbout}
			overview={surface.overview?.(shown.model) ?? null}
			code={code.reading}
			onShow={onShow}
			appearances={appearances}
			walkthroughs={walkthroughs}
			tree={reader.tree}
			place={props.place}
			reducedMotion={surface.reducedMotion}
			evidence={evidence}
			vault={reader.vault}
			paneId={surface.paneId}
			onCodeTargetNotice={surface.onCodeTargetNotice}
			model={shown.model}
			scope={shown.projection.opened}
			projection={shown.projection}
			selection={selection}
			onOpen={reader.onOpen}
			onReveal={props.onReveal}
			onRevealFlow={reader.openFlow}
		>
			<SelectionControls {...props.actions} />
		</ModelAbout>
	);
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
 * Hear the reading's own keys: Escape clears the selection, and the menu key opens its actions,
 * which the picture offers only for a selection, and About offers always.
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
					menuKey(event);
					return;
				}
				if (event.key === "Escape" && !event.defaultPrevented) clear();
			}
			/**
			 * Open the shared action menu for the selection already visible in this reading.
			 * @param event The key pressed within the reading.
			 */
			function menuKey(event: KeyboardEvent): void {
				if (model.migrationPreview !== undefined || !(selecting || about)) return;
				event.preventDefault();
				openMenu(true);
			}
			element.addEventListener("keydown", keyDown);
			return (): void => {
				element.removeEventListener("keydown", keyDown);
			};
		},
		[clear, model.migrationPreview, selecting, about, openMenu],
	);
}

export { ModelReadingSurface };
