// One pane showing one semantic board, read-only.
//
// A pane can be in four states, and each is its own piece of news rather than
// one placeholder with a flag on it:
//
//   loading  the server has not answered yet and there is nothing to show;
//   empty    the board is there and has nothing on it;
//   error    the board could not be drawn and there is nothing to show;
//   stale    a picture is on screen and the read since then failed.
//
// A failed refresh keeps the last picture with a disclosure and retry. Query
// owns fetched state; the pane owns camera and selection across requests (ADR 0023).

import { useQuery } from "@tanstack/react-query";
import { memo, useCallback, useMemo, useRef, useState, type JSX, type ReactNode } from "react";

import type { CodeBinding } from "@archboard/code-binding/bindings";
import type { VariantContent } from "@archboard/board/content";
import { usePaneChrome } from "#ui/hooks/semantic-board-canvas/use-pane-chrome.ts";
import type {
	SemanticDrawing,
	SemanticRender,
} from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import type { BoardPlace } from "#ui/components/semantic-board-canvas/PaneHeader.tsx";
import { SemanticStageView } from "#ui/components/semantic-board-canvas/SemanticStageView.tsx";
import { useAutoFit } from "#ui/hooks/semantic-board-canvas/use-auto-fit.ts";
import { useBoardCamera } from "#ui/hooks/semantic-board-canvas/use-board-camera.ts";
import { useClearOfPanel } from "#ui/hooks/semantic-board-canvas/use-clear-of-panel.ts";
import { useDeparture } from "#ui/hooks/semantic-board-canvas/use-departure.ts";
import { useDive } from "#ui/hooks/semantic-board-canvas/use-dive.ts";
import { useDrillDown, type Dive } from "#ui/hooks/semantic-board-canvas/use-drill-down.ts";
import { useDrillMoves } from "#ui/hooks/semantic-board-canvas/use-drill-moves.ts";
import { useKindLook } from "#ui/hooks/semantic-board-canvas/use-kind-look.ts";
import { useLayoutEngine } from "#ui/hooks/semantic-board-canvas/use-layout-engine.ts";
import {
	useLevelReading,
	type ViewChange,
} from "#ui/hooks/semantic-board-canvas/use-level-reading.ts";
import { usePicking } from "#ui/hooks/semantic-board-canvas/use-picking.ts";
import { usePresentationPosition } from "#ui/hooks/semantic-board-canvas/use-presentation-position.ts";
import { useReported } from "#ui/hooks/semantic-board-canvas/use-reported-reading.ts";
import { useReveal } from "#ui/hooks/semantic-board-canvas/use-reveal.ts";
import { useSemanticBoardChanges } from "#ui/hooks/semantic-board-canvas/use-semantic-board-changes.ts";
import { useSettledFocus } from "#ui/hooks/semantic-board-canvas/use-settled-focus.ts";
import { useSidebar } from "#ui/hooks/semantic-board-canvas/use-sidebar.ts";
import { useStageAppearances } from "#ui/hooks/semantic-board-canvas/use-stage-appearances.ts";
import { useStageTab } from "#ui/hooks/semantic-board-canvas/use-stage-tab.ts";
import { useSubjectFocus } from "#ui/hooks/semantic-board-canvas/use-subject-focus.ts";
import { useVariantReading } from "#ui/hooks/semantic-board-canvas/use-variant-reading.ts";
import {
	useWalkthrough,
	type DrivenPlace,
} from "#ui/hooks/semantic-board-canvas/use-walkthrough.ts";
import type { SemanticPaneReading } from "#ui/rules/semantic-board-canvas/board/address.ts";
import type {
	SelectedSubject,
	VariantReading,
} from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import {
	aroundStep,
	type QuestionStep,
} from "#ui/rules/semantic-board-canvas/board/design-questions.ts";
import type { WalkthroughNarration } from "#ui/rules/semantic-board-canvas/walkthrough/narration.ts";
import {
	semanticBoardListQuery,
	semanticRenderQuery,
} from "#ui/clients/semantic-board-canvas/reads/queries.ts";
import { usePaneVault } from "#ui/hooks/semantic-board-canvas/use-pane-vault.ts";
import type { WalkthroughBeatSchema } from "@archboard/board/content";
import type { z } from "zod";
import type { SemanticPaneContextSchema } from "@archboard/board/pane-context";

