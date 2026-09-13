// One layout run settles cards, frames, ports, routes and label boxes together.
// No subsequent paint or atlas pass is allowed to repair these coordinates.
import ELK from "elkjs/lib/elk-api.js";
import type { ElkExtendedEdge, ElkNode, ElkShape } from "elkjs/lib/elk-api";
import type { VariantContent } from "@/shared/semantic-board/index";
import type {
	ArchitectureDrawing,
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
 * @returns Its solved geometry.
 */
async function solveGraph(graph: ElkNode): Promise<ElkNode> {
	const owner = engineForDrawing();
	owner.pending += 1;
	owner.worker.ref();
	try {
		return await owner.engine.layout(graph, { layoutOptions: COMPOUND_OPTIONS });
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
 * Join the engine's boundary sections into one semantic relationship.
 * @param result All consecutive sections of the relationship.
 * @returns One rounded path that retains the engine's full traversal.
 */
function curveOf(result: readonly ElkExtendedEdge[]): DrawingEdge["curve"] {
	return curveThrough(simplify(result.flatMap(pointsOf)));
}

/**
 * A measured label must have a final box; dropping its words is never recovery.
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
		throw new Error(`Layout omitted the label for relationship ${result.id}`);
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
	return content.edges.map((edge) => {
		const result = results.get(edge.id);
		if (result === undefined) {
			throw new Error(`Layout did not return relationship ${edge.id}`);
		}
		const parts = laidOut.edges?.filter((part) => part.id.split(":")[0] === edge.id) ?? [];
		const curve = curveOf(parts);
		return {
			edge,
			curve,
			path: pathOf(curve),
			...drawingLabel(result, measured),
		};
	});
}

/**
 * Solve the complete measured compound graph once, then expose final geometry.
 * @param content The architecture meaning, including its containment links.
 * @param measured Fixed card and label dimensions and minimum frame dimensions.
 * @param predecessor Geometry inherited from the preceding reading of this view.
 * @returns The only placement, routing and label result consumed by painting.
 */
async function layoutCompound(
	content: VariantContent,
	measured: MeasuredArchitecture,
	predecessor?: ArchitectureDrawing,
): Promise<ArchitectureDrawing> {
	if (predecessor !== undefined) {
		measured = preserveSizes(measured, predecessor);
		const reused = reuseDrawing(content, measured, predecessor);
		if (reused !== undefined) return reused;
	}
	const graph = compoundGraph(content, measured, predecessor);
	if (predecessor !== undefined) seedPredecessor(graph, content, predecessor);
	const laidOut = await solveGraph(graph);
	const nodes = drawingNodes(laidOut.children ?? [], measured, 0);
	const extent = boxOf(laidOut);
	return {
		width: extent.width,
		height: extent.height,
		cards: nodes.filter((node) => node.measured.headerHeight === 0),
		containers: nodes.filter((node) => node.measured.headerHeight > 0),
		edges: drawingEdges(content, laidOut, measured),
	};
}

export { layoutCompound };
