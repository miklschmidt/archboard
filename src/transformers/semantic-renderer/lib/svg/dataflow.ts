import {
	nodeAppearances,
	type NodeAppearance,
} from "@/transformers/semantic-renderer/lib/semantic-appearance";
import type { SemanticPolicy } from "@archboard/board/policy";
// Painting a message sequence: the frame, then the marks on the rows a
// comparison says moved (`flow-rows.ts`), then activation and label shadows,
// then columns and their head cards, then the messages crossing them, and last the
// words of every message (`flow-words.ts`).
//
// Pulses share one clock and show the exchange happening. The walkthrough owns
// the camera and subject selection; pulses own neither.
//
// The layer order is load-bearing. A row's mark passes behind everything on
// the row; a lifeline passes behind a card; a message passes over a lifeline;
// and a label plate, opaque precisely so that it can be read wherever it lands,
// passes over everything every message drew.

import type { DiagramAtlas } from "@archboard/board/render-reply";
import type { MessageKind } from "@archboard/board/vocabulary";
import type { SemanticFlow } from "@archboard/board/views";
import type { SemanticNode } from "@archboard/board/content";
import { DIAGRAM_MARGIN, SLAB_RADIUS } from "@/transformers/semantic-renderer/lib/design";
import {
	headShade,
	paintFragment,
	paintFrame,
} from "@/transformers/semantic-renderer/lib/svg/flow-frames";
import {
	STEP_HEAD,
	STEP_WEIGHT,
	arrowStandoff,
	SELF_LOOP_CORNER,
	SELF_LOOP_DROP,
	SELF_LOOP_REACH,
} from "@/transformers/semantic-renderer/lib/sequence-design";
import { atlasBoxes } from "@/transformers/semantic-renderer/lib/atlas";
import { shownFlows } from "@/transformers/semantic-renderer/lib/shown";
import {
	columnSubjects,
	stepSubjects,
} from "@/transformers/semantic-renderer/lib/svg/flow-subjects";
import { canvasFor, coord, union } from "@/transformers/semantic-renderer/lib/geometry";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import {
	exchangeClock,
	timedCrossings,
	type Crossing,
} from "@/transformers/semantic-renderer/lib/svg/flow-clock";
import { routeLength, standoffOf, type Ride } from "@/transformers/semantic-renderer/lib/svg/pulse";
import { curveThrough } from "@/transformers/semantic-renderer/lib/layout/curves";
import {
	activationLookup,
	layoutDataFlow,
	type ActiveAt,
	type FlowLayout,
	type PlacedStep,
} from "@/transformers/semantic-renderer/lib/layout/dataflow";
import { endsFor, selfStart, travelOf } from "@/transformers/semantic-renderer/lib/layout/messages";
import { paintCard } from "@/transformers/semantic-renderer/lib/svg/cards";
import {
	paintColumn,
	paintColumnShadows,
} from "@/transformers/semantic-renderer/lib/svg/flow-columns";
import {
	markedWithin,
	paintRowMarks,
	type Stands,
} from "@/transformers/semantic-renderer/lib/svg/flow-rows";
import {
	paintStepWords,
	paintStepShadow,
} from "@/transformers/semantic-renderer/lib/svg/flow-words";
import { shifted } from "@/transformers/semantic-renderer/lib/svg/document";
import {
	lines,
	tag,
	wrap,
	type Attributes,
} from "@/transformers/semantic-renderer/lib/svg/primitives";
import { shadowUnder } from "@/transformers/semantic-renderer/lib/svg/slab";
import {
	HEAD_ATTRIBUTE,
	ghostOpacity,
	markedBox,
	subjectGroup,
	type StandingOf,
	type SubjectStanding,
	type UnsettledOf,
} from "@/transformers/semantic-renderer/lib/svg/standing";
import {
	headBase,
	litMarkerFor,
	markerFor,
	stylesFor,
	lineColour,
	STROKE_WIDTH,
} from "@/transformers/semantic-renderer/lib/svg/styles";

/** How much wider than its line a message's selection glow is. */
const STEP_HALO_EXTRA = 5;
/**
 * How strong that glow is: a tint the line and its head still read through,
 * where a solid band hid both under a bar of selection ink.
 */
const STEP_HALO_OPACITY = 0.3;
/** How much heavier than its line a lit message's trace is. */
const LIT_TRACE_EXTRA = 0.5;

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
		`h-${coord(SELF_LOOP_REACH - arrowStandoff("self"))}`
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
 * The part of one message's line its pulses ride: all of it but the base of its
 * arrowhead, which a pulse sinks into rather than covers.
 * @param placed The message.
 * @param activeAt Whether a column is busy at a given height.
 * @returns The route and its length, or undefined when the line is too short to carry a pulse.
 */
