// One layout owner settles cards, frames, ports, routes and label boxes together.
// No subsequent paint or atlas pass is allowed to repair these coordinates.
import ELK from "elkjs/lib/elk-api.js";
import type { ElkExtendedEdge, ElkNode, ElkShape, LayoutOptions } from "elkjs/lib/elk-api";
import type { SemanticEdge, VariantContent } from "@/shared/semantic-board/index";
import type {
	ArchitectureDrawing,
	PaintedDrawing,
	DrawingEdge,
	DrawingNode,
	MeasuredArchitecture,
} from "@/runtime/semantic-renderer/lib/drawing";
import type { Box, Point } from "@/runtime/semantic-renderer/lib/geometry";
import {
	drawingAcross,
	headerAxis,
	headerSideOf,
	measuredInFrame,
	type HeaderSide,
} from "@/runtime/semantic-renderer/lib/layout/reading";
import {
	preserveSizes,
	reuseDrawing,
	seedPredecessor,
} from "@/runtime/semantic-renderer/lib/layout/compound-predecessor";
import { placeLabelsOnRuns } from "@/runtime/semantic-renderer/lib/layout/label-runs";
import {
	settleLabels,
	type LabelAttempt,
} from "@/runtime/semantic-renderer/lib/layout/label-reservations";
import { bridgeCrossings, routeCrossings } from "@/runtime/semantic-renderer/lib/layout/crossings";
import { curveThrough, pathOf, simplify } from "@/runtime/semantic-renderer/lib/layout/curves";
import { straightenJogs } from "@/runtime/semantic-renderer/lib/layout/jogs";
import {
	chooseReading,
	foldAspect,
	type Reading,
} from "@/runtime/semantic-renderer/lib/layout/reading-choice";
import {
	settleWithAddedSkips,
	type Problem,
} from "@/runtime/semantic-renderer/lib/layout/proposal-skips";
import {
	COMPOUND_OPTIONS,
	compoundGraph,
} from "@/runtime/semantic-renderer/lib/layout/compound-graph";
import {
	FLANK_RULES,
	flankRule,
	type FlankRule,
} from "@/runtime/semantic-renderer/lib/layout/flank-rules";
import { bestOf } from "@/runtime/semantic-renderer/lib/layout/scorecard";

/**
 * Use the supported worker transport: Bun's main thread exposes `self`, which
 * the vendor's fake-worker detection otherwise mistakes for a worker scope.
 * @returns A private worker running the installed layout engine.
 */
function layoutWorker(): Worker & Pick<Bun.Worker, "ref" | "unref"> {
	// The repository also compiles DOM code, whose ambient Worker declaration
	// hides Bun's ref/unref extensions. This server boundary always runs in Bun.
	const worker = new Worker(import.meta.resolve("elkjs/lib/elk-worker.js"));
	if (!hasProcessLifetime(worker)) {
		worker.terminate();
		throw new Error("Architecture layout requires Bun's worker ref/unref lifecycle API");
	}
	return worker;
}

/**
 * Narrow only Bun's process-lifetime additions to the standard worker API.
 * @param worker The worker created at this runtime boundary.
 * @returns Whether the worker provides the two native lifetime methods.
 */
function hasProcessLifetime(worker: Worker): worker is Worker & Pick<Bun.Worker, "ref" | "unref"> {
	return (
		"ref" in worker &&
		typeof worker.ref === "function" &&
		"unref" in worker &&
		typeof worker.unref === "function"
	);
}

/** The worker itself serializes its layout messages in arrival order. */
interface LayoutEngine {
	readonly worker: ReturnType<typeof layoutWorker>;
	readonly engine: InstanceType<typeof ELK>;
	pending: number;
}

let layoutEngine: LayoutEngine | undefined;

/**
 * Start the engine on its first actual drawing request.
 * @returns The one worker shared by concurrent renders.
 */
