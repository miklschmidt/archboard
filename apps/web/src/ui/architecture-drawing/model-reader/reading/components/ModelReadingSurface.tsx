import { useCallback, useMemo, useState, type JSX, type ReactNode } from "react";
import type { ArchitectureModelRead } from "@archboard/model/contract";
import type { activateCodeTarget } from "@archboard/code-opener/code-target";
import { ModelAbout } from "#ui/architecture-drawing/model-reader/reading/components/ModelAbout.tsx";
import type { AboutPlace } from "#ui/architecture-drawing/model-reader/reading/components/ModelAboutFrame.tsx";
import { AboutOutlineContext } from "#ui/architecture-drawing/model-reader/reading/components/ModelAboutOutline.tsx";
import { ModelReadingCanvas } from "#ui/architecture-drawing/model-reader/reading/components/ModelReadingCanvas.tsx";
import { ModelReadingPanel } from "#ui/architecture-drawing/model-reader/reading/components/ModelReadingPanel.tsx";
import { ModelComparisonNotice } from "#ui/architecture-drawing/model-reader/reading/components/ModelStateDetails.tsx";
import { PeekProvider } from "#ui/architecture-drawing/canvas/presentation/components/Peek.tsx";
import { useAboutPlace } from "#ui/architecture-drawing/model-reader/reading/hooks/use-about-place.ts";
import { useModelCodeFindings } from "#ui/architecture-drawing/model-reader/reading/hooks/use-model-code-findings.ts";
import { useModelExplanation } from "#ui/architecture-drawing/model-reader/reading/hooks/use-model-explanation.ts";
import { ModelSubjectMenu } from "#ui/architecture-drawing/model-reader/reading/components/ModelSubjectMenu.tsx";
import { useReaderKeys } from "#ui/architecture-drawing/model-reader/reading/hooks/use-reader-keys.ts";
import type { Reader } from "#ui/architecture-drawing/model-reader/hooks/use-reader.ts";
import { useSubjectMenu } from "#ui/architecture-drawing/model-reader/reading/hooks/use-subject-menu.ts";
import { useShowSubject } from "#ui/architecture-drawing/model-reader/reading/hooks/use-show-subject.ts";
import { useSceneAppearances } from "#ui/architecture-drawing/model-reader/reading/hooks/use-scene-appearances.ts";
import {
	flowSubjects,
	collectionSubjects,
	walkthroughSubjects,
} from "#ui/architecture-drawing/model-reader/rules/flow-reading.ts";
import {
	scopeSubjects,
	walkthroughsAbout,
} from "#ui/architecture-drawing/model-reader/reading/rules/relevance.ts";

type Model = Extract<ArchitectureModelRead, { success: true }>;

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
 * The picture of a reading, with the right panel beside it.
 * @param props The surface, the code findings, the page on the picture and the panel.
 * @param props.surface The surface's inputs.
 * @param props.warnings What the code findings mark on the picture.
 * @param props.page About while it is open, which lies on the picture's sheet.
 * @param props.children The panel.
 * @returns The picture.
 */
function ReadingPicture(props: {
	readonly surface: ModelReadingSurfaceProps;
	readonly warnings: ReturnType<typeof useModelCodeFindings>["warnings"];
	readonly page: ReactNode;
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
			page={props.page}
		>
			{props.children}
		</ModelReadingCanvas>
	);
}

/**
 * What the reading of a pane shows while no walkthrough does: the caption, the picture with the
 * right panel beside it, and About over the picture. It reports the reading, so a walkthrough that
 * replaces it reports alone.
 * @param props The reader and the pane's parts.
 * @returns The surface.
 */
function ModelReadingSurface(props: ModelReadingSurfaceProps): JSX.Element {
	const { reader } = props;
	const { model, vault, location, accepted, selection, comparison, page, onPage } = reader;
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
	const onInterface = useCallback((): void => {
		place.ask("interface");
		onPage("about");
	}, [place, onPage]);
	const [outlineSlot, setOutlineSlot] = useState<HTMLElement | null>(null);
	const aboutPage = useMemo(
		() =>
			page === "about" && (
				<ReadingAbout key={about} surface={props} place={place} outlineSlot={outlineSlot} />
			),
		[page, about, props, place, outlineSlot],
	);
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
				<ReadingPicture surface={props} warnings={code.warnings} page={aboutPage}>
					<ModelReadingPanel
						reader={reader}
						paneId={props.paneId}
						onCodeTargetNotice={props.onCodeTargetNotice}
						code={code}
						actions={actions}
						onReveal={revealSelection}
						onAbout={onInterface}
						outlineSlot={setOutlineSlot}
					/>
				</ReadingPicture>
			</div>
		</PeekProvider>
	);
}

/**
 * What About describes, as a key: the page starts again, with its own place, for each open scope.
 * @param reader The reader.
 * @returns The key.
 */
function aboutKey(reader: Reader): string {
	return `about:${reader.accepted.shown.projection.opened}`;
}

/**
 * The About page of the open module, over the picture so that the picture keeps its camera. What
 * can be done stays at the foot of the right panel beside it.
 * @param props The surface, and what the page offers.
 * @param props.surface The surface's inputs.
 * @param props.place Where the page was scrolled to, which it comes back to.
 * @param props.outlineSlot The slot at the top of the right panel, which the outline stands in.
 * @returns The page.
 */
function ReadingAbout(props: {
	readonly surface: ModelReadingSurfaceProps;
	readonly place: AboutPlace;
	readonly outlineSlot: HTMLElement | null;
}): JSX.Element {
	const { surface } = props;
	const { reader } = surface;
	const { accepted, selection } = reader;
	const { shown, scene } = accepted;
	const walkthroughs = useMemo(
		() => walkthroughsAbout(shown.model, scopeSubjects(shown.projection.opened)),
		[shown.model, shown.projection.opened],
	);
	const onShow = useShowSubject(reader);
	const appearances = useSceneAppearances(scene);
	const hidesNarrow = selection.ids.size === 0;
	const outline = useMemo(
		() => ({ panel: props.outlineSlot, hidesNarrow }),
		[props.outlineSlot, hidesNarrow],
	);
	return (
		<AboutOutlineContext value={outline}>
			<ModelAbout
				overview={surface.overview?.(shown.model) ?? null}
				onShow={onShow}
				appearances={appearances}
				walkthroughs={walkthroughs}
				tree={reader.tree}
				place={props.place}
				reducedMotion={surface.reducedMotion}
				vault={reader.vault}
				paneId={surface.paneId}
				model={shown.model}
				scope={shown.projection.opened}
				projection={shown.projection}
				selection={selection}
			/>
		</AboutOutlineContext>
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