function stepRide(placed: PlacedStep, activeAt: ActiveAt): Ride | undefined {
	const { kind } = placed.step;
	const cut = standoffOf(headBase(STEP_HEAD[kind], STEP_WEIGHT));
	const direction = travelOf(kind, placed.fromX, placed.toX);
	if (direction === 0) {
		if (SELF_LOOP_REACH - arrowStandoff(kind) - cut <= 0) return undefined;
		// Out to the right, down and back, as `selfPath` draws it, with its turns
		// rounded as it rounds them and its end cut short.
		const x = selfStart(placed, activeAt(placed.step.from, placed.y));
		const right = x + SELF_LOOP_REACH + SELF_LOOP_CORNER;
		const low = placed.y + SELF_LOOP_DROP + 2 * SELF_LOOP_CORNER;
		const curve = curveThrough([
			{ x, y: placed.y },
			{ x: right, y: placed.y },
			{ x: right, y: low },
			{ x: x + arrowStandoff(kind) + cut, y: low },
		]);
		return { curve, length: routeLength(curve) };
	}
	const { start, end } = endsFor(placed, activeAt, direction);
	const length = (end - start) * direction - cut;
	if (length <= 0) return undefined;
	return {
		curve: {
			from: { x: start, y: placed.y },
			segments: [{ kind: "line", to: { x: start + direction * length, y: placed.y } }],
		},
		length,
	};
}

/**
 * One message: a glow a viewer can light up, the line itself, and the pulses
 * that ride it.
 *
 * Its words are drawn on the layer above every run ({@link paintStepWords}), in
 * a group that says it is the same message, so `.is-selected` lights the line
 * and its label together.
 * @param placed The message.
 * @param activeAt Whether a column is busy at a given height.
 * @param palette The theme's colours.
 * @param stands How this step stands against the variant it came from, when the caller said.
 * @param stands.standing Its own standing, which its group states and a removal ghosts.
 * @param stands.mark The standing its ink is drawn for ({@link markedWithin}).
 * @param crossing The drawing's shared clock.
 * @returns The group holding its run.
 */
