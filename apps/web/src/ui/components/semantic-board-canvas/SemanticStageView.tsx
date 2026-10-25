// What one semantic pane draws, from what its stage knows: the header with the
// way back and the ways of reading, the standing of the variant on screen,
// whichever of the four states is true with the About page over it while its
// tab is open, and the sidebar beside the reading.

import type { UseQueryResult } from "@tanstack/react-query";
import type { JSX, ReactNode } from "react";

import type {
	SemanticRender,
	SemanticWaiting,
} from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import { AboutPage } from "#ui/components/semantic-board-canvas/AboutPage.tsx";
import type { BoardTab } from "#ui/components/semantic-board-canvas/PaneHeader.tsx";
import { PeekProvider } from "#ui/components/semantic-board-canvas/Peek.tsx";
import type { SemanticBoardStageProps } from "#ui/components/semantic-board-canvas/SemanticBoardStage.tsx";
import { SemanticDiagram } from "#ui/components/semantic-board-canvas/SemanticDiagram.tsx";
import type { GroupControls } from "#ui/components/semantic-board-canvas/SemanticInspectorParts.tsx";
import { SemanticRefreshFailure } from "#ui/components/semantic-board-canvas/SemanticRefreshFailure.tsx";
import { StageHeader } from "#ui/components/semantic-board-canvas/SemanticStageHeader.tsx";
import {
	ReadingArea,
	pictureMarks,
	presentationOver,
} from "#ui/components/semantic-board-canvas/SemanticStagePresentation.tsx";
import { SemanticStageSidebar } from "#ui/components/semantic-board-canvas/SemanticStageSidebar.tsx";
import {
	SemanticStageEmpty,
	SemanticStageProblem,
} from "#ui/components/semantic-board-canvas/SemanticStageStates.tsx";
import { waitingStage } from "#ui/components/semantic-board-canvas/SemanticStageWaiting.tsx";
import { SemanticStanding } from "#ui/components/semantic-board-canvas/SemanticStanding.tsx";
import type { BoardCamera } from "#ui/hooks/semantic-board-canvas/use-board-camera.ts";
import type { Leaving } from "#ui/hooks/semantic-board-canvas/use-departure.ts";
import type { DrillNavigation } from "#ui/hooks/semantic-board-canvas/use-drill-down.ts";
import type { PaneReading } from "#ui/hooks/semantic-board-canvas/use-level-reading.ts";
import type { PresentationPosition } from "#ui/hooks/semantic-board-canvas/use-presentation-position.ts";
import type { Sidebar } from "#ui/hooks/semantic-board-canvas/use-sidebar.ts";
import type { PagePlace } from "#ui/hooks/semantic-board-canvas/use-stage-tab.ts";
import type { WalkthroughReading } from "#ui/hooks/semantic-board-canvas/use-walkthrough.ts";
import type { AppliedAppearance } from "@archboard/renderer/picture";
import type { VariantReading } from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import type {
	ChosenQuestion,
	DesignQuestion,
} from "#ui/rules/semantic-board-canvas/board/design-questions.ts";
import type { GroupChoice, GroupSelection } from "#ui/rules/semantic-board-canvas/board/groups.ts";
import type { KindLook } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";
import type { BeatFocus } from "#ui/rules/semantic-board-canvas/walkthrough/narrative.ts";
import type { WalkthroughNarration } from "#ui/rules/semantic-board-canvas/walkthrough/narration.ts";
import type { Departure } from "#ui/clients/semantic-board-canvas/picture/picture-departure.ts";
import type { OpenDown } from "#ui/rules/semantic-board-canvas/drilling/drill-target.ts";

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
	/**
	 * The person picked a subject out on the picture itself, where it is: the
	 * camera stays where they left it.
	 * @param id The semantic id, or null.
	 */
	readonly onPickInPicture: (id: string | null) => void;
	/** Follow a drill-down, clearing the selection it was made from. */
	readonly onOpenDown: OpenDown;
	/**
	 * Go back to one of the boards the reader came down through, clearing the selection made below it.
	 * @param depth Where it is in the trail: 0 is its first board.
	 */
	readonly onBackTo: (depth: number) => void;
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
	/** The design question chosen and the subjects its answer names, or null. */
	readonly question: ChosenQuestion | null;
	/** Choose a design question in place of the pick, the group and any guided reading; null to let go. */
	readonly onChooseQuestion: (question: DesignQuestion | null) => void;
	/** The sidebar's tab, and where it is. */
	readonly sidebar: Sidebar;
	/** What the picture on screen draws each kind with, for the key and the inspector. */
	readonly appearances: ReadonlyMap<string, AppliedAppearance>;
	/** How the vault's kinds look, for the About page and the details panel. */
	readonly look: KindLook;
	/** The tab of the pane's header that is open: the picture, or the About page. */
	readonly tab: BoardTab;
	/** Open a tab. */
	readonly onTab: (tab: BoardTab) => void;
	/** Where the About page was scrolled to on this board, which it comes back to. */
	readonly place: PagePlace;
	/** Read one beat of a walkthrough: the diagram comes back, presenting it. */
	readonly onReadBeat: (walkthrough: string, beat: number) => void;
	/** Pick a subject out and show it: the diagram comes back, and the camera fits the subject. */
	readonly onShow: (id: string) => void;
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
			onSelect={view.onPickInPicture}
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
						{view.tab === "about" && <PaneAboutPage view={view} />}
					</div>
					<SemanticStageSidebar view={view} appearances={view.appearances} />
				</ReadingArea>
			</PeekProvider>
		</>
	);
}

/**
 * The About page, over the picture.
 * @param props What the stage knows.
 * @param props.view What the stage knows.
 * @returns The page.
 */
function PaneAboutPage(props: { readonly view: RenderView }): JSX.Element {
	const { view } = props;
	return (
		<AboutPage
			board={view.render.data?.board ?? view.drill.board}
			reading={view.reading}
			look={view.look}
			groups={view.groupControls.names}
			selection={view.selection}
			onPick={view.onPick}
			onShow={view.onShow}
			onVariant={view.level.onVariant}
			onPresent={view.onReadBeat}
			narration={view.narration}
			reducedMotion={view.reducedMotion ?? false}
			place={view.place}
		/>
	);
}

export { SemanticStageView };
