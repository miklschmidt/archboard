import {
	nodeAppearances,
	type NodeAppearance,
} from "@/runtime/semantic-renderer/lib/semantic-appearance";
import type { SemanticPolicy } from "@/shared/semantic-policy/index";
// Painting a message sequence: the frame, then the columns of time, then the
// cards at their heads, then the messages crossing between them.
//
// Forked from PR Lens's `svg/dataflow.ts`, the pulses and their shared cycle
// included: an exchange that does not move reads as a ladder rather than as
// something happening, which is the whole of what a sequence is for. What did
// not come with them is the manifest and the delta tones. What arrived on top is
// the same identity and selection machinery the architecture grammar carries, so
// a pane can hit-test one picture the way it hit-tests the other.
//
// The dots do not compete with the walkthrough: a beat moves the camera and
// marks its subjects, and neither is a thing a dot does.
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
	STEP_WEIGHT,
	MARKER_INSET,
	SELF_LOOP_CORNER,
	SELF_LOOP_DROP,
	SELF_LOOP_REACH,
} from "@/runtime/semantic-renderer/lib/dataflow-design";
import { atlasBoxes } from "@/runtime/semantic-renderer/lib/atlas";
import { canvasFor, coord, union, type Box } from "@/runtime/semantic-renderer/lib/geometry";
import type { Palette } from "@/runtime/semantic-renderer/lib/theme";
import { FLOW_CYCLE_CAP_MS, FLOW_STEP_TRAVEL_MS } from "@/shared/timing/timing";
import { timedCrossings, type Crossing } from "@/runtime/semantic-renderer/lib/svg/flow-clock";
import {
	activationLookup,
	layoutDataFlow,
	type ActiveAt,
	type FlowLayout,
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
import { paintColumn } from "@/runtime/semantic-renderer/lib/svg/flow-columns";
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
	warningBadge,
	warningOnLine,
	type StandingOf,
	type SubjectStanding,
	type UnsettledOf,
} from "@/runtime/semantic-renderer/lib/svg/standing";
import {
	markerFor,
	stylesFor,
	lineColour,
	STROKE_WIDTH,
	type Head,
	type SvgStyles,
} from "@/runtime/semantic-renderer/lib/svg/styles";

/** How much wider than its line a message's selection halo is. */
const STEP_HALO_EXTRA = 5;
/** Where a plate's text baseline sits inside it. */
const PILL_BASELINE = 0.68;

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
 * @param standing How the message stands, when this is a proposal and it moved.
 * @returns The path's attributes.
 */
function stepAttributes(
	kind: MessageKind,
	palette: Palette,
	standing: SubjectStanding | undefined,
): Attributes {
	return {
		fill: "none",
		stroke: lineColour(palette, standing),
		"stroke-width": STROKE_WIDTH[STEP_WEIGHT],
		"stroke-linecap": "round",
		"stroke-linejoin": "round",
		"stroke-dasharray": STEP_DASH[kind],
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
 * @param crossing The drawing's shared clock.
 * @returns The group holding its run.
 */
function paintStep(
	placed: PlacedStep,
	activeAt: ActiveAt,
	palette: Palette,
	standing: SubjectStanding | undefined,
	crossing: Crossing,
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
				"marker-end": markerFor(STEP_WEIGHT, STEP_HEAD[placed.step.kind], standing),
				...stepAttributes(placed.step.kind, palette, standing),
			}),
			// The dots over the line and under the words, which is the order a
			// reader needs: a dot crossing an opaque plate put a hole in the middle
			// of what the message says. A message the proposal no longer sends is
			// drawn for context and must not read as live traffic.
			standing === "removed"
				? ""
				: timedCrossings(placed, path, palette, { ...crossing, standing }),
		]),
	);
}

/**
 * What one message says, on the layer above every run.
 *
 * The plate and the warning badge, in a group that says it is the message, for
 * the same reason the architecture grammar splits a relationship in two: the
 * words of one message have to sit above the dots of ALL of them. Upstream, and
 * this fork until now, argued that a stack of horizontal runs at a fixed pitch
 * could never reach each other's plates — and mostly it cannot, but "mostly"
 * is a thing that has to be re-derived every time somebody adds a self-message
 * loop or a taller plate, and the rule it was standing in for is the simple one:
 * the words are on top.
 * @param placed The message.
 * @param activeAt Whether a column is busy at a given height.
 * @param palette The theme's colours.
 * @param standing How this step stands against the variant it came from, when the caller said.
 * @param unsettled Whether the board says nobody has decided this message yet.
 * @returns The message's words, or nothing when it has none to say.
 */
