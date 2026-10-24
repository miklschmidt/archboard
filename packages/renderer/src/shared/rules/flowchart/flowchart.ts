// A flow drawn as a flowchart (ADR 0053): its steps as boxes, its decisions as
// diamonds with a labelled line for each alternative, its loops as hexagons,
// from a start to an end, in a frame that names the flow.
//
// The graph (`flowchart-graph.ts`) is laid out by the track engine, whose
// top-to-bottom tracks suit a flow that branches and rejoins, and painted by
// the architecture painter: the frames, the lines, their words and their
// crossings are an architecture's, the message boxes are cards, and only the
// diamonds, hexagons and terminals are drawn as shapes of their own. Every line
// that meets a shape is carried on to its outline, and a line that meets a
// decision or a terminal to the middle of the side it crosses, a diamond's
// point (`flowchart-ports.ts`).
//
// A decision's answers leave it from separate points: left and right, and the
// bottom for a third. The layout is asked for that: a decision is measured
// wider than its diamond on either side by an answer's sideways run and half
// the widest answer's words, and marked so that the track engine holds each
// answer to its own point of the box (`shared/rules/track/routes/points.ts`). Once laid out, the
// box is cut back to the diamond (`toDiamonds`), and each answer is drawn out
// of its point. Which answer goes to which point follows a first layout that
// holds no answer to a point (`inFreeOrder`): Graphviz orders the answers there
// so that the fewest lines cross, a loop's line back up included, and the
// second layout asks for the points in that order.

import type { SemanticPolicy } from "@archboard/board/policy";
import { BEND_RADIUS } from "#shared/constants/spacing.ts";
import type { DiagramAtlas } from "@archboard/board/render-reply";
import type { VariantContent } from "@archboard/board/content";
import type {
	DrawingEdge,
	MeasuredArchitecture,
	MeasuredNode,
	PaintedDrawing,
} from "#shared/rules/render/drawing.ts";
import type { Box, Point } from "#shared/rules/geometry.ts";
import { EPSILON, pathOf, type Curve, type Segment } from "#shared/rules/layout/routes/curves.ts";
import { layoutEngine } from "#shared/rules/layout/engines.ts";
import { pairCrossings } from "#shared/rules/blocks/tree/joins.ts";
import { measureArchitecture, measureMessageLines } from "#shared/rules/text/measurement.ts";
import {
	FLOW_KIND,
	NEXT_KIND,
	SHAPE_KIND,
	flowchartOf,
	type FlowchartGraph,
	type FlowchartShape,
} from "#shared/rules/flowchart/flowchart-graph.ts";
import { atShapePoints } from "#shared/rules/flowchart/flowchart-ports.ts";
import {
	SemanticRenderError,
	type DiagramRenderRequest,
	type RenderedDiagram,
} from "#shared/protocol/render-request.ts";
import { PALETTE } from "#shared/rules/svg/page/theme.ts";
import { paintArchitecture, type ShapePainter } from "#shared/rules/svg/parts/architecture.ts";
import { svgDocument } from "#shared/rules/svg/page/document.ts";
import { FLOW_ICON } from "#shared/rules/svg/page/icons.ts";
import { exportedName, framedForExport } from "#shared/rules/svg/page/export-frame.ts";
import {
	SHAPE_TEXT,
	flowchartDefinitions,
	onOutline,
	shapePainter,
} from "#shared/rules/svg/sequence/flowchart-shapes.ts";
import { pageFor, plannedTitle } from "#shared/rules/svg/page/planned-frame.ts";
import { standingsFrom, unsettledFrom } from "#shared/rules/svg/parts/standing.ts";

/** The widest a shape's words run before they wrap. */
const SHAPE_WORDS_WIDTH = 150;
/** The room between a shape's words and its outline. */
const SHAPE_PAD = 10;
/** How tall a diamond is for its width: a diamond twice as wide as it is tall. */
const DIAMOND_ASPECT = 0.5;
/** A terminal's size. */
const TERMINAL = { width: 96, height: 34 } as const;
/**
 * How far an answer runs sideways out of a decision's left or right point
 * before it turns down: a bend and as long a straight again.
 */
