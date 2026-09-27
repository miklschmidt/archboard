// The Graphviz graph a block of cards starts from, the holds it keeps its
// first rank with, and the small geometry its layout reads back: a label's box
// where Graphviz put it, and a line run onto the block's wall.
import type { ElkLabel } from "@archboard/elk-rs";
import type { Graph } from "@viz-js/viz";
import { CONTAINER_INSET } from "@/transformers/semantic-renderer/config";
import type { Point } from "@/transformers/semantic-renderer/lib/geometry";
import { headerOf, type Block } from "@/transformers/semantic-renderer/lib/blocks/tree";

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

/** A block of cards' Graphviz graph. */
type VendorGraph = ReturnType<typeof emptyGraph>;

/**
 * The item a block holds the items no line enters under: its header, or its
 * first top port.
 * @param block The block.
 * @returns The item, or nothing when the block has neither.
 */
function aboveOf(block: Block): string | undefined {
	if (block.header !== undefined) return headerOf(block);
	return [...block.ports].find(([, side]) => side === "top")?.[0];
}

/**
 * The vendor node heading a cluster: a frame's title row or a region's caption.
 * @param cluster The cluster's id.
 * @returns The node's name.
 */
function titleOf(cluster: string): string {
	return `title:${cluster}`;
}

/**
 * Hold the title of every cluster a block draws inline, outside any other, a
 * rank below the block's header or top ports. Graphviz ranks a title no line
 * enters with them, and its words, painted at its cluster's corner, then
 * stand over a port that a line out of the cluster slides to.
 * @param block The block.
 * @param graph Its Graphviz graph; the holds are added.
 */
function holdTitles(block: Block, graph: VendorGraph): void {
	const above = aboveOf(block);
	if (above === undefined) return;
	const outer = [...block.clusters.values()].filter(({ parent }) => parent === undefined);
	graph.edges.push(
		...outer.map(({ id }) => ({
			tail: above,
			head: titleOf(id),
			attributes: { style: "invis", weight: 0, minlen: 1 },
		})),
	);
}

/**
 * Hold every item no line enters on a block's first rank of items, when the
 * block has ports on its bottom. Graphviz ranks those ports last and joins
 * every item no line leaves to them at no cost, so a short chain hangs from
 * the bottom and its cards stand between another chain's rows.
 * @param block The block.
 * @param graph Its Graphviz graph, its lines already in it; the holds are added.
 * @param nodeOf The vendor node of an item.
 */
function holdSources(block: Block, graph: VendorGraph, nodeOf: (name: string) => VendorNode): void {
	holdTitles(block, graph);
	if (![...block.ports.values()].includes("bottom")) return;
	const entered = new Set(graph.edges.map(({ head }) => head));
	const leaving = new Set(graph.edges.map(({ tail }) => tail));
	const sources = block.items.filter((item) => !entered.has(item) && leaving.has(item));
	if (sources.length === 0) return;
	const above = aboveOf(block);
	if (above === undefined) {
		graph.subgraphs.push({ graphAttributes: { rank: "min" }, nodes: sources.map(nodeOf) });
		return;
	}
	graph.edges.push(
		...sources.map((head) => ({
			tail: above,
			head,
			attributes: { style: "invis", weight: 1, minlen: 1 },
		})),
	);
}

export { NODE_GAP, emptyGraph, holdSources, placedLabel, titleOf, walledPoints, type VendorNode };