function paintStepWords(
	placed: PlacedStep,
	activeAt: ActiveAt,
	palette: Palette,
	standing: SubjectStanding | undefined,
	unsettled: boolean,
): string {
	const plate = labelBox(placed, activeAt);
	return wrap(
		"g",
		subjectGroup("step", placed.step.id, standing),
		lines([
			paintLabel(placed.label, plate, stylesFor(palette), standingOutline(standing, palette)),
			// On the leading edge of the plate, clear of its words.
			warningOnLine({ x: plate.x, y: plate.y + plate.height / 2 }, unsettled, palette),
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
 * @param unsettled Whether the board says nobody has decided this exchange yet.
 * @returns The frame's group.
 */
function paintFrame(
	layout: FlowLayout,
	palette: Palette,
	standing: SubjectStanding | undefined,
	unsettled: boolean,
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
			warningBadge(layout.frame, unsettled, palette),
		]),
	);
}

/**
 * One flow, painted.
 * @param layout The flow.
 * @param palette The theme's colours.
 * @param standingOf How each subject stands against the variant this one came from.
 * @param crossing The drawing's shared clock, which this flow takes its turns on.
 * @param unsettledOf Whether the board says a subject is still undecided.
 * @param appearances Type channels for the depicted participant cards.
 * @returns Everything it draws, and the words that go above every flow's runs.
 */
function paintFlow(
	layout: FlowLayout,
	palette: Palette,
	standingOf: StandingOf,
	crossing: Crossing,
	unsettledOf: UnsettledOf,
	appearances: ReadonlyMap<string, NodeAppearance>,
): { readonly body: string; readonly words: string } {
	const activeAt = activationLookup(layout.columns);
	const body = lines([
		paintFrame(layout, palette, standingOf(layout.flow.id), unsettledOf(layout.flow.id)),
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
					paintCard(
						column.card,
						palette,
						standingOf(column.card.node.id),
						unsettledOf(column.card.node.id),
						appearances.get(column.card.node.id)!,
					),
				),
			),
		),
		wrap(
			"g",
			{},
			lines(
				layout.steps.map((placed) =>
					paintStep(placed, activeAt, palette, standingOf(placed.step.id), crossing),
				),
			),
		),
	]);
	const words = lines(
		layout.steps.map((placed) =>
			paintStepWords(
				placed,
				activeAt,
				palette,
				standingOf(placed.step.id),
				unsettledOf(placed.step.id),
			),
		),
	);
	return { body, words };
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
 * @param unsettledOf Whether the board says a subject is still undecided.
 * @param policy Current vault policy.
 * @returns The page, its body and its atlas.
 */
function paintDataFlow(
	flows: readonly SemanticFlow[],
	nodes: readonly SemanticNode[],
	palette: Palette,
	standingOf: StandingOf,
	unsettledOf: UnsettledOf,
	policy: SemanticPolicy,
): DataFlowPainting {
	const layout = layoutDataFlow(flows, nodes);
	// Sequence columns are cards; containment is not depicted in this grammar.
	const appearances = nodeAppearances(
		nodes.map(({ parent: _parent, ...node }) => node),
		policy,
	);
	// One clock for everything drawn, so the whole page is told in order. It
	// grows with the number of turns and then stops growing: past the cap a
	// reader who looked away would not see the beginning come round again.
	const crossing: Crossing = {
		turns: layout.turns,
		cycle: Math.min(layout.turns * FLOW_STEP_TRAVEL_MS, FLOW_CYCLE_CAP_MS) / 1000,
	};
	const painted = layout.flows.map((laid) =>
		paintFlow(laid, palette, standingOf, crossing, unsettledOf, appearances),
	);
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
		body: shifted(
			canvas,
			lines([
				...painted.map((flow) => flow.body),
				// Every message's words, over every message's run.
				...painted.map((flow) => flow.words),
			]),
		),
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
