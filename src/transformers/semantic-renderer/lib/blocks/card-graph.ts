// The Graphviz graph a block of cards starts from, and the small geometry its
// layout reads back: a label's box where Graphviz put it, and a line run onto
// the block's wall.
import type { ElkLabel } from "@archboard/elk-rs";
import type { Graph } from "@viz-js/viz";
import { CONTAINER_INSET } from "@/transformers/semantic-renderer/config";
import type { Point } from "@/transformers/semantic-renderer/lib/geometry";

/** Horizontal room Graphviz keeps between neighbours in a rank. */
const NODE_GAP = 40;
/** Vertical room Graphviz keeps between ranks; the router spaces ranks again from its tracks. */
const RANK_GAP = 28;
/** A Graphviz node. */
type VendorNode = NonNullable<Graph["nodes"]>[number];

/**
 * An empty Graphviz graph with the block settings.
 * @returns The vendor graph.
 */
function emptyGraph(): Graph & Required<Pick<Graph, "nodes" | "edges" | "subgraphs">> {
	return {
		directed: true,
		graphAttributes: {
			rankdir: "TB",
			// More passes at ordering each rank, and one more over the whole: fewer
			// crossings on the dogfood boards (244 to 224) at no measurable cost.
			mclimit: 4,
			remincross: true,
			splines: "polyline",
			nodesep: NODE_GAP / 72,
			ranksep: RANK_GAP / 72,
			pad: 0,
			// Graphviz keeps the clusters directly in a graph its margin apart on a
			// rank: top-level containers stand as far apart as nested ones.
			margin: CONTAINER_INSET,
		},
		nodeAttributes: { shape: "box", fixedsize: true, label: "", margin: 0 },
		edgeAttributes: { dir: "none" },
		nodes: [],
		edges: [],
		subgraphs: [],
	};
}

/**
 * A line's label box, where Graphviz put it.
 * @param id The line's id.
 * @param label The measured label.
 * @param centre Where Graphviz centred its box.
 * @returns The placed label.
 */
function placedLabel(id: string, label: ElkLabel, centre: Point): ElkLabel {
	const width = label.width!;
	const height = label.height!;
	return { id: `${id}:label`, width, height, x: centre.x - width / 2, y: centre.y - height / 2 };
}

/**
 * A line's points run onto the block's wall: its last point when it leaves
 * by a wall, its first when it enters by one.
 * @param points The line's points, from its source.
 * @param walls The walls it leaves or enters by.
 * @param walls.leaves The wall it leaves by, if any.
 * @param walls.enters The wall it enters by, if any.
 * @param width The block's width.
 * @returns The moved points, or nothing when the line meets no wall.
 */
function walledPoints(
	points: readonly Point[],
	walls: { leaves: "left" | "right" | undefined; enters: "left" | "right" | undefined },
	width: number,
): Point[] | undefined {
	if (walls.leaves !== undefined)
		return [
			...points.slice(0, -1),
			{ x: walls.leaves === "left" ? 0 : width, y: points.at(-1)!.y },
		];
	if (walls.enters !== undefined)
		return [{ x: walls.enters === "left" ? 0 : width, y: points[0]!.y }, ...points.slice(1)];
	return undefined;
}

export { emptyGraph, placedLabel, walledPoints, type VendorNode };
