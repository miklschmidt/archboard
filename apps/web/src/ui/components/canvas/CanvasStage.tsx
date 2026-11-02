// One pane showing one legacy board, read-only.
//
// A pane can be in four states, and each is its own piece of news rather than
// one placeholder with a flag on it:
//
//   loading  the server has not answered yet and there is nothing to show;
//   empty    the model is there and has nothing on it;
//   error    the model could not be drawn and there is nothing to show;
//   stale    a picture is on screen and the read since then failed.
//
// A failed refresh keeps the last picture with a disclosure and retry. Query
// owns fetched state; the pane owns camera and selection across requests (ADR 0023).

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useCallback, useMemo, useRef, useState, type JSX, type ReactNode } from "react";

import type { CodeBinding } from "@archboard/code-binding/bindings";
import { usePaneChrome } from "#ui/hooks/canvas/use-pane-chrome.ts";
import type { SemanticDrawing, SemanticRender } from "#ui/clients/canvas/reads/drawings.ts";
import type { CrumbPlace } from "#ui/components/canvas/PaneHeader.tsx";
import { SemanticStageView } from "#ui/components/canvas/SemanticStageView.tsx";
import { useAutoFit } from "#ui/hooks/canvas/use-auto-fit.ts";
import { usePictureCamera } from "#ui/hooks/canvas/use-picture-camera.ts";
import { SIDEBAR_WIDTH } from "@archboard/renderer/shell-geometry";
import { useClearOfPanel } from "#ui/hooks/canvas/use-clear-of-panel.ts";
import { useDeparture } from "#ui/hooks/canvas/use-departure.ts";
import { useDive, type Destination } from "#ui/hooks/canvas/use-dive.ts";
import { useDrillDown, type Dive } from "#ui/hooks/canvas/use-drill-down.ts";
import { useDrillMoves } from "#ui/hooks/canvas/use-drill-moves.ts";
import { useKindLook } from "#ui/hooks/canvas/use-kind-look.ts";
import { useLayoutEngine } from "#ui/hooks/canvas/use-layout-engine.ts";
import { useLevelReading } from "#ui/hooks/canvas/use-level-reading.ts";
import { usePicking } from "#ui/hooks/canvas/use-picking.ts";
import { usePresentationPosition } from "#ui/hooks/canvas/use-presentation-position.ts";
import { useReported } from "#ui/hooks/canvas/use-reported-reading.ts";
import { useReveal } from "#ui/hooks/canvas/use-reveal.ts";
import { useModelChanges } from "#ui/hooks/canvas/use-model-changes.ts";
import { useSettledFocus } from "#ui/hooks/canvas/use-settled-focus.ts";
import { useSidebar } from "#ui/hooks/canvas/use-sidebar.ts";
import { useStageAppearances } from "#ui/hooks/canvas/use-stage-appearances.ts";
import { useSubjectFocus } from "#ui/hooks/canvas/use-subject-focus.ts";
import { useVariantReading } from "#ui/hooks/canvas/use-variant-reading.ts";
import { useWalkthrough, type DrivenPlace } from "#ui/hooks/canvas/use-walkthrough.ts";
import type { SemanticPaneReading } from "#ui/rules/canvas/reading/address.ts";
import type { SelectedSubject } from "#ui/rules/canvas/reading/document.ts";
import type { WalkthroughNarration } from "#ui/rules/canvas/walkthrough/narration.ts";
import { retainedListingQuery, semanticRenderQuery } from "#ui/clients/canvas/reads/queries.ts";
import { usePaneVault } from "#ui/hooks/canvas/use-pane-vault.ts";
import type { WalkthroughBeatSchema } from "@archboard/model/content";
import type { z } from "zod";
import type { SemanticPaneContextSchema } from "@archboard/model/pane-context";

type SemanticPanePart = NonNullable<z.infer<typeof SemanticPaneContextSchema>["byUser"]>[number];
type WalkthroughBeat = z.infer<typeof WalkthroughBeatSchema>;