function engineForDrawing(): LayoutEngine {
	if (layoutEngine === undefined) {
		const worker = layoutWorker();
		/**
		 * Supply the already owned worker to the vendor API.
		 * @returns The native worker whose lifetime this module owns.
		 */
		const workerFactory = (): Worker => worker;
		layoutEngine = {
			worker,
			engine: new ELK({ algorithms: ["layered"], workerFactory }),
			pending: 0,
		};
	}
	return layoutEngine;
}

/**
 * Keep the process alive only while a layout request still needs its worker.
 * @param graph The complete measured graph.
 * @param measured Label heights that leave room on ordinary route runs.
 * @param stacked How many badges beyond one a gap between rows must hold, stacked.
 * @returns Its solved geometry.
 */
async function solveGraph(
	graph: ElkNode,
	measured: MeasuredArchitecture,
	stacked = 0,
): Promise<ElkNode> {
	const owner = engineForDrawing();
	owner.pending += 1;
	owner.worker.ref();
	try {
		const height = Math.max(0, ...[...measured.labels.values()].map((label) => label.height));
		const nodeAir = Number(COMPOUND_OPTIONS["elk.spacing.labelNode"]);
		const labelAir = Number(COMPOUND_OPTIONS["elk.spacing.labelLabel"]);
		const options: LayoutOptions = COMPOUND_OPTIONS;
		return await owner.engine.layout(graph, {
			layoutOptions:
				height === 0
					? options
					: {
							...options,
							"elk.layered.spacing.nodeNodeBetweenLayers": String(
								Math.max(
									Number(COMPOUND_OPTIONS["elk.layered.spacing.nodeNodeBetweenLayers"]),
									// Badges stacked beside parallel runs in one gap each need
									// their own height and air; only the gap between rows grows
									// for them, never the room around every route track.
									height + 2 * nodeAir + stacked * (height + labelAir),
								),
							),
							"elk.layered.spacing.edgeNodeBetweenLayers": String(
								Math.max(
									Number(COMPOUND_OPTIONS["elk.layered.spacing.edgeNodeBetweenLayers"]),
									Math.ceil(height / 2 + nodeAir),
								),
							),
							"elk.layered.spacing.edgeEdgeBetweenLayers": String(
								Math.max(
									Number(COMPOUND_OPTIONS["elk.layered.spacing.edgeEdgeBetweenLayers"]),
									height + labelAir,
								),
							),
						},
		});
	} finally {
		owner.pending -= 1;
		if (owner.pending === 0) {
			owner.worker.unref();
		}
	}
}

/**
 * Read a complete box in the global coordinates requested from ELK.
 * @param shape A node or edge label after layout.
 * @returns The geometry shared by painter and atlas.
 */
function boxOf(shape: ElkShape): Box {
	const { x, y, width, height } = shape;
	if (x === undefined || y === undefined || width === undefined || height === undefined) {
		throw new Error(`Layout omitted geometry for ${shape.id}`);
	}
	return { x, y, width, height };
}

/**
 * Collect each semantic subject exactly once, retaining containment depth.
 * @param nodes The laid-out hierarchy.
 * @param measured The semantic meaning and precomputed text for each node.
 * @param depth The depth of this level.
 * @returns Final node geometry in parent-before-child order.
 */
function drawingNodes(
	nodes: readonly ElkNode[],
	measured: MeasuredArchitecture,
	depth: number,
): DrawingNode[] {
	return nodes.flatMap((node) => {
		const value = measured.nodes.get(node.id);
		if (value === undefined) {
			throw new Error(`Layout returned an unknown architecture node: ${node.id}`);
		}
		return [
			{ measured: value, box: boxOf(node), depth },
			...drawingNodes(node.children ?? [], measured, depth + 1),
		];
	});
}

/**
 * Join the engine's route into the same rounded geometry the SVG paints.
 * @param result One laid-out semantic edge.
 * @returns Its continuous curve, with no duplicate or collinear waypoints.
 */
function pointsOf(result: ElkExtendedEdge): Point[] {
	const sections = result.sections ?? [];
	if (sections.length !== 1) {
		throw new Error(`Layout did not return one complete route for relationship ${result.id}`);
	}
	const points = sections.flatMap((section) => [
		section.startPoint,
		...(section.bendPoints ?? []),
		section.endPoint,
	]);
	return points;
}

