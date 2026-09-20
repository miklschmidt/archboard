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
import { useCallback, useEffect, useMemo, useState, type JSX, type ReactNode } from "react";

import type { WalkthroughBeat } from "@/shared/semantic-board/index";
import type {
	SemanticDrawing,
	SemanticRender,
	SemanticTheme,
	SemanticWaiting,
} from "@/ui/semantic-board-canvas/api/semantic-boards";
import { SemanticDiagram } from "@/ui/semantic-board-canvas/components/SemanticDiagram";
import {
	ReadingArea,
	pictureMarks,
	presentationOver,
} from "@/ui/semantic-board-canvas/components/SemanticStagePresentation";
import { SemanticStageSidebar } from "@/ui/semantic-board-canvas/components/SemanticStageSidebar";
import { SemanticRefreshFailure } from "@/ui/semantic-board-canvas/components/SemanticRefreshFailure";
import { SemanticTrail } from "@/ui/semantic-board-canvas/components/SemanticTrail";
import {
	SemanticStageEmpty,
	SemanticStageProblem,
} from "@/ui/semantic-board-canvas/components/SemanticStageStates";
import { waitingStage } from "@/ui/semantic-board-canvas/components/SemanticStageWaiting";
import {
	useDrillDown,
	type DrillNavigation,
} from "@/ui/semantic-board-canvas/hooks/use-drill-down";
import type { GroupControls } from "@/ui/semantic-board-canvas/components/SemanticInspectorParts";
import { useDeparture, type Leaving } from "@/ui/semantic-board-canvas/hooks/use-departure";
import type { Departure } from "@/ui/semantic-board-canvas/lib/picture-departure";
import { useGroupInspection } from "@/ui/semantic-board-canvas/hooks/use-group-focus";
import { useSettledFocus } from "@/ui/semantic-board-canvas/hooks/use-settled-focus";
import { useSidebar, type Sidebar } from "@/ui/semantic-board-canvas/hooks/use-sidebar";
import { useStageAppearances } from "@/ui/semantic-board-canvas/hooks/use-stage-appearances";
import type { AppliedAppearance } from "@/ui/semantic-board-canvas/lib/appearance";
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
import type { GroupChoice, GroupFocus } from "@/ui/semantic-board-canvas/lib/groups";
import type { BeatFocus } from "@/ui/semantic-board-canvas/lib/narrative";
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
	/** Whether the canvas shows comparison marks and removed context. */
	readonly comparison: boolean;
	/** Change this pane's comparison display. */
	readonly onComparisonChange: (enabled: boolean) => void;
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
	/** The last board's picture, on its way out while this one is drawn; null otherwise. */
	readonly leaving: Leaving | null;
	/** Where the reader went from the last board, until this board's picture is up; null otherwise. */
	readonly heading: Departure | null;
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
	/** Read an explanation, leaving any group inspection behind. */
	readonly onChooseWalkthrough: (walkthrough: string | null) => void;
	/** Every group the variant on screen uses. */
	readonly groups: readonly GroupChoice[];
	/** How the inspector names memberships and inspects one. */
	readonly groupControls: GroupControls;
	/** The group under inspection, read against the picture, or null. */
	readonly groupFocus: GroupFocus | null;
	/** Inspect a group, leaving any guided reading behind; null to stop. */
	readonly onChooseGroup: (group: string | null) => void;
	/** The sidebar's tab and collapse state. */
	readonly sidebar: Sidebar;
	/** What the picture on screen draws each kind with, for the key and the inspector. */
	readonly appearances: ReadonlyMap<string, AppliedAppearance>;
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
			reducedMotion={view.reducedMotion ?? false}
			stale={notice !== null}
			notice={notice}
			focus={view.focus}
			{...pictureMarks(view)}
			heading={view.heading}
			presenting={view.narrative.open === null ? null : view.narrative.beatIndex}
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
			{/* Coherent and out of step: a picture cannot say that by itself, and
			    drawn plainly it looks settled — which is the one impression it must
			    not give. */}
			<SemanticStanding
				waiting={waitingOn(view.render.data)}
				nameOf={view.narrative.nameOf}
				variantNameOf={variantNamer(view)}
			/>
			{/* Read left to right: the board and whatever is selected on it, then the
			    picture — with a presented walkthrough's caption over it, while the
			    sidebar steps aside. */}
			<ReadingArea presenting={view.narrative.open !== null}>
				<SemanticStageSidebar view={view} appearances={view.appearances} />
				<div className="relative flex min-h-0 min-w-0 flex-1">
					{stageBody(view)}
					{presentationOver(view)}
				</div>
			</ReadingArea>
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
	const [comparison, onComparisonChange] = useState(true);
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
			comparison,
		}),
	);
	// The board on screen, not the pane's own: a change to the board somebody is
	// actually reading is the one that has to reach them.
	useSemanticBoardChanges(drill.board);

	const drawn = drawingIn(render.data);
	const focus = useSettledFocus(narrative.beat, drawn, viewToRead(narrative.beat, level.view));
	const camera = useAutoFit(drawn, focus, {
		presenting: narrative.open !== null,
		reducedMotion: props.reducedMotion,
	});
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

	// Which group is under inspection is this pane's, kept on the board and the
	// resolved variant it was chosen on: a walk into another board, or to another
	// state of this one, drops it, while a change of view keeps it. Inspecting a
	// group and following an explanation are two readings of one picture that
	// each decide what is lit, so choosing one lets go of the other; picking a
	// subject out is fine under either.
	const source = useMemo(
		() => ({ board: drill.board, variant: reading === null ? null : reading.variant, drawn }),
		[drill.board, reading, drawn],
	);
	const inspecting = useGroupInspection(source);
	const chooseGroup = inspecting.choose;
	const onChooseGroup = useCallback(
		(group: string | null): void => {
			if (group !== null) {
				choose(null);
			}
			chooseGroup(group);
		},
		[choose, chooseGroup],
	);
	const onChooseWalkthrough = useCallback(
		(walkthrough: string | null): void => {
			if (walkthrough !== null) {
				chooseGroup(null);
			}
			choose(walkthrough);
		},
		[choose, chooseGroup],
	);
	const groupControls = useMemo(
		() => ({
			names: inspecting.names,
			inspecting: inspecting.focus === null ? null : inspecting.focus.group,
			onChoose: onChooseGroup,
		}),
		[inspecting.names, inspecting.focus, onChooseGroup],
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
	//
	// Which way the reader went is said first, so the picture being left knows
	// how to leave: into the card that was picked, or back out.
	const departure = useDeparture(drawn, drill.board, render);
	const sidebar = useSidebar(props.selection);
	const appearances = useStageAppearances(drawn, departure.leaving);
	const { leave } = departure;
	const picked = props.selection;
	const onOpenDown = useCallback(
		(target: string, asked: string): void => {
			leave("into", picked);
			onSelect(null);
			drill.open(target, asked);
		},
		[drill, leave, onSelect, picked],
	);
	const onBack = useCallback((): void => {
		leave("out");
		onSelect(null);
		drill.back();
	}, [drill, leave, onSelect]);

	return renderedView({
		...props,
		comparison,
		onComparisonChange,
		camera,
		render,
		onRetry,
		drill,
		onPick,
		onOpenDown,
		onBack,
		leaving: departure.leaving,
		sidebar,
		appearances,
		heading: departure.heading,
		narrative,
		level,
		reading,
		focus,
		missing,
		onCloseNarrative,
		onChooseView,
		onChooseWalkthrough,
		groups: inspecting.choices,
		groupControls,
		groupFocus: inspecting.focus,
		onChooseGroup,
	});
}

export { SemanticBoardStage, type SemanticBoardStageProps };
