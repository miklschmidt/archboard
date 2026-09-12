// Painting a message sequence: the frame, then the columns of time, then the
// cards at their heads, then the messages crossing between them.
//
// Forked from PR Lens's `svg/dataflow.ts`. The animation went — the pulses, the
// shared cycle and the slot schedule are all motion, and motion in a walkthrough
// belongs to the viewer (ADR 0023) — and with it the manifest and the delta
// tones. What arrived in their place is the same identity and selection
// machinery the architecture grammar carries, so a pane can hit-test one
// picture the way it hit-tests the other.
//
// The layer order is upstream's and is load-bearing. A lifeline passes behind a
// card; a message passes over a lifeline; and a label plate, opaque precisely so
// that it can be read wherever it lands, passes over everything a message drew.
// Within one message the plate is part of the message's own group rather than a
// layer above all of them, which is safe here in a way it is not in the
// architecture grammar: messages are horizontal runs at fixed pitch, so a plate
// sitting in the air above one run can never reach the run above it.

import type {
	DiagramAtlas,
	MessageKind,
	SemanticFlow,
	SemanticNode,
} from "@/shared/semantic-board/index";
import { BAND_RADIUS, DIAGRAM_MARGIN, PILL_RADIUS } from "@/runtime/semantic-renderer/lib/design";
import {
	ACTIVATION_HALF_WIDTH,
	ACTIVATION_RADIUS,
	LIFELINE_DASH,
	MARKER_INSET,
	SELF_LOOP_CORNER,
	SELF_LOOP_DROP,
	SELF_LOOP_REACH,
} from "@/runtime/semantic-renderer/lib/dataflow-design";
import { atlasBoxes } from "@/runtime/semantic-renderer/lib/atlas";
import { canvasFor, coord, union, type Box } from "@/runtime/semantic-renderer/lib/geometry";
import type { Palette } from "@/runtime/semantic-renderer/lib/theme";
import {
	activationLookup,
	layoutDataFlow,
	type ActiveAt,
	type FlowLayout,
	type PlacedColumn,
	type PlacedStep,
} from "@/runtime/semantic-renderer/lib/layout/dataflow";
import {
	endsFor,
	labelBox,
	selfStart,
	stepBox,
	travelOf,
} from "@/runtime/semantic-renderer/lib/layout/messages";
import { halo, paintCard, paintHeader } from "@/runtime/semantic-renderer/lib/svg/cards";
import { shifted } from "@/runtime/semantic-renderer/lib/svg/document";
import {
	lines,
	tag,
	textNode,
	wrap,
	type Attributes,
} from "@/runtime/semantic-renderer/lib/svg/primitives";
import {
	standingOutline,
	standingPin,
	standingSwipe,
	subjectGroup,
	type StandingOf,
	type SubjectStanding,
} from "@/runtime/semantic-renderer/lib/svg/standing";
import {
	markerFor,
	stylesFor,
	weightColour,
	STROKE_OPACITY,
	STROKE_WIDTH,
	type Head,
	type SvgStyles,
	type Weight,
} from "@/runtime/semantic-renderer/lib/svg/styles";

/** How much wider than its line a message's selection halo is. */
const STEP_HALO_EXTRA = 5;
/** Where a plate's text baseline sits inside it. */
const PILL_BASELINE = 0.68;

/** Every message is drawn at one weight: a flow states no emphasis to vary it by. */
const STEP_WEIGHT: Weight = "normal";

/**
 * What sort of message each kind is, said in dashes.
 *
 * Only the reply is dashed, and that is the whole of the texture grammar here. A
 * sequence is read down the page rather than across it, so a reader tells
 * messages apart by direction and order far more than by line texture; dashing a
 * second kind would cost the dash its one meaning.
 */
const STEP_DASH: Readonly<Record<MessageKind, string | undefined>> = {
	sync: undefined,
	async: undefined,
	self: undefined,
	return: "5 4",
};

/**
 * The arrowhead each message kind ends in.
 *
 * A deliberate deviation from strict UML 2, which draws replies with an open head
 * as well, inherited from PR Lens with its reasoning intact: here the open head is
 * the exclusive mark of "nobody is waiting on this". The dash already says "this
 * is an answer", so an open-headed reply would put the asynchronous signature on
 * every reply and dilute the one distinction the head shape exists to draw.
 */
const STEP_HEAD: Readonly<Record<MessageKind, Head>> = {
	sync: "filled",
	async: "open",
	return: "filled",
	self: "filled",
};