/**
 * Read a reserved label box; other measured labels will use clear route runs.
 * @param result The laid-out relationship.
 * @param measured The measured words and dimensions.
 * @returns Its final label when the relationship carries one.
 */
function drawingLabel(
	result: ElkExtendedEdge,
	measured: MeasuredArchitecture,
): Pick<DrawingEdge, "label"> {
	const label = measured.labels.get(result.id);
	if (label === undefined) {
		return {};
	}
	const shape = result.labels?.[0];
	if (shape === undefined) {
		return {};
	}
	return { label: { measured: label, box: boxOf(shape) } };
}

/**
 * Whether one node is inside another, at any depth.
 * @param inner The part.
 * @param outer The frame.
 * @param content The content holding the parents.
 * @returns True when outer is an ancestor of inner.
 */
function insideOf(inner: string, outer: string, content: VariantContent): boolean {
	let at = content.nodes.find((node) => node.id === inner)?.parent;
	while (at !== undefined) {
		if (at === outer) return true;
		at = content.nodes.find((node) => node.id === at)?.parent;
	}
	return false;
}

/**
 * A relationship a frame makes to a part inside it leaves the frame's title
 * band, not its outer edge: the engine attaches it to the frame's header
 * face, and read from there the line seems to arrive from outside the frame.
 * The first run crosses the band and is inside the frame, so its start moves
 * in to the bottom of the title.
 * @param edge The relationship.
 * @param points Its route as the engine solved it.
 * @param content The content, for containment.
 * @param nodes The placed cards and frames.
 * @param header Where a frame's title band sits in the solving frame.
 * @returns The route, its start moved when the frame is its source.
 */
function leaveFromTitle(
	edge: SemanticEdge,
	points: readonly Point[],
	content: VariantContent,
	nodes: readonly DrawingNode[],
	header: HeaderSide,
): Point[] {
	const frame = holdingFrame(edge, content, nodes);
	const [start, next] = points;
	if (frame === undefined || start === undefined || next === undefined) return [...points];
	const across = headerAxis(header);
	const along = across === "y" ? "x" : "y";
	const title = frame.box[across] + frame.measured.headerHeight;
	const fromBand = [start[along] === next[along], start[across] <= title, next[across] > title];
	return fromBand.every(Boolean)
		? [{ ...start, [across]: title }, ...points.slice(1)]
		: [...points];
}

/**
 * The frame a relationship leaves for a part inside it, when that is what it is.
 * @param edge The relationship.
 * @param content The content, for containment.
 * @param nodes The placed cards and frames.
 * @returns The frame, or undefined for any other relationship.
 */
function holdingFrame(
	edge: SemanticEdge,
	content: VariantContent,
	nodes: readonly DrawingNode[],
): DrawingNode | undefined {
	const frame = nodes.find((node) => node.measured.node.id === edge.from);
	if (frame === undefined || frame.measured.headerHeight === 0) return undefined;
	return insideOf(edge.to, edge.from, content) ? frame : undefined;
}

/**
 * Match final route and label geometry to every relationship in the view.
 * @param content The semantic connections in drawing order.
 * @param laidOut The engine's complete graph.
 * @param measured Text measurement for the optional label.
 * @param nodes The placed cards and frames, for a frame's own departures.
 * @param header Where a frame's title band sits in the solving frame.
 * @returns Every drawn edge; missing routes are errors, never silent omissions.
 */
function drawingEdges(
	content: VariantContent,
	laidOut: ElkNode,
	measured: MeasuredArchitecture,
	nodes: readonly DrawingNode[],
	header: HeaderSide,
): DrawingEdge[] {
	const results = new Map(laidOut.edges?.map((edge) => [edge.id, edge]));
	const routes = straightenJogs(
		new Map(
			content.edges.map((edge) => [
				edge.id,
				leaveFromTitle(
					edge,
					simplify(
						(laidOut.edges?.filter((part) => part.id.split(":")[0] === edge.id) ?? []).flatMap(
							pointsOf,
						),
					),
					content,
					nodes,
					header,
				),
			]),
		),
		nodes.map((node) => node.box),
	);
	return content.edges.map((edge) => {
		const result = results.get(edge.id);
		if (result === undefined) {
			throw new Error(`Layout did not return relationship ${edge.id}`);
		}
		const points = routes.get(edge.id)!;
		const curve = curveThrough(points, routeCrossings(points, routes.values()));
		return {
			edge,
			curve,
			path: pathOf(curve),
			...drawingLabel(result, measured),
		};
	});
}

