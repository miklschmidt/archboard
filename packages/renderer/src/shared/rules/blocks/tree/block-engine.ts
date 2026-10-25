// The block engine: the board, every container and every group region laid
// out as a block of its own, compact around what it holds, and every
// relationship drawn on tracks through the ports where it crosses a block's
// edge. The track engine is the same engine with every container and region
// drawn inline, as clusters of the board's one layout. The renderer core lays
// each way out and routes it where the layout engines run
// (`crates/archboard-layout`, ADR 0057), and the one that reads best is
// chosen here (`solves.ts`); here the geometry becomes the drawing.
import type { ElkNode } from "@archboard/elk-rs";
import { isMemberOf, type VariantContent } from "@archboard/board/content";
import type { ChangeKind } from "@archboard/board/comparison";
import type {
	ArchitectureDrawing,
	DrawingEdge,
	MeasuredArchitecture,
	PaintedDrawing,
} from "#shared/rules/render/drawing.ts";
import { bridgeCrossings } from "#shared/rules/layout/routes/crossings.ts";
import { fittedPage } from "#shared/rules/layout/page-fit.ts";
import { compoundGraph } from "#shared/rules/layout/compound-graph.ts";
import { curveThrough, pathOf, selfLoop } from "#shared/rules/layout/routes/curves.ts";
import { placedBlocks, type Placed } from "#shared/rules/blocks/tree/solves.ts";

/**
 * What a group's region in one container holds, for a viewer to light it with: the cards and
 * containers the group gathers there, and every card inside one of those that is in the group
 * too. A card in several groups is drawn only with the first of them (ADR 0038), so a later
 * group's region does not hold it.
 * @param content The content drawn.
 * @param gathered The group each node is gathered into a region with, by node id.
 * @param group The region's group.
 * @param parent The container the region sits in; absent on the board itself.
 * @returns The ids, in the board's order.
 */
function regionMembers(
	content: VariantContent,
	gathered: ReadonlyMap<string, string> | undefined,
	group: string,
	parent: string | undefined,
): string[] {
	const parents = new Map(content.nodes.map((node) => [node.id, node.parent]));
	const held = new Set(
		content.nodes
			.filter((node) => node.parent === parent && gathered?.get(node.id) === group)
			.map(({ id }) => id),
	);
	/**
	 * Whether a node is one the region holds, or sits inside one.
	 * @param id The node.
	 * @returns True when it does.
	 */
	const inside = (id: string): boolean => {
		for (let at: string | undefined = id; at !== undefined; at = parents.get(at))
			if (held.has(at)) return true;
		return false;
	};
	return content.nodes
		.filter((node) => held.has(node.id) || (isMemberOf(node, group) && inside(node.id)))
		.map(({ id }) => id);
}

/**
 * The drawing the block engine's geometry describes.
 * @param content The architecture.
 * @param measured Its measured cards, labels and captions.
 * @param placed The geometry.
 * @returns The drawing.
 */
function drawingOf(
	content: VariantContent,
	measured: MeasuredArchitecture,
	placed: Placed,
): ArchitectureDrawing {
	const cards = placed.cards.map(({ id, box, depth }) => ({
		measured: measured.nodes.get(id)!,
		box,
		depth,
	}));
	const containers = placed.frames.map(({ id, box, depth, header }) => {
		const node = measured.nodes.get(id)!;
		// The header as wide as the layout made room for (TASK-486).
		return { measured: header === undefined ? node : node.headers![header]!, box, depth };
	});
	const boxes = new Map(
		[...cards, ...containers].map(({ measured: { node }, box }) => [node.id, box]),
	);
	const routes = new Map(placed.edges.map((edge) => [edge.id, edge]));
	const edges: DrawingEdge[] = content.edges
		.toSorted((one, other) => one.order - other.order)
		.map((edge) => {
			const route = routes.get(edge.id);
			const label = measured.labels.get(edge.id);
			const curve =
				route === undefined || route.points.length < 2
					? selfLoop(boxes.get(edge.from)!, false)
					: curveThrough(route.points, true);
			return {
				edge,
				curve,
				path: pathOf(curve),
				...(label === undefined || route?.label === undefined
					? {}
					: { label: { measured: label, box: route.label } }),
			};
		});
	const regions = placed.regions.flatMap(({ group, parent, box, caption, depth }) => {
		const words = measured.groups?.captions.get(group);
		const members = regionMembers(content, measured.groups?.placing, group, parent);
		return words === undefined
			? []
			: [{ group, parent, members, box, caption: { box: caption, measured: words }, depth }];
	});
	return {
		direction: "down",
		width: placed.width,
		height: placed.height,
		cards,
		containers,
		edges,
		...(regions.length === 0 ? {} : { regions }),
	};
}

/**
 * Lay a measured hierarchy out as blocks, then draw it.
 * @param content The architecture.
 * @param measured Its measured cards and labels.
 * @param graph Its measured hierarchy.
 * @param inline Whether containers and group regions are drawn inline.
 * @returns The drawing painting and the atlas read.
 */
async function drawnBlocks(
	content: VariantContent,
	measured: MeasuredArchitecture,
	graph: ElkNode,
	inline = false,
): Promise<PaintedDrawing> {
	const placed = await placedBlocks(graph, inline);
	const drawing = fittedPage(drawingOf(content, measured, placed));
	return { ...drawing, bridged: bridgeCrossings(drawing, measured.lines) };
}

/**
 * Lay an architecture out as blocks.
 * @param content The architecture.
 * @param measured Its measured cards and labels.
 * @param standings Comparison standings, which keep marked relationships off one trunk.
 * @param entries Each child that is an entry point of its container, true when first; Blocks does not read them.
 * @returns The drawing painting and the atlas read.
 */
async function layoutBlocks(
	content: VariantContent,
	measured: MeasuredArchitecture,
	standings: Readonly<Record<string, ChangeKind>> | undefined,
	entries: ReadonlyMap<string, boolean>,
): Promise<PaintedDrawing> {
	return drawnBlocks(content, measured, compoundGraph(content, measured, standings, entries));
}

/**
 * The track engine: the board laid out as one block with its containers and
 * group regions drawn inline, its cards ranked across them as one board, each
 * container's entry points on its first row over its hidden parts, its wide
 * ranks wrapped and its tall columns folded when that reads better.
 * @param content The architecture.
 * @param measured Its measured cards and labels.
 * @param standings Comparison standings, which keep marked relationships off one trunk.
 * @param entries Each child that is an entry point of its container, true when first (ADR 0044).
 * @returns The drawing painting and the atlas read.
 */
async function layoutTracks(
	content: VariantContent,
	measured: MeasuredArchitecture,
	standings: Readonly<Record<string, ChangeKind>> | undefined,
	entries: ReadonlyMap<string, boolean>,
): Promise<PaintedDrawing> {
	return drawnBlocks(
		content,
		measured,
		compoundGraph(content, measured, standings, entries, true),
		true,
	);
}

export { layoutBlocks, layoutTracks };