const SIDE_RUN = 2 * BEND_RADIUS;

/**
 * The vault's policy with the flowchart's own kinds beside it: a flow's frame,
 * the shapes, which are never drawn by their kind, and the line from one step
 * to the next.
 * @param policy The vault's policy.
 * @returns The policy the flowchart is measured and painted with.
 */
function flowchartPolicy(policy: SemanticPolicy): SemanticPolicy {
	return {
		...policy,
		nodeKinds: {
			...policy.nodeKinds,
			[FLOW_KIND]: { name: "Flow", icon: FLOW_ICON },
			[SHAPE_KIND]: { name: "Step", icon: "RiGitBranchLine" },
		},
		relationshipKinds: {
			...policy.relationshipKinds,
			[NEXT_KIND]: { name: "Next", dash: "solid", arrowhead: "filled" },
		},
	};
}

/**
 * One shape's words, wrapped, and the size its box takes to hold them.
 * @param shape What it is.
 * @param name Its words.
 * @returns The lines, and the box's width and height.
 */
function shapeSize(
	shape: FlowchartShape,
	name: string,
): { readonly words: string[]; readonly width: number; readonly height: number } {
	const lines = measureMessageLines(name, SHAPE_WORDS_WIDTH, SHAPE_TEXT.size, SHAPE_TEXT.line);
	const words = lines.map((line) => line.text);
	const textWidth = lines.reduce((widest, line) => Math.max(widest, line.width), 0);
	const textHeight = lines.length * SHAPE_TEXT.line;
	if (shape === "decision") {
		// The words' box inscribed in the diamond: (w/2)/a + (h/2)/b = 1, with b = aspect × a.
		const half = textWidth / 2 + SHAPE_PAD + (textHeight / 2 + SHAPE_PAD) / DIAMOND_ASPECT;
		return { words, width: Math.ceil(half * 2), height: Math.ceil(half * 2 * DIAMOND_ASPECT) };
	}
	if (shape === "loop") {
		const height = Math.ceil(textHeight + SHAPE_PAD * 2);
		return { words, width: Math.ceil(textWidth + SHAPE_PAD * 2 + height), height };
	}
	return { words, ...TERMINAL };
}

/**
 * Half the widest answer's words out of each decision: how far in from the
 * edge of its box an answer from a side point runs down, so its words stand
 * on it inside the box.
 * @param graph The graph.
 * @param measure The measured lines.
 * @returns The half width, by decision.
 */
function answerRooms(graph: FlowchartGraph, measure: MeasuredArchitecture): Map<string, number> {
	const rooms = new Map<string, number>();
	for (const edge of graph.content.edges) {
		if (graph.shapes.get(edge.from) !== "decision") continue;
		const half = Math.ceil((measure.labels.get(edge.id)?.width ?? 0) / 2);
		rooms.set(edge.from, Math.max(rooms.get(edge.from) ?? 0, half));
	}
	return rooms;
}

/**
 * Measure the graph: frames, boxes and lines as an architecture's are, and
 * each shape to the size its words need. A decision is laid out wider than
 * its diamond on either side by an answer's sideways run and the room its
 * words take beside it (`shared/rules/track/routes/points.ts`).
 * @param graph The graph.
 * @param policy The flowchart's policy.
 * @returns The measurement, and each shape's wrapped words.
 */
function measured(
	graph: FlowchartGraph,
	policy: SemanticPolicy,
): { readonly measure: MeasuredArchitecture; readonly words: ReadonlyMap<string, string[]> } {
	const measure = measureArchitecture(graph.content, policy);
	const rooms = answerRooms(graph, measure);
	const nodes = new Map<string, MeasuredNode>(measure.nodes);
	const words = new Map<string, string[]>();
	for (const node of graph.content.nodes) {
		const shape = graph.shapes.get(node.id);
		if (shape === undefined) continue;
		const size = shapeSize(shape, node.name);
		words.set(node.id, size.words);
		const base = { node, height: size.height, headerHeight: 0, runs: [] };
		const room = rooms.get(node.id) ?? 0;
		nodes.set(
			node.id,
			shape === "decision"
				? { ...base, width: size.width + 2 * (SIDE_RUN + room), pointed: room }
				: { ...base, width: size.width },
		);
	}
	return { measure: { ...measure, nodes }, words };
}