/**
 * How one message's line is stroked.
 * @param kind What the message does.
 * @param palette The theme's colours.
 * @returns The path's attributes.
 */
function stepAttributes(kind: MessageKind, palette: Palette): Attributes {
	return {
		fill: "none",
		stroke: weightColour(palette, STEP_WEIGHT),
		"stroke-width": STROKE_WIDTH[STEP_WEIGHT],
		"stroke-opacity": STROKE_OPACITY[STEP_WEIGHT],
		"stroke-linecap": "round",
		"stroke-linejoin": "round",
		"stroke-dasharray": STEP_DASH[kind],
	};
}

/**
 * A lifeline is the passage of time under a participant, not a connection it
 * has. Dashed and in the faintest ink the ground allows, so that a page of them
 * stays a backdrop rather than competing with the messages crossing it. An
 * activation bar is drawn on the card's own ground, so that it reads as the
 * participant itself standing in its column.
 * @param palette The theme's colours.
 * @returns The two bundles this grammar adds to the shared ones.
 */
function sequenceStyles(palette: Palette): {
	readonly lifeline: Attributes;
	readonly activation: Attributes;
} {
	return {
		lifeline: {
			stroke: palette.edgeMuted,
			"stroke-width": 1,
			"stroke-dasharray": LIFELINE_DASH,
		},
		activation: { fill: palette.card, stroke: palette.cardBorder, "stroke-width": 1 },
	};
}

/**
 * One message's label, on its opaque plate.
 * @param text What the message is.
 * @param box Where the plate goes.
 * @param styles The palette's attribute bundles.
 * @param outline What this step's standing does to the plate's rule, if anything.
 * @returns The plate and its words.
 */
function paintLabel(
	text: string,
	box: Box,
	styles: SvgStyles,
	outline: Readonly<Attributes>,
): string {
	return (
		tag("rect", {
			x: coord(box.x),
			y: coord(box.y),
			width: coord(box.width),
			height: coord(box.height),
			rx: PILL_RADIUS,
			...styles.pill,
			...outline,
		}) +
		textNode(
			{
				x: coord(box.x + box.width / 2),
				y: coord(box.y + box.height * PILL_BASELINE),
				"text-anchor": "middle",
				...styles.pillText,
			},
			text,
		)
	);
}

/**
 * The path a self-message takes: out to the right, down, and back.
 * @param placed The message.
 * @param activated Whether its column is busy at that height.
 * @returns The path's `d`.
 */
function selfPath(placed: PlacedStep, activated: boolean): string {
	const start = selfStart(placed, activated);
	return (
		`M${coord(start)},${coord(placed.y)} h${coord(SELF_LOOP_REACH)} ` +
		`a${SELF_LOOP_CORNER},${SELF_LOOP_CORNER} 0 0 1 ${SELF_LOOP_CORNER},${SELF_LOOP_CORNER} ` +
		`v${coord(SELF_LOOP_DROP)} ` +
		`a${SELF_LOOP_CORNER},${SELF_LOOP_CORNER} 0 0 1 -${SELF_LOOP_CORNER},${SELF_LOOP_CORNER} ` +
		`h-${coord(SELF_LOOP_REACH - MARKER_INSET)}`
	);
}

/**
 * The path one message's line takes, whichever sort of message it is.
 * @param placed The message.
 * @param activeAt Whether a column is busy at a given height.
 * @returns The path's `d`.
 */
function stepPath(placed: PlacedStep, activeAt: ActiveAt): string {
	const direction = travelOf(placed.step.kind, placed.fromX, placed.toX);
	if (direction === 0) {
		return selfPath(placed, activeAt(placed.step.from, placed.y));
	}
	const ends = endsFor(placed, activeAt, direction);
	return `M${coord(ends.start)},${coord(placed.y)} L${coord(ends.end)},${coord(placed.y)}`;
}

/**
 * One message: a halo a viewer can light up, the line itself, and the words the
 * line carries.
 *
 * The label is part of the message rather than a separate thing that happens to
 * sit near it. It goes inside the same group, so a click on the words selects
 * the step and `.is-selected` lights the line and its label together.
 * @param placed The message.
 * @param activeAt Whether a column is busy at a given height.
 * @param palette The theme's colours.
 * @param standing How this step stands against the variant it came from, when the caller said.
 * @returns The message's whole group.
 */
