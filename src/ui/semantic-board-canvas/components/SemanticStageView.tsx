// What one semantic pane draws, from what its stage knows: the header with the
// way back and the ways of reading, the standing of the variant on screen,
// whichever of the four states is true or the page of the open tab, and the
// sidebar beside the reading.

import type { UseQueryResult } from "@tanstack/react-query";
import { useMemo, type JSX, type ReactNode } from "react";

import type {
	SemanticRender,
	SemanticWaiting,
} from "@/ui/semantic-board-canvas/api/semantic-boards";
import type { VariantsPageProps } from "@/ui/semantic-board-canvas/components/BoardHistoryPages";
import { BoardPage } from "@/ui/semantic-board-canvas/components/BoardPage";
import type { BoardTab } from "@/ui/semantic-board-canvas/components/PaneHeader";
import { PeekProvider } from "@/ui/semantic-board-canvas/components/Peek";
import type { SemanticBoardStageProps } from "@/ui/semantic-board-canvas/components/SemanticBoardStage";
import { SemanticDiagram } from "@/ui/semantic-board-canvas/components/SemanticDiagram";
import type { GroupControls } from "@/ui/semantic-board-canvas/components/SemanticInspectorParts";
import { SemanticRefreshFailure } from "@/ui/semantic-board-canvas/components/SemanticRefreshFailure";
import { StageHeader } from "@/ui/semantic-board-canvas/components/SemanticStageHeader";
import {
	ReadingArea,
	pictureMarks,
	presentationOver,
} from "@/ui/semantic-board-canvas/components/SemanticStagePresentation";
import { SemanticStageSidebar } from "@/ui/semantic-board-canvas/components/SemanticStageSidebar";
import {
	SemanticStageEmpty,
	SemanticStageProblem,
} from "@/ui/semantic-board-canvas/components/SemanticStageStates";
import { waitingStage } from "@/ui/semantic-board-canvas/components/SemanticStageWaiting";
import { SemanticStanding } from "@/ui/semantic-board-canvas/components/SemanticStanding";
import type { BoardCamera } from "@/ui/semantic-board-canvas/hooks/use-board-camera";
import type { Leaving } from "@/ui/semantic-board-canvas/hooks/use-departure";
import type { DrillNavigation } from "@/ui/semantic-board-canvas/hooks/use-drill-down";
import type { PaneReading } from "@/ui/semantic-board-canvas/hooks/use-level-reading";
import type { PresentationPosition } from "@/ui/semantic-board-canvas/hooks/use-presentation-position";
import type { Sidebar } from "@/ui/semantic-board-canvas/hooks/use-sidebar";
import type { WalkthroughReading } from "@/ui/semantic-board-canvas/hooks/use-walkthrough";
import type { AppliedAppearance } from "@/ui/semantic-board-canvas/lib/appearance";
import type { VariantReading } from "@/ui/semantic-board-canvas/lib/board-document";
import type { GroupChoice, GroupSelection } from "@/ui/semantic-board-canvas/lib/groups";
import type { KindLook } from "@/ui/semantic-board-canvas/lib/kind-look";
import type { BeatFocus } from "@/ui/semantic-board-canvas/lib/narrative";
import type { WalkthroughNarration } from "@/ui/semantic-board-canvas/lib/narration";
import type { Departure } from "@/ui/semantic-board-canvas/lib/picture-departure";

