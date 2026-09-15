// One layout owner settles cards, frames, ports, routes and label boxes together.
// No subsequent paint or atlas pass is allowed to repair these coordinates.
import ELK from "elkjs/lib/elk-api.js";
import type { ElkExtendedEdge, ElkNode, ElkShape, LayoutOptions } from "elkjs/lib/elk-api";
import type { VariantContent } from "@/shared/semantic-board/index";
import type {
	ArchitectureDrawing,
	PaintedDrawing,
	DrawingEdge,
	DrawingNode,
	MeasuredArchitecture,
} from "@/runtime/semantic-renderer/lib/drawing";
import type { Box, Point } from "@/runtime/semantic-renderer/lib/geometry";
import {
	preserveSizes,
	reuseDrawing,
	seedPredecessor,
} from "@/runtime/semantic-renderer/lib/layout/compound-predecessor";
import { placeLabelsOnRuns } from "@/runtime/semantic-renderer/lib/layout/label-runs";
import { bridgeCrossings } from "@/runtime/semantic-renderer/lib/layout/crossings";
import { curveThrough, pathOf, simplify } from "@/runtime/semantic-renderer/lib/layout/curves";
import {
	COMPOUND_OPTIONS,
	compoundGraph,
} from "@/runtime/semantic-renderer/lib/layout/compound-graph";

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
 * @returns Its solved geometry.
 */