type SemanticPanePart = NonNullable<z.infer<typeof SemanticPaneContextSchema>["byUser"]>[number];
type WalkthroughBeat = z.infer<typeof WalkthroughBeatSchema>;

/** Inputs for a semantic pane. */
interface SemanticBoardStageProps {
	/** The board name, as the address names it. */
	board: string;
	/**
	 * Open the code a node is bound to, when the shell around the pane can.
	 *
	 * The pane is a picture of an architecture and knows nothing about opening an
	 * editor: whether that is possible at all is the shell's business, so the
	 * control appears only when the shell says so, and nothing is drawn when it
	 * does not.
	 * @param binding Where the code is.
	 */
	onOpenCode?: ((binding: CodeBinding) => void) | undefined;
	/** A variant id or name; the board's current variant when absent. */
	variant?: string | undefined;
	/**
	 * Which time the pane has been pointed at a board, when the shell counts. A
	 * new count leaves a drill-down even when the board and the variant did not
	 * change: the pane was pointed back at the board it was opened on.
	 */
	arrival?: number | undefined;
	/**
	 * Which of the board's named views to read it through, or nothing for the
	 * whole variant. Reading is not writing: this changes what the pane asks the
	 * server to draw and touches no board.
	 */
	view?: string | undefined;
	/**
	 * The person chose a different way of reading this variant.
	 *
	 * Owned above the stage, because the choice belongs in the address: two
	 * panes can read one board two ways, and a reload keeps both.
	 * @param view The view's id, or null for the whole variant.
	 * @param cause An automatic reveal, which stays in this pane without a view gesture.
	 */
	onViewChange?: ViewChange | undefined;
	/**
	 * The person chose a different state of this architecture.
	 *
	 * Owned above the stage for the same reason the view is: which variant a
	 * pane is showing is part of what the pane is showing, and so part of its
	 * board key — `semantic:pipeline@7c40IV7N`.
	 * @param variant The variant's id, or null for whichever is current.
	 */
	onVariantChange?: ((variant: string | null) => void) | undefined;
	/**
	 * What this pane is actually reading, whenever that changes.
	 *
	 * The pane's address says what it was opened on; this says what is on
	 * screen. Following a drill-down puts another board there, at a variant the
	 * address never named, and a beat of a walkthrough reads its variant through
	 * a view nobody chose. Anything the shell does on the pane's behalf — saying
	 * what an agent is looking at, opening the code a subject is bound to,
	 * reporting what was picked out — is about the board on screen, and only the
	 * pane knows which one that is.
	 * @param reading The board, variant, view and selection on screen.
	 */
	onReading?: ((reading: SemanticPaneReading) => void) | undefined;
	/** The selected semantic id, or null for none. */
	selection: string | null;
	/**
	 * The person picked a subject out, or cleared the selection.
	 * @param id The semantic id, or null.
	 */
	onSelect: (id: string | null, subject?: SelectedSubject) => void;
	/**
	 * The pane leaves the board its pick was made on, by a drill-down or back out:
	 * the pick goes in this pane only, where the linked pane keeps its own
	 * (TASK-538.02). Without it, leaving lets the pick go as the person would.
	 */
	onLeave?: (() => void) | undefined;
	/** The user changed a part of the reading by hand that the shell hears of no other way. */
	onUserChanged?: ((part: SemanticPanePart) => void) | undefined;
	/**
	 * A place in a walkthrough that something driving the presentation asked
	 * for, or null. The position stays this pane's: a request is one more way of
	 * choosing it, and the pane's own report says where it got to (TASK-251).
	 */
	driven?: DrivenPlace | null | undefined;
	/**
	 * Narrating this pane's walkthroughs aloud, when the shell can start voice for
	 * it. The pane knows nothing about voice: the controls are drawn only when the
	 * shell supplies this, whichever pane is active, and say why when a narration
	 * cannot start now.
	 */
	narration?: WalkthroughNarration | undefined;
	/** What the shell lays over the picture, such as subtitles of a voice: low in the frame, or at the foot of a presented walkthrough's box, where the camera keeps the picture clear of it. */
	overlay?: ReactNode;
	/**
	 * The search over every board's parts, which the shell joins to this pane:
	 * at the top of the sidebar, where the part it finds is explained.
	 */
	search?: ReactNode;
	/**
	 * The boards above one, outermost first, as the navigator places them, each
	 * a way to it in this pane: the header's breadcrumb.
	 * @param board The board on screen.
	 * @returns The boards above it.
	 */
	placeOf?: ((board: string) => readonly BoardPlace[]) | undefined;
	/**
	 * Show a board of another vault in this pane: a drill-down into another
	 * repository, or back along a trail that came from one (ADR 0050). Without
	 * it, such a drill-down opens nothing.
	 */
	onDive?: Dive | undefined;
	/**
	 * Show a variant of the board on screen in the pane beside this one, read
	 * through this pane's view. Without it, the About page offers none.
	 * @param key The board key.
	 */
	onOpenBeside?: ((key: string) => void) | undefined;
	/**
	 * Whether the person asked for reduced motion.
	 *
	 * Passed in rather than read here: the shell owns that preference through
	 * its own `useReducedMotion`, and a module does not reach into another
	 * module's hooks. The surface also carries `motion-reduce:` as the belt.
	 */
	reducedMotion?: boolean | undefined;
}

