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

import { useAutoFit } from "@/ui/semantic-board-canvas/hooks/use-auto-fit";
import type { BoardCamera } from "@/ui/semantic-board-canvas/hooks/use-board-camera";
import { SemanticStanding } from "@/ui/semantic-board-canvas/components/SemanticStanding";
import type { SemanticPaneReading } from "@/ui/semantic-board-canvas/lib/address";
import type { SelectedSubject } from "@/ui/semantic-board-canvas/lib/board-document";
import type { CodeBinding } from "@/shared/code-target";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, type JSX, type ReactNode } from "react";

import type { WalkthroughBeat } from "@/shared/semantic-board/index";
import type {
	SemanticDrawing,
	SemanticRender,
	SemanticTheme,
	SemanticWaiting,
} from "@/ui/semantic-board-canvas/api/semantic-boards";
import { SemanticDiagram } from "@/ui/semantic-board-canvas/components/SemanticDiagram";
import { SemanticNarrative } from "@/ui/semantic-board-canvas/components/SemanticNarrative";
import { SemanticVariantBar } from "@/ui/semantic-board-canvas/components/SemanticVariantBar";
import { SemanticViewBar } from "@/ui/semantic-board-canvas/components/SemanticViewBar";
import { SemanticWalkthroughBar } from "@/ui/semantic-board-canvas/components/SemanticWalkthroughBar";
import { SemanticRefreshFailure } from "@/ui/semantic-board-canvas/components/SemanticRefreshFailure";
import { SemanticTrail } from "@/ui/semantic-board-canvas/components/SemanticTrail";
import {
	SemanticStageEmpty,
	SemanticStageLoading,
	SemanticStageProblem,
} from "@/ui/semantic-board-canvas/components/SemanticStageStates";
import {
	useDrillDown,
	type DrillNavigation,
} from "@/ui/semantic-board-canvas/hooks/use-drill-down";
import { useSemanticBoardChanges } from "@/ui/semantic-board-canvas/hooks/use-semantic-board-changes";
import {
	useLevelReading,
	type PaneReading,
} from "@/ui/semantic-board-canvas/hooks/use-level-reading";
import { useVariantReading } from "@/ui/semantic-board-canvas/hooks/use-variant-reading";
import {
	useWalkthrough,
	type WalkthroughReading,
} from "@/ui/semantic-board-canvas/hooks/use-walkthrough";
import type { VariantReading } from "@/ui/semantic-board-canvas/lib/board-document";
import { beatFocus, type BeatFocus } from "@/ui/semantic-board-canvas/lib/narrative";
import { semanticRenderQuery } from "@/ui/semantic-board-canvas/lib/queries";

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
	 * Which of the board's named views to read it through, or nothing for the
	 * whole variant. Reading is not writing: this changes what the pane asks the
	 * server to draw and touches no board.
	 */
	view?: string | undefined;
	/** Which palette the server should draw in; the shell owns the choice. */
	theme?: SemanticTheme | undefined;
	/**
	 * The person chose a different way of reading this variant.
	 *
	 * Owned above the stage, because the choice belongs in the address: two
	 * panes can read one board two ways, and a reload keeps both.
	 * @param view The view's id, or null for the whole variant.
	 */
	onViewChange?: ((view: string | null) => void) | undefined;
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
	 * Whether the person asked for reduced motion.
	 *
	 * Passed in rather than read here: the shell owns that preference through
	 * its own `useReducedMotion`, and a module does not reach into another
	 * module's hooks. The surface also carries `motion-reduce:` as the belt.
	 */
	reducedMotion?: boolean | undefined;
}