/** What the view is assembled from. */
interface RenderView extends SemanticBoardStageProps {
	/** Whether the canvas shows comparison marks and removed context. */
	readonly comparison: boolean;
	/** Change this pane's comparison display. */
	readonly onComparisonChange: (enabled: boolean) => void;
	/** Camera retained while a different variant is being drawn. */
	readonly camera: BoardCamera;
	/** The cache's answer for this board, variant and view. */
	readonly render: UseQueryResult<SemanticRender>;
	/** Ask the server for the picture again. */
	readonly onRetry: () => void;
	/** Which board the pane is actually looking at, and the way back. */
	readonly drill: DrillNavigation;
	/**
	 * The person picked a subject out, reported as what it is.
	 * @param id The semantic id, or null.
	 */
	readonly onPick: (id: string | null) => void;
	/** Follow a drill-down, clearing the selection it was made from. */
	readonly onOpenDown: (board: string, variant: string) => void;
	/** Go back a level, clearing the selection made on the level below. */
	readonly onBack: () => void;
	/** The picture on screen is the board a flight arrived at: it took over from the board inside its card with no entrance. */
	readonly cut: boolean;
	/** The last board's picture, on its way out while this one is drawn; null otherwise. */
	readonly leaving: Leaving | null;
	/** Where the reader went from the last board, until this board's picture is up; null otherwise. */
	readonly heading: Departure | null;
	/** What this variant explains about itself, and what is being read. */
	readonly narrative: WalkthroughReading;
	/** Where a presented walkthrough has got to, and how the surface says it arrived. */
	readonly presented: PresentationPosition;
	/** Narrating the walkthroughs aloud, when the shell can. */
	readonly narration: WalkthroughNarration | undefined;
	/** What the shell lays over the picture, or nothing. */
	readonly overlay: ReactNode;
	/** How the board on screen is being read, at whatever level it is. */
	readonly level: PaneReading;
	/** What the board says about itself, or null while it has not arrived. */
	readonly reading: VariantReading | null;
	/** What the beat being read asks of the picture. */
	readonly focus: BeatFocus;
	/** What this reading does not draw of that beat's subjects, in words. */
	readonly missing: readonly string[];
	/** Stop reading the open explanation. */
	readonly onCloseNarrative: () => void;
	/** Leave the guided reading and choose a view of this level. */
	readonly onChooseView: (view: string | null) => void;
	/** Read an explanation; opening one lets any selected group go. */
	readonly onChooseWalkthrough: (walkthrough: string | null) => void;
	/** Every group the variant on screen uses. */
	readonly groups: readonly GroupChoice[];
	/** How the inspector names memberships and selects one. */
	readonly groupControls: GroupControls;
	/** The selected group and its members, or null. */
	readonly group: GroupSelection | null;
	/** Select a group's members in place of the selection and any guided reading; null to let go. */
	readonly onChooseGroup: (group: string | null) => void;
	/** The sidebar's tab, and where it is. */
	readonly sidebar: Sidebar;
	/** What the picture on screen draws each kind with, for the key and the inspector. */
	readonly appearances: ReadonlyMap<string, AppliedAppearance>;
	/** How the vault's kinds look, for the pages and the details panel. */
	readonly look: KindLook;
	/** The tab of the featured header that is open. */
	readonly tab: BoardTab;
	/** Open a tab. */
	readonly onTab: (tab: BoardTab) => void;
	/** Read one beat of a walkthrough: the diagram comes back, presenting it. */
	readonly onReadBeat: (walkthrough: string, beat: number) => void;
	/** Attach the picture's area, which a panel laid over its edge keeps a pick clear of. */
	readonly attachPicture: (element: HTMLDivElement | null) => void;
}

/**
 * What to call one of this board's variants.
 *
 * The board's own family, which the pane already has in hand for the variant
 * bar. A variant it does not know — one renamed out from under a reader, or one
 * of another board after a drill-down — is named by its id, which is worse than
 * a name and better than a blank.
 * @param view What the stage is assembled from.
 * @returns A function from a variant id to what it is called.
 */
function variantNamer(view: RenderView): (id: string) => string {
	const offered = view.reading?.variants ?? [];
	return (id) => offered.find((variant) => variant.id === id)?.name ?? id;
}

/**
 * The disclosure over a diagram whose refresh failed, when one did.
 *
 * Any failure counts, whatever its kind: a request that never arrived, a
 * refusal from the route, or a board that became unreadable after having been
 * readable. What matters to the person is the same in every case — the picture
 * they are looking at is not known to be current.
 * @param view The query's answer and the retry.
 * @returns The strip, or null while the picture is known to be current.
 */
function refreshDisclosure(view: RenderView): ReactNode {
	if (view.render.error === null) {
		return null;
	}
	return (
		<SemanticRefreshFailure
			error={view.render.error}
			retrying={view.render.isFetching}
			onRetry={view.onRetry}
		/>
	);
}

/**
 * Whichever of the four states is true.
 * @param view The board, the query's answer, the selection and the retry.
 * @returns The picture, or the news that there is not one.
 */