/**
 * Where an answer first stops below its decision in a drawing: the middle of
 * its words, or else of the card it reaches.
 * @param drawing A drawing of the graph.
 * @returns The x, by answer id.
 */
function firstStops(drawing: PaintedDrawing): Map<string, number> {
	const cards = new Map(drawing.cards.map((card) => [card.measured.node.id, card.box]));
	return new Map(
		drawing.edges.map(({ edge, label }) => {
			const box = label?.box ?? cards.get(edge.to);
			return [edge.id, box === undefined ? 0 : box.x + box.width / 2];
		}),
	);
}

/**
 * The graph's content with each decision's answers in the order a layout
 * that holds no answer to a point stood them, left to right. Asked for its
 * points in the board's order instead, Graphviz keeps that order even where
 * it costs a crossing, as when a loop runs back up past one answer.
 * @param content The graph's content.
 * @param measure The measurement.
 * @returns The content, its answers reordered, or the same content when
 * that order is the board's.
 */
async function inFreeOrder(
	content: VariantContent,
	measure: MeasuredArchitecture,
): Promise<VariantContent> {
	const unpointed = new Map(
		[...measure.nodes].map(([id, { pointed: _pointed, ...node }]) => [id, node]),
	);
	const free = await layoutEngine("track")(
		content,
		{ ...measure, nodes: unpointed },
		undefined,
		new Map(),
	);
	const stops = firstStops(free);
	const reordered = new Map<string, number>();
	for (const [id, node] of measure.nodes) {
		if (node.pointed === undefined) continue;
		const answers = content.edges.filter(({ from }) => from === id);
		const orders = answers.map(({ order }) => order).toSorted((one, other) => one - other);
		answers
			.toSorted(
				(one, other) => stops.get(one.id)! - stops.get(other.id)! || one.order - other.order,
			)
			.forEach((edge, index) => reordered.set(edge.id, orders[index]!));
	}
	const edges = content.edges.map((edge) => ({
		...edge,
		order: reordered.get(edge.id) ?? edge.order,
	}));
	return edges.every((edge, index) => edge.order === content.edges[index]!.order)
		? content
		: { ...content, edges };
}

/**
 * The graph laid out with each decision's answers asked for their points in
 * the order of a first layout (`inFreeOrder`), or in the board's order when
 * that crosses fewer lines: asked for its points, Graphviz can still stand
 * answers' steps against the first layout's order.
 * @param content The graph's content.
 * @param measure The measurement.
 * @returns The drawing whose lines cross fewer times, the first layout's order on a tie.
 */
async function laidOut(
	content: VariantContent,
	measure: MeasuredArchitecture,
): Promise<PaintedDrawing> {
	const free = await inFreeOrder(content, measure);
	const first = await layoutEngine("track")(free, measure, undefined, new Map());
	const crossed = crossingsOf(first);
	if (free === content || crossed === 0) return first;
	const board = await layoutEngine("track")(content, measure, undefined, new Map());
	return crossingsOf(board) < crossed ? board : first;
}

/**
 * How many times a drawing's lines cross each other.
 * @param drawing The drawing.
 * @returns The crossings.
 */
function crossingsOf(drawing: PaintedDrawing): number {
	return pairCrossings(
		drawing.edges.map(({ curve }) => [curve.from, ...curve.segments.map(({ to }) => to)]),
	);
}

/**
 * The drawing with each decision's box cut to its diamond: it was laid out
 * wider on either side by an answer's sideways run and its words' room.
 * @param drawing The drawing as laid out.
 * @param shapes Which nodes are shapes.
 * @returns The drawing, each box the size of its shape.
 */