/** Inputs for a semantic pane. */
interface CanvasStageProps {
	/** The model name, as the address names it. */
	model: string;
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
	/** A variant id or name; the model's current variant when absent. */
	variant?: string | undefined;
	/**
	 * Which time the pane has been pointed at a model, when the shell counts. A
	 * new count leaves a drill-down even when the model and the variant did not
	 * change: the pane was pointed back at the model it was opened on.
	 */
	arrival?: number | undefined;
	/**
	 * Which of the model's named views to read it through, or nothing for the
	 * whole variant. Reading is not writing: this changes what the pane asks the
	 * server to draw and touches no model.
	 */
	view?: string | undefined;
	/**
	 * The person chose a different way of reading this variant.
	 *
	 * Owned above the stage, because the choice belongs in the address: two
	 * panes can read one model two ways, and a reload keeps both.
	 * @param view The view's id, or null for the whole variant.
	 */
	onViewChange?: ((view: string | null) => void) | undefined;
	/**
	 * What this pane is actually reading, whenever that changes.
	 *
	 * The pane's address says what it was opened on; this says what is on
	 * screen. Following a drill-down puts another model there, at a variant the
	 * address never named, and a beat of a walkthrough reads its variant through
	 * a view nobody chose. Anything the shell does on the pane's behalf — saying
	 * what an agent is looking at, opening the code a subject is bound to,
	 * reporting what was picked out — is about the model on screen, and only the
	 * pane knows which one that is.
	 * @param reading The model, variant, view and selection on screen.
	 */
	onReading?: ((reading: SemanticPaneReading) => void) | undefined;
	/** The selected semantic id, or null for none. */
	selection: string | null;
	/**
	 * The person picked a subject out, or cleared the selection.
	 * @param id The semantic id, or null.
	 */
	onSelect: (id: string | null, subject?: SelectedSubject) => void;
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
	 * The models above one, outermost first, as the navigator places them, each
	 * a way to it in this pane: the header's breadcrumb.
	 * @param board The model on screen.
	 * @returns The models above it.
	 */
	placeOf?: ((model: string) => readonly CrumbPlace[]) | undefined;
	/**
	 * Show a model of another vault in this pane: a drill-down into another
	 * repository, or back along a trail that came from one (ADR 0050). Without
	 * it, such a drill-down opens nothing.
	 */
	onDive?: Dive | undefined;
	/**
	 * Whether the person asked for reduced motion.
	 *
	 * Passed in rather than read here: the shell owns that preference through
	 * its own `useReducedMotion`, and a module does not reach into another
	 * module's hooks. The surface also carries `motion-reduce:` as the belt.
	 */
	reducedMotion?: boolean | undefined;
}

const NO_EDGES: readonly never[] = Object.freeze([]);

/**
 * How wide this stage's panel is, which a picture's area never narrows.
 * @returns Its width.
 */
function sidebarWidth(): number {
	return SIDEBAR_WIDTH;
}

/**
 * The relationships of the variant on screen.
 * @param reading What the model says about it, when that is known.
 * @returns Its relationships, or none.
 */
