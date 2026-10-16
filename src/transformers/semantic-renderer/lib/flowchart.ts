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
// decision to one of its diamond's points (`flowchart-ports.ts`).

import { DEFAULT_SEMANTIC_POLICY, type SemanticPolicy } from "@/shared/semantic-policy/index";
import type { DiagramAtlas, VariantContent } from "@/shared/semantic-board/index";
import type {
	DrawingEdge,
	MeasuredArchitecture,
	MeasuredNode,
	PaintedDrawing,
} from "@/transformers/semantic-renderer/lib/drawing";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import {
	EPSILON,
	pathOf,
	type Curve,
	type Segment,
} from "@/transformers/semantic-renderer/lib/layout/curves";
import { layoutEngine } from "@/transformers/semantic-renderer/lib/layout/engines";
import {
	measureArchitecture,
	measureMessageLines,
} from "@/transformers/semantic-renderer/lib/measurement";
import {
	FLOW_KIND,
	NEXT_KIND,
	SHAPE_KIND,
	flowchartOf,
	type FlowchartGraph,
	type FlowchartShape,
} from "@/transformers/semantic-renderer/lib/flowchart-graph";
import { atDiamondPoints } from "@/transformers/semantic-renderer/lib/flowchart-ports";
import {
	SemanticRenderError,
	type DiagramRenderRequest,
	type RenderedDiagram,
} from "@/transformers/semantic-renderer/lib/render-request";
import { PALETTE } from "@/transformers/semantic-renderer/lib/theme";
import {
	paintArchitecture,
	type ShapePainter,
} from "@/transformers/semantic-renderer/lib/svg/architecture";
import { svgDocument } from "@/transformers/semantic-renderer/lib/svg/document";
import {
	exportedName,
	framedForExport,
} from "@/transformers/semantic-renderer/lib/svg/export-frame";
import {
	SHAPE_TEXT,
	onOutline,
	shapePainter,
} from "@/transformers/semantic-renderer/lib/svg/flowchart-shapes";
import { pageFor, plannedTitle } from "@/transformers/semantic-renderer/lib/svg/planned-frame";
import { standingsFrom, unsettledFrom } from "@/transformers/semantic-renderer/lib/svg/standing";

/** The widest a shape's words run before they wrap. */
const SHAPE_WORDS_WIDTH = 150;
/** The room between a shape's words and its outline. */
const SHAPE_PAD = 10;
/** How tall a diamond is for its width: a diamond twice as wide as it is tall. */
const DIAMOND_ASPECT = 0.5;
/** A terminal's size. */
const TERMINAL = { width: 96, height: 34 } as const;

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
			[FLOW_KIND]: { name: "Flow", icon: "RiGitBranchLine" },
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
 * Measure the graph: frames, boxes and lines as an architecture's are, and
 * each shape to the size its words need.
 * @param graph The graph.
 * @param policy The flowchart's policy.
 * @returns The measurement, and each shape's wrapped words.
 */
function measured(
	graph: FlowchartGraph,
	policy: SemanticPolicy,
): { readonly measure: MeasuredArchitecture; readonly words: ReadonlyMap<string, string[]> } {
	const measure = measureArchitecture(graph.content, policy);
	const nodes = new Map<string, MeasuredNode>(measure.nodes);
	const words = new Map<string, string[]>();
	for (const node of graph.content.nodes) {
		const shape = graph.shapes.get(node.id);
		if (shape === undefined) continue;
		const size = shapeSize(shape, node.name);
		words.set(node.id, size.words);
		nodes.set(node.id, { node, width: size.width, height: size.height, headerHeight: 0, runs: [] });
	}
	return { measure: { ...measure, nodes }, words };
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
 * The box of a decision's diamond, which a line meets at one of its points.
 * @param shaped The shape a line's end meets, if any.
 * @returns Its box when it is a decision.
 */
function diamond(shaped: Shaped): Box | undefined {
	return shaped?.shape === "decision" ? shaped.box : undefined;
}

/**
 * The drawing with every line that meets a shape carried on to its outline,
 * and every line that meets a decision turned to one of its points.
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
		const pointed = atDiamondPoints(routed.curve, diamond(from), diamond(to));
		const curve = outlined(pointed, from, to);
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
	const policy = flowchartPolicy(request.policy ?? DEFAULT_SEMANTIC_POLICY);
	const graph = flowchartOf(told.flows, told.nodes);
	const { measure, words } = measured(graph, policy);
	const laid = await layoutEngine("track")(graph.content, measure, undefined, new Map());
	const drawing = withOutlines(laid, graph.shapes);
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
		body: page.body,
		reading: drawing.direction,
		theme: request.theme,
	});
	return { svg, width: page.width, height: page.height, atlas: page.atlas };
}

export { renderFlowchart };