function toDiamonds(
	drawing: PaintedDrawing,
	shapes: ReadonlyMap<string, FlowchartShape>,
): PaintedDrawing {
	return {
		...drawing,
		cards: drawing.cards.map((card) => {
			if (shapes.get(card.measured.node.id) !== "decision") return card;
			const beside = SIDE_RUN + (card.measured.pointed ?? 0);
			const box = { ...card.box, x: card.box.x + beside, width: card.box.width - 2 * beside };
			return { ...card, box };
		}),
	};
}

/**
 * A route carried on from its shapes' boxes to their outlines.
 * @param curve The route as laid out.
 * @param from The shape it leaves, and its box, when it leaves one.
 * @param to The shape it reaches, and its box, when it reaches one.
 * @returns The route.
 */
function outlined(curve: Curve, from: Shaped, to: Shaped): Curve {
	const last = curve.segments.at(-1)?.to ?? curve.from;
	const start = carried(from, curve.from);
	const end = carried(to, last);
	return {
		from: start,
		segments: [...lineBetween(start, curve.from), ...curve.segments, ...lineBetween(last, end)],
	};
}

/** The shape a line's end meets, and its box; undefined for a box drawn as a card. */
type Shaped = { readonly shape: FlowchartShape; readonly box: Box } | undefined;

/**
 * Where a line's end stands once it is carried on to the shape it meets.
 * @param shaped The shape, if the end meets one.
 * @param point Where the end stands on the shape's box.
 * @returns Where it stands on the shape's outline.
 */
function carried(shaped: Shaped, point: Point): Point {
	return shaped === undefined ? point : onOutline(shaped.shape, shaped.box, point);
}

/**
 * The straight piece between two points, or none where they are one point: a
 * piece of no length would turn an arrowhead any way at all.
 * @param from Where it starts.
 * @param to Where it ends.
 * @returns The piece, or nothing.
 */
function lineBetween(from: Point, to: Point): Segment[] {
	return Math.hypot(to.x - from.x, to.y - from.y) < EPSILON ? [] : [{ kind: "line", to }];
}

/**
 * The box of a shape a line meets at the middle of a side: a decision's
 * diamond, at one of its points, and a terminal, where a flow starts or ends.
 * @param shaped The shape a line's end meets, if any.
 * @returns Its box when the shape is one of those.
 */
function pointed(shaped: Shaped): Box | undefined {
	return shaped === undefined || shaped.shape === "loop" ? undefined : shaped.box;
}

/**
 * The drawing with every line that meets a shape carried on to its outline,
 * and every line that meets a decision or a terminal turned to the middle of
 * the side it crosses.
 * @param drawing The drawing as laid out.
 * @param shapes Which nodes are shapes.
 * @returns The drawing to paint.
 */
function withOutlines(
	drawing: PaintedDrawing,
	shapes: ReadonlyMap<string, FlowchartShape>,
): PaintedDrawing {
	const boxes = new Map(drawing.cards.map(({ measured: card, box }) => [card.node.id, box]));
	/**
	 * The shape a line's end meets, and its box.
	 * @param id The node at that end.
	 * @returns The shape and box, or undefined for a box drawn as a card.
	 */
	const shaped = (id: string): { shape: FlowchartShape; box: Box } | undefined => {
		const shape = shapes.get(id);
		const box = boxes.get(id);
		return shape === undefined || box === undefined ? undefined : { shape, box };
	};
	/**
	 * One routed line, carried on to its shapes.
	 * @param routed The line.
	 * @returns The line to paint.
	 */
	const onShapes = (routed: DrawingEdge): DrawingEdge => {
		const from = shaped(routed.edge.from);
		const to = shaped(routed.edge.to);
		const turned = atShapePoints(routed.curve, pointed(from), pointed(to));
		const curve = outlined(turned, from, to);
		return { ...routed, curve, path: pathOf(curve) };
	};
	return {
		...drawing,
		edges: drawing.edges.map(onShapes),
		bridged: { ...drawing.bridged, edges: drawing.bridged.edges.map(onShapes) },
	};
}

/**
 * The atlas with only what a reader can pick: the flows and their steps. The
 * lines and the terminals belong to the picture alone.
 * @param atlas The painted atlas.
 * @param subjects The ids a reader can pick.
 * @returns The atlas of those.
 */