/** What the view is assembled from. */
interface RenderView extends SemanticBoardStageProps {
	/** Camera retained while a different variant is being drawn. */
	readonly camera: BoardCamera;
	/** The cache's answer for this board, variant and theme. */
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
	/** What this variant explains about itself, and what is being read. */
	readonly narrative: WalkthroughReading;
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
 * @returns The view id to ask for, or undefined for the whole variant.
 */
function viewToRead(beat: WalkthroughBeat | null, asked: string | undefined): string | undefined {
	return beat?.view ?? asked;
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
 * Offer the board's shared views at the level currently being read.
 * @param view What the stage is assembled from.
 * @param answer The render the server gave, or undefined before one has.
 * @returns The bar, or null when there is no choice to offer here.
 */
function viewBar(view: RenderView, answer: SemanticRender | undefined): ReactNode {
	const choose = view.level.onView;
	if (answer === undefined || choose === undefined) {
		return null;
	}
	return (
		<SemanticViewBar views={answer.views} showing={answer.view} onChoose={view.onChooseView} />
	);
}

/**
 * The bar that offers the board's other states.
 *
 * A board's variants are the board's, not a view's: the pane's own board again,
 * and absent while somebody is a level down, where the family belongs to a
 * different board and choosing from it would quietly change what the way back
 * leads to.
 * @param view What the stage is assembled from.
 * @returns The bar, or null when there is no choice to offer here.
 */
function variantBar(view: RenderView): ReactNode {
	const { reading } = view;
	const choose = view.level.onVariant;
	if (choose === undefined || reading === null) {
		return null;
	}
	return (
		<SemanticVariantBar
			variants={reading.variants}
			showing={reading.showing?.id ?? null}
			onChoose={choose}
		/>
	);
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
 * The bar that offers this variant’s explanations of itself.
 *
 * One place decides whether a variant that explains itself nowhere is offered
 * anything, and this is it: the strip asks this, rather than the count, so that
 * there is one answer rather than two that can drift apart.
 * @param view What the stage is assembled from.
 * @returns The bar, or null when the variant states no walkthrough.
 */
function walkthroughBar(view: RenderView): ReactNode {
	const { narrative } = view;
	if (narrative.offered.length === 0) {
		return null;
	}
	return (
		<SemanticWalkthroughBar
			walkthroughs={narrative.offered}
			open={narrative.open?.id ?? null}
			onChoose={narrative.choose}
		/>
	);
}

/**
 * The hairline between two groups of the strip, when both are there.
 * @param between Whether there are two groups to separate.
 * @returns The rule, or null when there is nothing to divide.
 */
function divider(between: boolean): ReactNode {
	return between ? <span aria-hidden="true" className="bg-border mx-1 h-5 w-px" /> : null;
}

/**
 * The strip above the diagram: the states of this architecture, the ways this
 * variant can be read, and the explanations it gives of itself.
 *
 * One strip rather than two, because both are the same question — how is this
 * board being read — and a second rule across the pane for the second half of
 * it would be a line drawn where there is no difference. It is absent when the
 * board offers no alternate reading.
 *
 * The explanations are offered in every state, including while the server is
 * drawing. A beat may be told through a view, so moving to one asks for a
 * different picture; if the rail went away while that picture was being drawn,
 * the reader's place would go with it.
 * @param view What the stage is assembled from.
 * @returns The strip, or null when there is nothing to offer.
 */
function readingBar(view: RenderView): ReactNode {
	const views = viewBar(view, view.render.data);
	const variants = variantBar(view);
	const walkthroughs = walkthroughBar(view);
	if (views === null && variants === null && walkthroughs === null) {
		return null;
	}
	return (
		<div
			data-slot="semantic-reading-bar"
			className="border-border bg-background flex shrink-0 items-center gap-1 border-b px-3 py-1.5"
		>
			{variants}
			{divider(variants !== null && views !== null)}
			{views}
			{walkthroughs}
		</div>
	);
}

/**
 * The explanation being read, beside the picture.
 * @param view What the stage is assembled from.
 * @returns The rail, or null when nobody is reading one.
 */
function narrativeRail(view: RenderView): ReactNode {
	const { narrative } = view;
	if (narrative.open === null) {
		return null;
	}
	return (
		<SemanticNarrative
			walkthrough={narrative.open}
			beatIndex={narrative.beatIndex}
			missing={view.missing}
			onBeat={narrative.goTo}
			onClose={view.onCloseNarrative}
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
	const board = view.drill.board;
	// Nothing has ever arrived: this is the only case where a failure takes the
	// whole pane, because there is nothing behind it to keep showing.
	if (render.data === undefined) {
		return render.error === null ? (
			<SemanticStageLoading board={board} />
		) : (
			<SemanticStageProblem board={board} error={render.error} />
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
			reducedMotion={view.reducedMotion ?? false}
			stale={notice !== null}
			notice={notice}
			onOpenDown={view.onOpenDown}
			onOpenCode={view.onOpenCode}
			focus={view.focus}
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
 * The whole pane: the way back, the ways of reading, and the reading itself.
 * @param view The board, the query's answer, the selection and the retry.
 * @returns The stage.
 */
function renderedView(view: RenderView): JSX.Element {
	return (
		<>
			{/* The way back belongs to the pane, not to the picture. It is drawn in
			    every state, because the states somebody most needs it in are the
			    ones with no diagram: drilling into a board that is empty, or
			    unreadable, or still loading, and finding that the only way back went
			    with the picture would leave them stuck on a board they cannot
			    leave. */}
			<SemanticTrail trail={view.drill.trail} board={view.drill.board} onBack={view.onBack} />
			{readingBar(view)}
			{/* Coherent and out of step: a picture cannot say that by itself, and
			    drawn plainly it looks settled — which is the one impression it must
			    not give. */}
			<SemanticStanding
				waiting={waitingOn(view.render.data)}
				nameOf={view.narrative.nameOf}
				variantNameOf={variantNamer(view)}
			/>
			{/* The explanation is read beside the picture, in reading order: the
			    words on the left, what they are about on the right, and — when
			    somebody picks a card out of it — what the board says about that
			    card on the far right. */}
			<div className="flex min-h-0 min-w-0 flex-1">
				{narrativeRail(view)}
				{stageBody(view)}
			</div>
		</>
	);
}

/**
 * Tell whoever is listening what this pane is reading, when it changes.
 *
 * Only when it changes. A pane re-renders for every hover and every camera
 * move, and a shell told the same four values sixty times a second would
 * publish sixty identical readings for anybody downstream to filter.
 * @param report Who to tell, when anybody is listening.
 * @param reading What the pane is reading now.
 */
function useReported(
	report: ((reading: SemanticPaneReading) => void) | undefined,
	reading: SemanticPaneReading,
): void {
	const { board, variant, view, selection, drawn } = reading;
	useEffect(() => {
		report?.({ board, variant, view, selection, drawn });
	}, [report, board, variant, view, selection, drawn]);
}

/**
 * A read-only semantic board in one pane.
 * @param props The board, the variant, the theme, the selection and the pick.
 * @returns Whichever of the four states is true.
 */
function SemanticBoardStage(props: SemanticBoardStageProps): JSX.Element {
	const { board, variant, onSelect } = props;
	const theme = props.theme ?? "light";
	const drill = useDrillDown(board, variant);
	// How the board on screen is read: the shell's answer for the pane's own
	// board, and this pane's own for a level somebody drilled into, where there
	// is no address to hold it and the ids from the level above mean nothing.
	const level = useLevelReading(drill, {
		view: props.view,
		onView: props.onViewChange,
		onVariant: props.onVariantChange,
	});
	// The explanations belong to the board on screen, so drilling into another
	// one closes whatever was being read: the beats were about a different
	// architecture.
	const reading = useVariantReading(drill.board, level.variant);
	const narrative = useWalkthrough({ board: drill.board, variant: level.variant }, reading);
	// A beat told through a view is read through that view, which is a different
	// picture to ask the server for. It overrides the pane's own choice for as
	// long as that beat is the one being read, and hands it straight back: the
	// narrative decides the reading while somebody is following it, and what the
	// person chose is what they come back to.
	const render = useQuery(
		semanticRenderQuery({
			board: drill.board,
			variant: level.variant,
			view: viewToRead(narrative.beat, level.view),
			theme,
		}),
	);
	// The board on screen, not the pane's own: a change to the board somebody is
	// actually reading is the one that has to reach them.
	useSemanticBoardChanges(drill.board);

	const drawn = drawingIn(render.data);
	const focus = useMemo(() => beatFocus(narrative.beat, drawn), [narrative.beat, drawn]);
	const camera = useAutoFit(drawn, focus);
	// A subject is named to a reader by its name. Which ones the picture could
	// not find is settled against the atlas; what to call them is the board's.
	const { choose, nameOf } = narrative;
	const missing = useMemo(() => focus.undrawn.map(nameOf), [focus, nameOf]);
	const onCloseNarrative = useCallback((): void => {
		choose(null);
	}, [choose]);
	const chooseView = level.onView;
	const onChooseView = useCallback(
		(view: string | null): void => {
			choose(null);
			chooseView?.(view);
		},
		[choose, chooseView],
	);

	// What was picked out is reported as what it is, not only as an id. The pane
	// is the one place that knows: it has the board open and has just drawn the
	// thing. A shell told only "sTn4eQ" would need a second read of the board to
	// tell a step from the flow that holds it, or to say out loud what a person
	// just clicked on.
	const held = reading?.subject;
	const onPick = useCallback(
		(id: string | null): void => {
			onSelect(id, id === null || held === undefined ? undefined : held(id));
		},
		[held, onSelect],
	);

	// Empty views retain their resolved identity for the pane and its address.
	const answer = render.data;
	const identity = useMemo(
		() =>
			answer === undefined
				? null
				: { variant: answer.variant, view: answer.view, version: answer.version },
		[answer],
	);
	useReported(props.onReading, {
		board: drill.board,
		// The variant the server resolved, not the one that was asked for: the
		// pane asks for "whichever is current" constantly, and "current" is not
		// something a shell can hand to anybody as what is being looked at.
		variant: answer?.variant.id ?? null,
		view: viewToRead(narrative.beat, level.view) ?? null,
		selection: props.selection,
		drawn: identity,
	});

	const { refetch } = render;
	const onRetry = useCallback((): void => {
		void refetch();
	}, [refetch]);
	// A selection names a subject of the board it was made on, so moving between
	// levels clears it rather than carrying an id to a board that never had it.
	const onOpenDown = useCallback(
		(target: string, asked: string): void => {
			onSelect(null);
			drill.open(target, asked);
		},
		[drill, onSelect],
	);
	const onBack = useCallback((): void => {
		onSelect(null);
		drill.back();
	}, [drill, onSelect]);

	return renderedView({
		...props,
		camera,
		render,
		onRetry,
		drill,
		onPick,
		onOpenDown,
		onBack,
		narrative,
		level,
		reading,
		focus,
		missing,
		onCloseNarrative,
		onChooseView,
	});
}

export { SemanticBoardStage, type SemanticBoardStageProps };