/**
 * Settle a board read one way: solved in the one frame, turned back onto
 * the page, under its predecessor's flank rule or, on a first render, the
 * first rule.
 * @param reading The way the page reads, and whether its layers fold.
 * @param content The architecture meaning.
 * @param measured Its measured sizes, on the page.
 * @param predecessor The preceding drawing of this view, on the page.
 * @returns The settled drawing, on the page.
 */
async function settleIn(
	reading: Reading,
	content: VariantContent,
	measured: MeasuredArchitecture,
	predecessor: ArchitectureDrawing | undefined,
): Promise<ArchitectureDrawing> {
	const rule = predecessor === undefined ? FLANK_RULES[0]! : flankRule(predecessor.flanks);
	return settleUnder(reading, rule, content, measured, predecessor);
}

/**
 * On a first render, settle the chosen reading under every other flank rule
 * and keep the drawing the scorecard prefers (docs/design/layout-rules.md
 * section 21). The reading is chosen under the first rule, so each other
 * rule costs one settle, not one per reading. A folded reading keeps the
 * first rule: whether a fold reads well is judged when it is chosen.
 * @param chosen The first render in its chosen reading, under the first rule.
 * @param content The architecture meaning.
 * @param measured Its measured sizes, on the page.
 * @returns The kept drawing.
 */
async function chooseFlanks(
	chosen: ArchitectureDrawing,
	content: VariantContent,
	measured: MeasuredArchitecture,
): Promise<ArchitectureDrawing> {
	if (chosen.wrapped) return chosen;
	const reading = { direction: chosen.direction, wrapped: false };
	const others = await Promise.all(
		FLANK_RULES.slice(1).map((rule) =>
			// A rule the engine refuses is simply not a candidate.
			settleUnder(reading, rule, content, measured, undefined).catch(() => undefined),
		),
	);
	return bestOf([chosen, ...others.filter((drawing) => drawing !== undefined)]);
}

/**
 * Settle a board read one way under one flank rule.
 * @param reading The way the page reads, and whether its layers fold.
 * @param reading.direction Down the page, or left to right.
 * @param reading.wrapped Whether the layers fold toward the pane's shape.
 * @param flanks Which flank returns travel and how skips attach.
 * @param content The architecture meaning.
 * @param measured Its measured sizes, on the page.
 * @param predecessor The preceding drawing of this view, on the page.
 * @returns The settled drawing, on the page.
 */
async function settleUnder(
	{ direction, wrapped }: Reading,
	flanks: FlankRule,
	content: VariantContent,
	measured: MeasuredArchitecture,
	predecessor: ArchitectureDrawing | undefined,
): Promise<ArchitectureDrawing> {
	const problem: Problem = {
		content,
		measured: measuredInFrame(direction, measured),
		predecessor: predecessor === undefined ? undefined : drawingAcross(direction, predecessor),
		direction,
		wrapped,
		header: headerSideOf(direction),
		flanks,
	};
	const drawing = await settleWithAddedSkips(
		problem,
		async (first) => (await attemptLabels(first, new Set(), 0)).drawing,
		(each) =>
			settleLabels((reserved, stacked) => attemptLabels(each, reserved, stacked), new Set()),
	);
	return drawingAcross(direction, drawing);
}

/**
 * Route with measured spacing, reserving only labels that need their own layer.
 * @param content The architecture meaning, including its containment links.
 * @param measured Fixed card and label dimensions and minimum frame dimensions.
 * @param predecessor Geometry inherited from the preceding reading of this view.
 * @returns The only placement, routing and label result consumed by painting.
 */