/**
 * Which view the pane asks the server to draw this variant through.
 *
 * A beat told through a view wins for as long as it is the beat being read:
 * reading a narrative is following what it says to look at. It is an override
 * and not a change — nothing upward is told, so closing the rail leaves the
 * person looking at the view they chose themselves.
 * @param beat The beat being read, or null when no walkthrough is open.
 * @param asked The view the level on screen is being read through, if any.
 * @returns The view id to ask for, or undefined for the overview.
 */
function viewToRead(beat: WalkthroughBeat | null, asked: string | undefined): string | undefined {
	return beat?.view ?? asked;
}

/**
 * What the variant on screen holds, whole.
 * @param reading What the board says about itself, or null while it has not arrived.
 * @returns The variant's content, or null while it is not known.
 */
function contentOf(reading: VariantReading | null): VariantContent | null {
	return reading?.variant?.content ?? null;
}

/**
 * The answer, when it is a picture.
 * @param answer What the render query holds, if anything.
 * @returns The drawing, or null when there is not one to look at.
 */
function drawingIn(answer: SemanticRender | undefined): SemanticDrawing | null {
	return answer?.kind === "drawn" ? answer : null;
}

/**
 * A read-only semantic board in one pane.
 *
 * The shell's parts of the pane's header change with every piece of news about
 * the pane: who holds the board, what an agent says it is doing, whether the
 * socket is up. The header reads them for itself. The reading needs only to
 * know whether another pane shares the centre, so news about anything else
 * draws none of it again (TASK-385.05).
 * @param props The board, the variant, the selection and the pick.
 * @returns Whichever of the four states is true.
 */
function SemanticBoardStage(props: SemanticBoardStageProps): JSX.Element {
	const { shared } = usePaneChrome();
	return <BoardReading {...props} resting={shared} />;
}

/** Inputs for the reading of a pane's board. */
interface BoardReadingProps extends SemanticBoardStageProps {
	/** Whether the sidebar stays away unless the person docks it: while two panes share the centre. */
	readonly resting: boolean;
}