function paintStep(
	placed: PlacedStep,
	activeAt: ActiveAt,
	palette: Palette,
	standing: SubjectStanding | undefined,
): string {
	const styles = stylesFor(palette);
	const path = stepPath(placed, activeAt);
	return wrap(
		"g",
		subjectGroup("step", placed.step.id, standing),
		lines([
			standingSwipe(path, STROKE_WIDTH[STEP_WEIGHT], standing, palette),
			tag("path", {
				class: "ab-halo",
				d: path,
				"stroke-width": STROKE_WIDTH[STEP_WEIGHT] + STEP_HALO_EXTRA,
				"stroke-linecap": "round",
				"stroke-linejoin": "round",
				...styles.halo,
			}),
			tag("path", {
				d: path,
				"marker-end": markerFor(STEP_WEIGHT, STEP_HEAD[placed.step.kind]),
				...stepAttributes(placed.step.kind, palette),
			}),
			paintLabel(
				placed.label,
				labelBox(placed, activeAt),
				styles,
				standingOutline(standing, palette),
			),
		]),
	);
}

/**
 * The strip of page one participant's column of time occupies: its lifeline and
 * every bar on it.
 * @param column The column.
 * @param layout The flow it belongs to.
 * @returns The strip.
 */
function columnStrip(column: PlacedColumn, layout: FlowLayout): Box {
	return {
		x: column.centreX - ACTIVATION_HALF_WIDTH,
		y: layout.lifelineTop,
		width: ACTIVATION_HALF_WIDTH * 2,
		height: layout.lifelineBottom - layout.lifelineTop,
	};
}

/**
 * One participant's column of time: the lifeline under its card, and the bars
 * marking where it is busy.
 *
 * It carries the participant's identity as its card does, so that selecting a
 * participant lights the whole height of the page it is involved in rather than
 * only the card at the top of it. The two groups are siblings rather than nested,
 * because a subject inside another subject is a click a viewer cannot resolve.
 * @param column The column.
 * @param layout The flow it belongs to.
 * @param palette The theme's colours.
 * @param standing How this participant stands against the variant it came from, when the caller said.
 * @returns The column's group.
 */
function paintColumn(
	column: PlacedColumn,
	layout: FlowLayout,
	palette: Palette,
	standing: SubjectStanding | undefined,
): string {
	const styles = stylesFor(palette);
	const own = sequenceStyles(palette);
	// The lifeline takes the standing's ink but keeps its own dash, which is this
	// grammar's signature for the passage of time rather than a kind of anything.
	// It is what makes a participant's standing read all the way down the page
	// instead of only at the card on top of it.
	const ink = standingOutline(standing, palette)["stroke"];
	return wrap(
		"g",
		subjectGroup("node", column.card.node.id, standing),
		lines([
			halo(columnStrip(column, layout), ACTIVATION_RADIUS, styles),
			tag("line", {
				x1: coord(column.centreX),
				y1: coord(layout.lifelineTop),
				x2: coord(column.centreX),
				y2: coord(layout.lifelineBottom),
				...own.lifeline,
				stroke: ink ?? own.lifeline["stroke"],
			}),
			...column.activations.map((bar) =>
				tag("rect", {
					x: coord(column.centreX - ACTIVATION_HALF_WIDTH),
					y: coord(bar.top),
					width: ACTIVATION_HALF_WIDTH * 2,
					height: coord(bar.bottom - bar.top),
					rx: ACTIVATION_RADIUS,
					...own.activation,
				}),
			),
		]),
	);
}

/**
 * The frame around one flow, with the flow's name and summary on it.
 *
 * A flow is the one subject of this grammar that has no counterpart in the
 * architecture one, and the frame is what makes it a subject at all: it is what
 * a reader clicks to mean "this exchange", and it is what keeps several flows on
 * one page from reading as one very long sequence.
 * @param layout The flow.
 * @param palette The theme's colours.
 * @param standing How this flow stands against the variant it came from, when the caller said.
 * @returns The frame's group.
 */
function paintFrame(
	layout: FlowLayout,
	palette: Palette,
	standing: SubjectStanding | undefined,
): string {
	const styles = stylesFor(palette);
	return wrap(
		"g",
		subjectGroup("flow", layout.flow.id, standing),
		lines([
			halo(layout.frame, BAND_RADIUS, styles),
			tag("rect", {
				x: coord(layout.frame.x),
				y: coord(layout.frame.y),
				width: coord(layout.frame.width),
				height: coord(layout.frame.height),
				rx: BAND_RADIUS,
				...styles.band,
				...standingOutline(standing, palette),
			}),
			paintHeader(layout.header, layout.flow.name, layout.flow.summary, styles),
			standingPin(layout.frame, standing, palette),
		]),
	);
}