async function layoutCompound(
	content: VariantContent,
	measured: MeasuredArchitecture,
	predecessor?: ArchitectureDrawing,
): Promise<PaintedDrawing> {
	if (predecessor !== undefined) measured = preserveSizes(measured, predecessor);
	const reused =
		predecessor === undefined ? undefined : reuseDrawing(content, measured, predecessor);
	/**
	 * Choose the reading, then on a first render the flank rule within it.
	 * @returns The settled drawing.
	 */
	const read = async (): Promise<ArchitectureDrawing> => {
		const chosen = await chooseReading(measured, predecessor, (reading) =>
			settleIn(reading, content, measured, predecessor),
		);
		return predecessor === undefined ? chooseFlanks(chosen, content, measured) : chosen;
	};
	const drawing = reused ?? (await read());
	// Bridges are part of the geometry a reader sees, so they are settled here
	// and not by a painter; the un-bridged routes stay beside them for a
	// successor to seed from.
	return { ...drawing, bridged: bridgeCrossings(drawing) };
}

/**
 * Seed all measured relationships before omitting unneeded label reservations.
 * @param problem The board, in the solving frame.
 * @param reserved Relationships that could not fit a badge on an ordinary run.
 * @returns The next complete engine input.
 */
function graphForLabels(problem: Problem, reserved: ReadonlySet<string>): ElkNode {
	const { content, measured, predecessor, header, added } = problem;
	const graph = compoundGraph(content, measured, predecessor, header, problem.flanks, added);
	if (predecessor !== undefined) seedPredecessor(graph, content, predecessor);
	if (problem.wrapped) {
		// Fold the layers toward the pane's shape, like a long line of text.
		graph.layoutOptions = {
			...graph.layoutOptions,
			"elk.layered.wrapping.strategy": "SINGLE_EDGE",
			"elk.aspectRatio": String(foldAspect(problem.direction)),
		};
	}
	for (const edge of graph.edges ?? []) {
		if (!reserved.has(edge.id)) edge.labels = [];
	}
	return graph;
}

/**
 * Whether a label was drawn somewhere other than the box the engine reserved.
 * @param reserved The engine's box.
 * @param drawn The box it was drawn in.
 * @returns True when the two differ by more than rounding.
 */
function movedOff(reserved: Box, drawn: Box | undefined): boolean {
	return drawn === undefined || Math.hypot(reserved.x - drawn.x, reserved.y - drawn.y) > 0.5;
}

/**
 * Solve once and place every label that has a clear run.
 * @param problem The board, in the solving frame.
 * @param reserved Labels given dedicated engine space.
 * @param stacked How many badges beyond one the gaps between rows hold.
 * @returns The drawing, the measured labels it left without a box, and the reserved labels drawn elsewhere.
 */
async function attemptLabels(
	problem: Problem,
	reserved: ReadonlySet<string>,
	stacked: number,
): Promise<LabelAttempt> {
	const { content, measured, predecessor, header } = problem;
	const laidOut = await solveGraph(graphForLabels(problem, reserved), measured, stacked);
	const nodes = drawingNodes(laidOut.children ?? [], measured, 0);
	const extent = boxOf(laidOut);
	const solved = drawingEdges(content, laidOut, measured, nodes, header);
	const drawing = placeLabelsOnRuns(
		{
			direction: problem.direction,
			wrapped: problem.wrapped,
			flanks: problem.flanks.name,
			width: extent.width,
			height: extent.height,
			cards: nodes.filter((node) => node.measured.headerHeight === 0),
			containers: nodes.filter((node) => node.measured.headerHeight > 0),
			edges: solved,
		},
		measured.labels,
		predecessor,
		header,
	);
	const missing = drawing.edges.filter(
		({ edge, label }) => measured.labels.has(edge.id) && label === undefined,
	);
	const unused = solved.flatMap(({ edge, label }, index) =>
		label !== undefined && movedOff(label.box, drawing.edges[index]?.label?.box) ? [edge.id] : [],
	);
	return { drawing, missing, unused };
}

export { layoutCompound, settleIn };