function paintStep(
	placed: PlacedStep,
	activeAt: ActiveAt,
	palette: Palette,
	{ standing, mark }: Stands,
	crossing: Crossing,
): string {
	const styles = stylesFor(palette);
	const path = stepPath(placed, activeAt);
	const ride = stepRide(placed, activeAt);
	return wrap(
		"g",
		{ ...subjectGroup("step", placed.step.id, standing), opacity: ghostOpacity(standing) },
		lines([
			tag("path", {
				class: "ab-halo",
				d: path,
				"stroke-width": STROKE_WIDTH[STEP_WEIGHT] + STEP_HALO_EXTRA,
				"stroke-opacity": STEP_HALO_OPACITY,
				"stroke-linecap": "round",
				"stroke-linejoin": "round",
				...styles.halo,
			}),
			tag("path", {
				d: path,
				"marker-end": markerFor(STEP_WEIGHT, STEP_HEAD[placed.step.kind], mark),
				...stepAttributes(placed.step.kind, palette, mark),
			}),
			// The line again in the selection's ink, head and dash included, lit
			// with the glow: a lit message is drawn in that ink, where a grey line
			// on a glow read as a line under a smear.
			tag("path", {
				class: "ab-halo",
				d: path,
				"marker-end": litMarkerFor(STEP_WEIGHT, STEP_HEAD[placed.step.kind]),
				...stepAttributes(placed.step.kind, palette, undefined),
				...styles.halo,
				"stroke-width": STROKE_WIDTH[STEP_WEIGHT] + LIT_TRACE_EXTRA,
			}),
			// The pulses over the line and under the words, which is the order a
			// reader needs: a pulse crossing an opaque plate put a hole in the middle
			// of what the message says. A message the proposal no longer sends is
			// drawn for context and must not read as live traffic.
			standing === "removed" || ride === undefined
				? ""
				: timedCrossings(placed.slot, ride, palette, { ...crossing, standing: mark }),
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
	const flowStanding = standingOf(layout.flow.id);
	/**
	 * The standing one of this flow's messages is marked for.
	 * @param id The message.
	 * @returns Its standing, unless its whole flow was added or removed.
	 */
	const markOf: StandingOf = (id) => markedWithin(flowStanding, standingOf(id));
	const body = lines([
		paintFrame(layout, palette, flowStanding, unsettledOf(layout.flow.id)),
		paintRowMarks(layout, palette, markOf),
		// All activation and label shadows below all lifelines and message runs.
		...layout.columns.map((column) =>
			paintColumnShadows(column, palette, standingOf(column.card.node.id)),
		),
		...layout.steps.map((placed) =>
			paintStepShadow(placed, activeAt, palette, standingOf(placed.step.id)),
		),
		...layout.columns.map((column) =>
			paintColumn(
				column,
				layout,
				{ palette, appearance: appearances.get(column.card.node.id)! },
				standingOf(column.card.node.id),
			),
		),
		wrap(
			"g",
			{ [HEAD_ATTRIBUTE]: layout.flow.id },
			lines([
				headShade(layout, flowStanding, palette),
				// Every card's shadow under every card, in the head, so it moves with the head.
				...layout.columns.map(({ card }) =>
					shadowUnder(
						card.node.id,
						card.box,
						SLAB_RADIUS,
						"card",
						palette,
						standingOf(card.node.id),
					),
				),
				...layout.columns.map((column) =>
					paintCard(
						column.card,
						palette,
						standingOf(column.card.node.id),
						unsettledOf(column.card.node.id),
						appearances.get(column.card.node.id)!,
					),
				),
			]),
		),
		// Each decision's and loop's frame over the lifelines and under the
		// messages it governs, an outer frame before the frames inside it.
		...layout.frames
			.toReversed()
			.map((frame) =>
				paintFragment(frame, palette, markOf(frame.step.id), unsettledOf(frame.step.id)),
			),
		wrap(
			"g",
			{},
			lines(
				layout.steps.map((placed) =>
					paintStep(
						placed,
						activeAt,
						palette,
						{ standing: standingOf(placed.step.id), mark: markOf(placed.step.id) },
						crossing,
					),
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
				{ standing: standingOf(placed.step.id), mark: markOf(placed.step.id) },
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

/**
 * One variant's flows, painted as a stack of message sequences.
 * @param flows The flows, in document order.
 * @param nodes The variant's nodes, for the participants.
 * @param palette The theme's colours.
 * @param standingOf How each subject stands against the variant this one came from.
 * @param unsettledOf Whether the board says a subject is still undecided.
 * @param vocabulary The vault's policy, and the level of the board drawn.
 * @param vocabulary.policy Current vault policy.
 * @param vocabulary.level The board's level, which places the boards its participants open.
 * @param page What the page holds beyond what is drawn: the flows, participants and
 * messages laid out but left out, and the marks the comparison would draw, so what is
 * drawn stands where it stands with them.
 * @param page.held The flows as the variant's own reading holds them, when only those are drawn.
 * @param page.standingOf How each subject stands, for the marks the page holds.
 * @returns The page, its body and its atlas.
 */
function paintDataFlow(
	flows: readonly SemanticFlow[],
	nodes: readonly SemanticNode[],
	palette: Palette,
	standingOf: StandingOf,
	unsettledOf: UnsettledOf,
	vocabulary: { readonly policy: SemanticPolicy; readonly level: string | undefined },
	page: { held: readonly SemanticFlow[] | undefined; standingOf: StandingOf },
): DataFlowPainting {
	const { policy, level } = vocabulary;
	const laid = layoutDataFlow(flows, nodes);
	const layout = shownFlows(laid, page.held);
	// Sequence columns are cards; containment is not depicted in this grammar.
	const appearances = nodeAppearances(
		nodes.map(({ parent: _parent, ...node }) => node),
		policy,
		level,
	);
	// One clock for everything drawn, so the whole page is told in order. Every
	// turn the page holds is on it, drawn or not, so what is drawn crosses when it
	// crosses with the rest.
	const crossing = exchangeClock(
		laid.flows.flatMap((one) => {
			const activeAt = activationLookup(one.columns);
			return one.steps.flatMap((placed) =>
				Array.from({ length: placed.slot.count }, () => stepRide(placed, activeAt)?.length ?? 0),
			);
		}),
	);
	const painted = layout.flows.map((one) =>
		paintFlow(one, palette, standingOf, crossing, unsettledOf, appearances),
	);
	const columns = layout.flows.flatMap(columnSubjects);
	const steps = layout.flows.flatMap(stepSubjects);
	const frames = layout.flows.map((one) => ({ id: one.flow.id, box: one.frame }));

	// A frame holds everything its flow draws, labels included, so the frames and
	// the marks on their corners are the page; one that reaches left of the
	// margin shifts the page to keep it.
	const marked = laid.flows.map(({ flow, frame }) =>
		markedBox(frame, page.standingOf(flow.id), unsettledOf(flow.id)),
	);
	const canvas = canvasFor(laid, union(marked), DIAGRAM_MARGIN);

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