async function solveGraph(graph: ElkNode, measured: MeasuredArchitecture): Promise<ElkNode> {
	const owner = engineForDrawing();
	owner.pending += 1;
	owner.worker.ref();
	try {
		const height = Math.max(0, ...[...measured.labels.values()].map((label) => label.height));
		const nodeAir = Number(COMPOUND_OPTIONS["elk.spacing.labelNode"]);
		const labelAir = Number(COMPOUND_OPTIONS["elk.spacing.labelLabel"]);
		// The engine's post-compaction refuses a hierarchy ("invalid hitboxes for
		// scanline constraint calculation"), so a board with a frame is laid out
		// without it and a flat board is pulled together.
		const hierarchical = (graph.children ?? []).some((node) => (node.children?.length ?? 0) > 0);
		const options: LayoutOptions = hierarchical
			? { ...COMPOUND_OPTIONS, "elk.layered.compaction.postCompaction.strategy": "NONE" }
			: COMPOUND_OPTIONS;
		return await owner.engine.layout(graph, {
			layoutOptions:
				height === 0
					? options
					: {
							...options,
							"elk.layered.spacing.nodeNodeBetweenLayers": String(
								Math.max(
									Number(COMPOUND_OPTIONS["elk.layered.spacing.nodeNodeBetweenLayers"]),
									height + 2 * nodeAir,
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
 * Intersect two perpendicular segments, excluding their endpoints.
 * @param from The first segment's start.
 * @param to The first segment's end.
 * @param start The other segment's start.
 * @param end The other segment's end.
 * @returns Their proper crossing, when neither segment ends there.
 */
function perpendicularCrossing(
	from: Point,
	to: Point,
	start: Point,
	end: Point,
): Point | undefined {
	const dx = to.x - from.x,
		dy = to.y - from.y;
	const otherX = end.x - start.x,
		otherY = end.y - start.y;
	if (dx * otherX + dy * otherY !== 0) return undefined;
	const determinant = dx * otherY - dy * otherX;
	if (determinant === 0) return undefined;
	const offsetX = start.x - from.x,
		offsetY = start.y - from.y;
	const along = (offsetX * otherY - offsetY * otherX) / determinant;
	const across = (offsetX * dy - offsetY * dx) / determinant;
	if (Math.min(along, 1 - along, across, 1 - across) <= 0) return undefined;
	return { x: from.x + along * dx, y: from.y + along * dy };
}

/**
 * Find proper perpendicular crossings before rounding consumes their straight legs.
 * Shared endpoints, overlapping lines and this route's own corners are excluded.
 * @param route One complete semantic route.
 * @param others All complete routes in this drawing.
 * @returns The crossings whose bridge space must survive corner rounding.
 */
function routeCrossings(route: readonly Point[], others: Iterable<readonly Point[]>): Point[] {
	const crossings: Point[] = [];
	for (const other of others) {
		if (route === other) continue;
		for (let index = 1; index < route.length; index += 1) {
			for (let crossingIndex = 1; crossingIndex < other.length; crossingIndex += 1) {
				const crossing = perpendicularCrossing(
					route[index - 1]!,
					route[index]!,
					other[crossingIndex - 1]!,
					other[crossingIndex]!,
				);
				if (crossing !== undefined) crossings.push(crossing);
			}
		}
	}
	return crossings;
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
 * Match final route and label geometry to every relationship in the view.
 * @param content The semantic connections in drawing order.
 * @param laidOut The engine's complete graph.
 * @param measured Text measurement for the optional label.
 * @returns Every drawn edge; missing routes are errors, never silent omissions.
 */
function drawingEdges(
	content: VariantContent,
	laidOut: ElkNode,
	measured: MeasuredArchitecture,
): DrawingEdge[] {
	const results = new Map(laidOut.edges?.map((edge) => [edge.id, edge]));
	const routes = new Map(
		content.edges.map((edge) => [
			edge.id,
			simplify(
				(laidOut.edges?.filter((part) => part.id.split(":")[0] === edge.id) ?? []).flatMap(
					pointsOf,
				),
			),
		]),
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
	const drawing = reused ?? (await settleLabels(content, measured, predecessor, new Set()));
	// Bridges are part of the geometry a reader sees, so they are settled here
	// and not by a painter; the un-bridged routes stay beside them for a
	// successor to seed from.
	return { ...drawing, bridged: bridgeCrossings(drawing) };
}

/**
 * Seed all measured relationships before omitting unneeded label reservations.
 * @param content Current semantic subjects.
 * @param measured Their measured dimensions.
 * @param predecessor The immediately preceding drawing.
 * @param reserved Relationships that could not fit a badge on an ordinary run.
 * @returns The next complete engine input.
 */
function graphForLabels(
	content: VariantContent,
	measured: MeasuredArchitecture,
	predecessor: ArchitectureDrawing | undefined,
	reserved: ReadonlySet<string>,
): ElkNode {
	const graph = compoundGraph(content, measured, predecessor);
	if (predecessor !== undefined) seedPredecessor(graph, content, predecessor);
	for (const edge of graph.edges ?? []) {
		if (!reserved.has(edge.id)) edge.labels = [];
	}
	return graph;
}

/**
 * Add reservations monotonically until every measured label has a final box.
 * @param content Current semantic subjects.
 * @param measured Their fixed measured dimensions.
 * @param predecessor The same inherited drawing for every attempt.
 * @param reserved Labels already found to require dedicated engine space.
 * @returns One final drawing with every relationship and label present.
 */
async function settleLabels(
	content: VariantContent,
	measured: MeasuredArchitecture,
	predecessor: ArchitectureDrawing | undefined,
	reserved: Set<string>,
): Promise<ArchitectureDrawing> {
	const laidOut = await solveGraph(
		graphForLabels(content, measured, predecessor, reserved),
		measured,
	);
	const nodes = drawingNodes(laidOut.children ?? [], measured, 0);
	const extent = boxOf(laidOut);
	const drawing = placeLabelsOnRuns(
		{
			width: extent.width,
			height: extent.height,
			cards: nodes.filter((node) => node.measured.headerHeight === 0),
			containers: nodes.filter((node) => node.measured.headerHeight > 0),
			edges: drawingEdges(content, laidOut, measured),
		},
		measured.labels,
		predecessor,
	);
	const missing = drawing.edges.filter(
		({ edge, label }) => measured.labels.has(edge.id) && label === undefined,
	);
	if (missing.length === 0) return drawing;
	// Each retry adds a reservation; the measured label count bounds the work.
	for (const { edge } of missing) {
		if (reserved.has(edge.id))
			throw new Error(`Layout omitted the reserved label for relationship ${edge.id}`);
		reserved.add(edge.id);
	}
	return settleLabels(content, measured, predecessor, reserved);
}

export { layoutCompound };