/**
 * The reading of the board in one pane: its state, and what it draws.
 * @param props The pane's inputs, and whether another pane shares the centre.
 * @returns Whichever of the four states is true.
 */
const BoardReading = memo(function BoardReading(props: BoardReadingProps): JSX.Element {
	const { resting, ...stage } = props;
	const { board, variant, onSelect, onUserChanged, onLeave } = props;
	const leavePick = useCallback((): void => {
		if (onLeave === undefined) onSelect(null);
		else onLeave();
	}, [onLeave, onSelect]);
	const [comparison, onComparisonChange] = useState(true);
	const vault = usePaneVault();
	const repository = useQuery(semanticBoardListQuery(vault)).data?.repository ?? null;
	const drill = useDrillDown(
		{ board, variant, arrival: props.arrival, vault, repository },
		props.onDive,
	);
	// How the board on screen is read: the shell's answer for the pane's own
	// board, and this pane's own for a level somebody drilled into, where there
	// is no address to hold it and the ids from the level above mean nothing.
	const level = useLevelReading(drill, {
		view: props.view,
		onView: props.onViewChange,
		onVariant: props.onVariantChange,
		onUserChanged,
	});
	// The explanations belong to the board on screen, so drilling into another
	// one closes whatever was being read: the beats were about a different
	// architecture.
	const reading = useVariantReading(drill.board, level.variant);
	const narrative = useWalkthrough(
		{ board: drill.board, variant: level.variant },
		reading,
		props.driven,
	);
	// A beat told through a view is read through that view, which is a different
	// picture to ask the server for. It overrides the pane's own choice for as
	// long as that beat is the one being read, and hands it straight back: the
	// narrative decides the reading while somebody is following it, and what the
	// person chose is what they come back to.
	const layout = useLayoutEngine();
	const render = useQuery(
		semanticRenderQuery({
			vault,
			board: drill.board,
			variant: level.variant,
			view: viewToRead(narrative.beat, level.view),
			comparison,
			layout,
		}),
	);
	// The board on screen, not the pane's own: a change to the board somebody is
	// actually reading is the one that has to reach them.
	useSemanticBoardChanges(vault, drill.board);

	const drawn = drawingIn(render.data);
	const presented = usePresentationPosition(
		narrative,
		drawn,
		viewToRead(narrative.beat, level.view),
	);
	const focus = useSettledFocus(
		narrative.beat,
		drawn,
		viewToRead(narrative.beat, level.view),
		reading,
	);
	const reducedMotion = props.reducedMotion === true;
	const camera = useBoardCamera(reducedMotion);
	// The picture's area, which a flight over the picture and a panel laid over its edge both look inside.
	const picture = useRef<HTMLDivElement | null>(null);
	const attachPicture = useCallback((element: HTMLDivElement | null): void => {
		picture.current = element;
	}, []);
	const dive = useDive({
		camera,
		area: picture,
		drawn,
		reading: { vault, comparison, layout },
		reducedMotion,
		presenting: narrative.open !== null,
	});
	useAutoFit(camera, drawn, focus, {
		presenting: narrative.open !== null,
		reducedMotion,
		cut: dive.cut,
	});
	// A subject is named to a reader by its name. Which ones the picture could
	// not find is settled against the atlas; what to call them is the board's.
	const { choose, nameOf } = narrative;
	const missing = useMemo(() => focus.undrawn.map(nameOf), [focus, nameOf]);
	const onCloseNarrative = useCallback((): void => {
		choose(null);
	}, [choose]);
	const chooseView = level.onView;
	const onChooseView = useCallback<ViewChange>(
		(view, cause): void => {
			choose(null);
			chooseView?.(view, cause);
		},
		[choose, chooseView],
	);

	const { onPick, onChooseGroup, groupControls, groups, group, question, onChooseQuestion } =
		usePicking({
			board: drill.board,
			reading,
			presenting: narrative.open !== null,
			picked: props.selection !== null,
			choose,
			onSelect,
		});
	useReported(props.onReading, {
		board: drill.board,
		answer: render.data,
		view: viewToRead(narrative.beat, level.view),
		selection: props.selection,
		presentation: presented.position,
	});

	const { refetch } = render;
	const onRetry = useCallback((): void => {
		void refetch();
	}, [refetch]);
	// A selection names a subject of the board it was made on, so moving between
	// levels clears it rather than carrying an id to a board that never had it.
	//
	// Which way the reader went is said first, so the picture being left knows
	// how to leave: into the card that was picked, or back out.
	const departure = useDeparture(drawn, drill.board, render);
	const { tab, onTab, place } = useStageTab(drill.board, narrative.open !== null, choose);
	// Two panes rest their sidebars, so each picture has the room (use-sidebar.ts).
	const sidebar = useSidebar(props.selection, resting, narrative.open !== null, tab === "about");
	useClearOfPanel(picture, sidebar.floating, props.selection, camera, reducedMotion);
	const onPickInPicture = useReveal({
		camera,
		atlas: drawn?.atlas ?? null,
		reading,
		selection: props.selection,
		off: narrative.open !== null || sidebar.floating,
		reducedMotion,
		onPick,
	});
	const appearances = useStageAppearances(drawn, departure.leaving);
	const look = useKindLook(appearances);
	const { goTo } = narrative;
	const onReadBeat = useCallback(
		(walkthrough: string, beat: number): void => {
			choose(walkthrough);
			goTo(beat);
		},
		[choose, goTo],
	);
	// The stage fits the subject, not the About page or the code warning that
	// asks: the page goes as the diagram comes back, and a subject the view on
	// screen does not draw is fitted only once the whole board's picture arrives.
	const fitSubject = useSubjectFocus(render.data, camera, reducedMotion, onChooseView);
	const onShow = useCallback(
		(id: string): void => {
			onPick(id);
			onTab("diagram");
			fitSubject(id);
		},
		[onPick, onTab, fitSubject],
	);
	// A step through a design question's answer brings its subject in with what
	// calls it and what it calls, as showing a part brings the part in.
	const content = contentOf(reading);
	const onStep = useCallback(
		(step: QuestionStep | null): void => {
			onChooseQuestion(step);
			if (step === null || content === null) return;
			onTab("diagram");
			fitSubject(step.at, aroundStep(content, step.at));
		},
		[onChooseQuestion, content, onTab, fitSubject],
	);
	const { onOpenDown, onBackTo } = useDrillMoves({
		drill,
		flier: dive,
		leave: departure.leave,
		picked: props.selection,
		ownView: props.view,
		onLeave: leavePick,
		onUserChanged,
	});

	return (
		<SemanticStageView
			{...stage}
			comparison={comparison}
			onComparisonChange={onComparisonChange}
			camera={camera}
			render={render}
			onRetry={onRetry}
			drill={drill}
			onPick={onPick}
			onPickInPicture={onPickInPicture}
			onOpenDown={onOpenDown}
			onBackTo={onBackTo}
			cut={dive.cut}
			leaving={departure.leaving}
			sidebar={sidebar}
			appearances={appearances}
			look={look}
			tab={tab}
			onTab={onTab}
			place={place}
			onReadBeat={onReadBeat}
			onShow={onShow}
			attachPicture={attachPicture}
			heading={departure.heading}
			narrative={narrative}
			presented={presented}
			narration={props.narration}
			overlay={props.overlay}
			level={level}
			reading={reading}
			focus={focus}
			missing={missing}
			onCloseNarrative={onCloseNarrative}
			onChooseView={onChooseView}
			onChooseWalkthrough={choose}
			groups={groups}
			groupControls={groupControls}
			group={group}
			onChooseGroup={onChooseGroup}
			question={question}
			onChooseQuestion={onStep}
		/>
	);
});

export { SemanticBoardStage, type SemanticBoardStageProps };