function drawnEdges(reading: ReturnType<typeof useVariantReading>) {
	return reading?.variant?.content.edges ?? NO_EDGES;
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
 * The answer, when it is a picture.
 * @param answer What the render query holds, if anything.
 * @returns The drawing, or null when there is not one to look at.
 */
function drawingIn(answer: SemanticRender | undefined): SemanticDrawing | null {
	return answer?.kind === "drawn" ? answer : null;
}

/**
 * A read-only legacy board in one pane.
 *
 * The shell's parts of the pane's header change with every piece of news about
 * the pane: who holds the model, what an agent says it is doing, whether the
 * socket is up. The header reads them for itself. The reading needs only to
 * know whether another pane shares the centre, so news about anything else
 * draws none of it again (TASK-385.05).
 * @param props The model, the variant, the selection and the pick.
 * @returns Whichever of the four states is true.
 */
function CanvasStage(props: CanvasStageProps): JSX.Element {
	const { shared } = usePaneChrome();
	return <DocumentReading {...props} resting={shared} />;
}

/** Inputs for the reading of a pane's model. */
interface DocumentReadingProps extends CanvasStageProps {
	/** Whether the sidebar stays away unless the person docks it: while two panes share the centre. */
	readonly resting: boolean;
}

/**
 * The reading of the model in one pane: its state, and what it draws.
 * @param props The pane's inputs, and whether another pane shares the centre.
 * @returns Whichever of the four states is true.
 */
const DocumentReading = memo(function DocumentReading(props: DocumentReadingProps): JSX.Element {
	const { resting, ...stage } = props;
	const { model, variant, onSelect, onUserChanged } = props;
	const [comparison, onComparisonChange] = useState(true);
	const vault = usePaneVault();
	const repository = useQuery(retainedListingQuery(vault)).data?.repository ?? null;
	const drill = useDrillDown(
		{ model, variant, arrival: props.arrival, vault, repository },
		props.onDive,
	);
	// How the model on screen is read: the shell's answer for the pane's own
	// model, and this pane's own for a level somebody drilled into, where there
	// is no address to hold it and the ids from the level above mean nothing.
	const level = useLevelReading(drill, {
		view: props.view,
		onView: props.onViewChange,
		onUserChanged,
	});
	// The explanations belong to the model on screen, so drilling into another
	// one closes whatever was being read: the beats were about a different
	// architecture.
	const reading = useVariantReading(drill.model, level.variant);
	const narrative = useWalkthrough(
		{ model: drill.model, variant: level.variant },
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
			model: drill.model,
			variant: level.variant,
			view: viewToRead(narrative.beat, level.view),
			comparison,
			layout,
		}),
	);
	// The model on screen, not the pane's own: a change to the model somebody is
	// actually reading is the one that has to reach them.
	useModelChanges(vault, drill.model);

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
	const camera = usePictureCamera(reducedMotion);
	// The picture's area, which a flight over the picture and a panel laid over its edge both look inside.
	const picture = useRef<HTMLDivElement | null>(null);
	const attachPicture = useCallback((element: HTMLDivElement | null): void => {
		picture.current = element;
	}, []);
	const client = useQueryClient();
	const drawForDive = useCallback(
		async (to: Destination): Promise<SemanticDrawing | null> =>
			drawingIn(await client.fetchQuery(semanticRenderQuery({ ...to, vault, comparison, layout }))),
		[client, vault, comparison, layout],
	);
	const dive = useDive({
		camera,
		area: picture,
		drawn,
		draw: drawForDive,
		reducedMotion,
		presenting: narrative.open !== null,
	});
	const fitPicture = useMemo(
		() => (drawn === null ? null : JSON.stringify([drawn.model, drawn.variant.id, drawn.view?.id])),
		[drawn],
	);
	useAutoFit(camera, drawn, focus, {
		picture: fitPicture,
		presenting: narrative.open !== null,
		reducedMotion,
		cut: dive.cut,
	});
	// A subject is named to a reader by its name. Which ones the picture could
	// not find is settled against the atlas; what to call them is the model's.
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

	const { onPick, onChooseGroup, groupControls, groups, group } = usePicking({
		model: drill.model,
		reading,
		presenting: narrative.open !== null,
		choose,
		onSelect,
	});
	useReported(props.onReading, {
		model: drill.model,
		answer: render.data,
		view: viewToRead(narrative.beat, level.view),
		selection: props.selection,
		presentation: presented.position,
	});

	const { refetch } = render;
	const onRetry = useCallback((): void => {
		void refetch();
	}, [refetch]);
	// A selection names a subject of the model it was made on, so moving between
	// levels clears it rather than carrying an id to a model that never had it.
	//
	// Which way the reader went is said first, so the picture being left knows
	// how to leave: into the card that was picked, or back out.
	const departure = useDeparture(drawn, drill.model, render);
	// Two panes rest their sidebars, so each picture has the room (use-sidebar.ts).
	const sidebar = useSidebar(props.selection, resting, narrative.open !== null);
	useClearOfPanel(picture, sidebar.floating, props.selection, camera, reducedMotion, sidebarWidth);
	const onPickInPicture = useReveal({
		camera,
		atlas: drawn?.atlas ?? null,
		edges: drawnEdges(reading),
		selection: props.selection,
		off: narrative.open !== null || sidebar.floating,
		reducedMotion,
		onPick,
	});
	const { appearances, legend } = useStageAppearances(drawn, departure.leaving);
	const look = useKindLook(appearances);
	// The stage fits the subject, not the code warning that asks: a subject the
	// view on screen does not draw is fitted only once the whole model's picture
	// arrives.
	const fitSubject = useSubjectFocus(render.data, camera, reducedMotion, onChooseView);
	const onShow = useCallback(
		(id: string): void => {
			onPick(id);
			fitSubject(id);
		},
		[onPick, fitSubject],
	);
	const { onOpenDown, onBackTo } = useDrillMoves({
		drill,
		flier: dive,
		leave: departure.leave,
		picked: props.selection,
		ownView: props.view,
		onSelect,
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
			pictureLegend={legend}
			look={look}
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
		/>
	);
});

export { CanvasStage, type CanvasStageProps };