function subjectAtlas(atlas: DiagramAtlas, subjects: ReadonlySet<string>): DiagramAtlas {
	/**
	 * One map of the atlas, cut down to the subjects.
	 * @param boxes The map.
	 * @returns The map of subjects alone.
	 */
	const kept = <Value>(boxes: Readonly<Record<string, Value>>): Record<string, Value> =>
		Object.fromEntries(Object.entries(boxes).filter(([id]) => subjects.has(id)));
	return { nodes: kept(atlas.nodes), edges: kept(atlas.edges), regions: kept(atlas.regions) };
}

/**
 * What a flowchart draws: with its comparison, the reading with what the
 * variant lost put back; without it, the variant's own reading.
 * @param request What to draw.
 * @param plain Whether the picture is without its comparison.
 * @returns The content to draw.
 */
function toldOf(request: DiagramRenderRequest, plain: boolean): VariantContent {
	return plain ? (request.held ?? request.content) : request.content;
}

/** What the flowchart's page is painted from. */
interface Painting {
	readonly request: DiagramRenderRequest;
	readonly plain: boolean;
	readonly policy: SemanticPolicy;
	readonly graph: FlowchartGraph;
	readonly words: ReadonlyMap<string, string[]>;
	readonly drawing: PaintedDrawing;
}

/**
 * The flowchart's page: its frames, lines and boxes painted as an
 * architecture's, its shapes by their own painters, and an atlas of only what
 * a reader can pick.
 * @param painting What it is painted from.
 * @returns The page, framed for export.
 */
function painted(painting: Painting): ReturnType<typeof framedForExport> {
	const { request, plain, policy, graph, words, drawing } = painting;
	const shapes = new Map<string, ShapePainter>(
		[...graph.shapes].map(([id, shape]) => [id, shapePainter(shape, words.get(id) ?? [], PALETTE)]),
	);
	const standingOf = standingsFrom(plain ? undefined : request.standing);
	const architecture = paintArchitecture(
		drawing,
		PALETTE,
		standingOf,
		unsettledFrom(request.unsettled),
		{ policy, level: request.level },
		new Set(),
		{ drawing, standingOf, shapes, cardKind: "step" },
	);
	return framedForExport(
		pageFor(
			{ ...architecture, atlas: subjectAtlas(architecture.atlas, graph.subjects) },
			PALETTE,
			request.unbuilt,
		),
		request,
		PALETTE,
	);
}

/**
 * Every flow of a reading, drawn as a flowchart.
 *
 * Laid out from what the picture draws: with its comparison, the reading with
 * what the variant lost put back; without it, the variant's own reading.
 * @param request What to draw, and on which ground.
 * @returns The document, its size and its atlas.
 * @throws {SemanticRenderError} When no flow is left to draw.
 */
async function renderFlowchart(request: DiagramRenderRequest): Promise<RenderedDiagram> {
	const plain = request.paintStanding === false;
	const told = toldOf(request, plain);
	if (told.flows.length === 0) {
		throw new SemanticRenderError(
			"NOTHING_TO_RENDER",
			"this content has no flow, so there is no flowchart to draw",
		);
	}
	const policy = flowchartPolicy(request.policy);
	const graph = flowchartOf(told.flows, told.nodes);
	const { measure, words } = measured(graph, policy);
	const laid = await laidOut(graph.content, measure);
	const drawing = withOutlines(toDiamonds(laid, graph.shapes), graph.shapes);
	const page = painted({ request, plain, policy, graph, words, drawing });
	const svg = svgDocument({
		width: page.width,
		height: page.height,
		palette: PALETTE,
		title: exportedName(
			plannedTitle(`Flowchart: ${told.flows.map((flow) => flow.name).join(", ")}`, request.unbuilt),
			request.frame,
		),
		description: `Showing the logic of ${told.flows.map((flow) => flow.name).join(", ")}.`,
		fonts: request.fonts ?? "linked",
		body: flowchartDefinitions() + page.body,
		reading: drawing.direction,
		theme: request.theme,
	});
	return { svg, width: page.width, height: page.height, atlas: page.atlas, placed: page.placed };
}

export { renderFlowchart };