/**
 * One flow, painted.
 * @param layout The flow.
 * @param palette The theme's colours.
 * @param standingOf How each subject stands against the variant this one came from.
 * @returns Its markup.
 */
function paintFlow(layout: FlowLayout, palette: Palette, standingOf: StandingOf): string {
	const activeAt = activationLookup(layout.columns);
	return lines([
		paintFrame(layout, palette, standingOf(layout.flow.id)),
		wrap(
			"g",
			{},
			lines(
				layout.columns.map((column) =>
					paintColumn(column, layout, palette, standingOf(column.card.node.id)),
				),
			),
		),
		wrap(
			"g",
			{},
			lines(
				layout.columns.map((column) =>
					paintCard(column.card, palette, standingOf(column.card.node.id)),
				),
			),
		),
		wrap(
			"g",
			{},
			lines(
				layout.steps.map((placed) =>
					paintStep(placed, activeAt, palette, standingOf(placed.step.id)),
				),
			),
		),
	]);
}

/** Everything a painted sequence is. */
interface DataFlowPainting {
	/** The page width. */
	readonly width: number;
	/** The page height. */
	readonly height: number;
	/** The painted body, ready to wrap in a document. */
	readonly body: string;
	/** Where everything landed. */
	readonly atlas: DiagramAtlas;
}

/** One subject of a drawing, and the box it took. */
interface DrawnSubject {
	/** Its semantic id. */
	readonly id: string;
	/** Where it was drawn. */
	readonly box: Box;
}

/**
 * Every participant column of one flow, as a box.
 *
 * A participant is its card *and* the column of time under it: a pane sent to a
 * participant is being sent to everything that participant does, not to the
 * label at the top of it.
 * @param layout The flow.
 * @returns Each participant's box.
 */
function columnSubjects(layout: FlowLayout): DrawnSubject[] {
	return layout.columns.map((column) => ({
		id: column.card.node.id,
		box: {
			x: column.card.box.x,
			y: column.card.box.y,
			width: column.card.box.width,
			height: layout.lifelineBottom - column.card.box.y,
		},
	}));
}

/**
 * Every message of one flow, as a box.
 * @param layout The flow.
 * @returns Each message's row.
 */
function stepSubjects(layout: FlowLayout): DrawnSubject[] {
	const activeAt = activationLookup(layout.columns);
	return layout.steps.map((placed) => ({ id: placed.step.id, box: stepBox(placed, activeAt) }));
}

/**
 * One variant's flows, painted as a stack of message sequences.
 * @param flows The flows, in document order.
 * @param nodes The variant's nodes, for the participants.
 * @param palette The theme's colours.
 * @param standingOf How each subject stands against the variant this one came from.
 * @returns The page, its body and its atlas.
 */
function paintDataFlow(
	flows: readonly SemanticFlow[],
	nodes: readonly SemanticNode[],
	palette: Palette,
	standingOf: StandingOf,
): DataFlowPainting {
	const layout = layoutDataFlow(flows, nodes);
	const columns = layout.flows.flatMap(columnSubjects);
	const steps = layout.flows.flatMap(stepSubjects);
	const frames = layout.flows.map((laid) => ({ id: laid.flow.id, box: laid.frame }));

	// A label reaches past the frame it belongs to whenever it is longer than the
	// arrow it names, so the frames are a floor on the page rather than the answer.
	const canvas = canvasFor(
		layout,
		union([...frames, ...columns, ...steps].map(({ box }) => box)),
		DIAGRAM_MARGIN,
	);

	return {
		width: canvas.width,
		height: canvas.height,
		body: shifted(canvas, lines(layout.flows.map((laid) => paintFlow(laid, palette, standingOf)))),
		atlas: {
			nodes: atlasBoxes(columns, canvas),
			// A step is a relationship between two subjects, exactly as an
			// architecture edge is, so it belongs in the same map. A pane hit-tests
			// and focuses one atlas whichever grammar it is showing, rather than
			// learning a second set of maps for the second picture.
			edges: atlasBoxes(steps, canvas),
			regions: atlasBoxes(frames, canvas),
		},
	};
}

export { type DataFlowPainting, paintDataFlow };