function stageBody(view: RenderView): JSX.Element {
	const { render } = view;
	// Nothing has ever arrived: this is the only case where a failure takes the
	// whole pane, because there is nothing behind it to keep showing.
	if (render.data === undefined) {
		return render.error === null ? (
			waitingStage(view)
		) : (
			<SemanticStageProblem board={view.drill.board} error={render.error} />
		);
	}
	// The disclosure is decided before the two shapes divide, because an empty
	// board whose refresh failed is exactly the case that would otherwise look
	// current: a board somebody has since filled in still reads as empty, and
	// nothing on screen would say the picture is old.
	const notice = refreshDisclosure(view);
	const answer = render.data;
	if (answer.kind === "empty") {
		return (
			<SemanticStageEmpty
				board={answer.board}
				view={answer.view}
				variant={answer.variant.name}
				notice={notice}
			/>
		);
	}
	return (
		<SemanticDiagram
			camera={view.camera}
			drawing={answer}
			selection={view.selection}
			onSelect={view.onPick}
			reading={view.reading}
			onOpenDown={view.onOpenDown}
			reducedMotion={view.reducedMotion ?? false}
			stale={notice !== null}
			notice={notice}
			focus={view.focus}
			{...pictureMarks(view)}
			heading={view.heading}
			cut={view.cut}
			presenting={view.narrative.open === null ? null : view.narrative.beatIndex}
			arrivalKey={view.presented.arrivalKey}
			onSettled={view.presented.onSettled}
		/>
	);
}

/**
 * What the drawn state is waiting on, when there is a drawn state at all.
 * @param answer The render answer, when one has arrived.
 * @returns The standing, or null.
 */
function waitingOn(answer: SemanticRender | undefined): SemanticWaiting | null {
	return answer?.waiting ?? null;
}

/**
 * The whole pane: its header with the way back and the ways of reading, then
 * the reading itself, with the sidebar on the right of it.
 * @param view The board, the query's answer, the selection and the retry.
 * @returns The stage.
 */
function SemanticStageView(view: RenderView): JSX.Element {
	const { attachPicture } = view;
	return (
		<>
			{/* The way back is in the header, which is drawn in every state, because
			    the states somebody most needs it in are the ones with no diagram:
			    drilling into a board that is empty, or unreadable, or still loading,
			    and finding that the only way back went with the picture would leave
			    them stuck on a board they cannot leave. */}
			<StageHeader view={view} />
			{/* Coherent and out of step: a picture cannot say that by itself, and
			    drawn plainly it looks settled — which is the one impression it must
			    not give. */}
			<SemanticStanding
				waiting={waitingOn(view.render.data)}
				nameOf={view.narrative.nameOf}
				variantNameOf={variantNamer(view)}
			/>
			{/* Read left to right: the picture — with a presented walkthrough's
			    caption over it, while the sidebar steps aside — then the board and
			    whatever is selected on it. */}
			<PeekProvider selection={view.selection}>
				<ReadingArea presenting={view.narrative.open !== null}>
					<div ref={attachPicture} className="relative flex min-h-0 min-w-0 flex-1">
						{stageBody(view)}
						{presentationOver(view)}
						{view.tab !== "diagram" && view.narrative.open === null && (
							<PaneBoardPage view={view} tab={view.tab} />
						)}
					</div>
					<SemanticStageSidebar view={view} appearances={view.appearances} />
				</ReadingArea>
			</PeekProvider>
		</>
	);
}

/**
 * What the Variants page lists, from what the board says about itself.
 * @param reading What the board says about itself, or null before it arrives.
 * @param onChoose Read another state of the board, when the pane can.
 * @returns The page's inputs.
 */
function variantsPage(
	reading: VariantReading | null,
	onChoose: VariantsPageProps["onChoose"],
): VariantsPageProps {
	if (reading === null) {
		return { variants: [], adoptions: [], shelvings: [], showing: null, onChoose };
	}
	return {
		variants: reading.variants,
		adoptions: reading.adoptions,
		shelvings: reading.shelvings,
		showing: reading.showing?.id ?? null,
		onChoose,
	};
}

/**
 * The page of the open tab, over the picture.
 * @param props What the stage knows, and the tab that is open.
 * @param props.view What the stage knows.
 * @param props.tab The tab that is open: one of the board's pages.
 * @returns The page.
 */
function PaneBoardPage(props: {
	readonly view: RenderView;
	readonly tab: Exclude<BoardTab, "diagram">;
}): JSX.Element {
	const { view } = props;
	const { reading, onReadBeat } = view;
	const { onVariant } = view.level;
	const { offered } = view.narrative;
	const variants = useMemo(() => variantsPage(reading, onVariant), [reading, onVariant]);
	const walkthroughs = useMemo(
		() => ({ walkthroughs: offered, onChoose: onReadBeat }),
		[offered, onReadBeat],
	);
	return (
		<BoardPage
			tab={props.tab}
			content={reading?.variant?.content ?? null}
			look={view.look}
			groups={view.groupControls.names}
			selection={view.selection}
			onPick={view.onPick}
			variants={variants}
			walkthroughs={walkthroughs}
		/>
	);
}

export { SemanticStageView };
