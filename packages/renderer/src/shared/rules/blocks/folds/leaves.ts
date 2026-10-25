// A block of cards' placed leaves, set right where Graphviz leaves them
// off: the header in its corner, with the ports on its rank beside it.
import type { ElkNode } from "@archboard/elk-rs";
import type { Box, Point } from "#shared/rules/geometry.ts";
import type { Insets, Laid } from "#shared/rules/blocks/tree/laid.ts";
import type { Rim } from "#shared/rules/track/channels/spacing.ts";
import { LANE } from "#shared/rules/track/routes/chains.ts";
import type { Scene } from "#shared/rules/track/scene/scene.ts";
import { frameWidth, roomOf, sideRoom } from "#shared/rules/blocks/tree/lone.ts";
import { headerOf, type Block, type BlockTree } from "#shared/rules/blocks/tree/tree.ts";
import { headerWithin, type TakenHeader } from "#shared/rules/blocks/cards/headers.ts";

/** The side of a port's square. */
const PORT = 1;

/**
 * Whether two leaves share some height.
 * @param one A leaf.
 * @param other Another.
 * @returns True when they overlap vertically.
 */
function level(one: ElkNode, other: ElkNode): boolean {
	return one.y! < other.y! + other.height! && other.y! < one.y! + one.height!;
}

/**
 * Stand the header in the block's top-left corner, over what the block
 * holds, and every leaf on its rank right of it a lane apart. Graphviz
 * ranks the header as a sliver, so it pushes neither the ports nor the
 * cards under them right by its width. It takes the widest size it has room
 * for there ({@link widened}).
 * @param leaves Every placed leaf; the header's and those on its rank move in place.
 * @param block The block.
 * @param side The block's inset at its sides.
 * @returns The header it took, if it has one.
 */
function cornerHeader(
	leaves: readonly ElkNode[],
	block: Block,
	side: number,
): TakenHeader | undefined {
	const header = leaves.find((leaf) => leaf.id === headerOf(block));
	if (header === undefined) return undefined;
	const others = leaves.filter((leaf) => leaf !== header);
	header.x = Math.min(...others.map(({ x }) => x!));
	const beside = others
		.filter((leaf) => level(leaf, header))
		.toSorted((one, other) => one.x! - other.x!);
	const taken = widened(block, header, { others, beside, side });
	let free = header.x + header.width! + LANE;
	for (const leaf of beside) {
		leaf.x = Math.max(leaf.x!, free);
		free = leaf.x + leaf.width! + LANE;
	}
	return taken;
}

/**
 * Give a block's header the widest size it has room for, now Graphviz has
 * said how wide what the block holds is (TASK-486): no wider than that, so
 * it widens no block, and left of every leaf on its rank, which Graphviz
 * stood where its lines want it, so it pushes none of them aside.
 * @param block The block.
 * @param header The header's leaf, in its corner; it takes the size, about its centre.
 * @param around What stands round it.
 * @param around.others Every other leaf.
 * @param around.beside The leaves on its rank.
 * @param around.side The block's inset at its sides.
 * @returns The header it took.
 */
function widened(
	block: Block,
	header: ElkNode,
	around: { others: readonly ElkNode[]; beside: readonly ElkNode[]; side: number },
): TakenHeader {
	const least = block.header!;
	const content = Math.max(...around.others.map(({ x, width }) => x! + width!)) - header.x!;
	const taken = headerWithin(least, {
		frame: frameWidth(block, content + 2 * around.side),
		content,
		beside: around.beside.map(({ x }) => x! - LANE - header.x!),
	});
	header.y = header.y! + (header.height! - taken.size.height) / 2;
	[header.width, header.height] = [taken.size.width, taken.size.height];
	return taken;
}

/**
 * Mark the items of a block's scene that stand for group regions: a region
 * packed whole, and a card laid out as the region it is alone in, whose own
 * faces stand in from its box (`lone.ts`). A lane keeps a region's clearance
 * off a packed region only, as a region's wall has no inset of its own: a
 * block of cards is as wide as its Graphviz ranks, and kept off a card's
 * region, the lanes beside it pushed the next one along its container's wall
 * (Recording a walkthrough).
 * @param scene The block's scene, whose region items are set.
 * @param block The block.
 * @param tree The blocks.
 */
function markRegions(scene: Scene, block: Block, tree: BlockTree): void {
	for (const item of block.items) {
		const [lone, card] = [tree.lone.get(item), scene.cards.get(item)];
		if (lone !== undefined) card!.inset = sideRoom(card!.box.width, lone);
		if (tree.blocks.get(item)?.kind === "region") scene.regionBlocks.add(card!);
	}
}

/**
 * A pin as a block's scene reads it: a sliver as tall as its child block, at its port's x.
 * @param tree The blocks.
 * @param laid Every block laid out so far.
 * @param pin The pin.
 * @param centres Every vendor node's centre in the block.
 * @returns The placed pin.
 */
function pinnedLeaf(
	tree: BlockTree,
	laid: ReadonlyMap<string, Laid>,
	pin: string,
	centres: ReadonlyMap<string, Point>,
): ElkNode & Box {
	const { block: child, port } = tree.pins.get(pin)!;
	const inner = laid.get(child.id)!;
	const at = inner.boxes.get(port)!;
	const centre = centres.get(child.id)!;
	const x = centre.x - inner.width / 2 + at.x + at.width / 2;
	const y = centre.y - inner.height / 2;
	return { id: pin, x: x - PORT / 2, y, width: PORT, height: inner.height };
}

/**
 * Every leaf under a block's placed nodes, those inside its group regions included.
 * @param nodes The placed nodes.
 * @returns The leaves.
 */
function leavesOf(nodes: readonly ElkNode[]): ElkNode[] {
	return nodes.flatMap((node) => (node.children === undefined ? [node] : leavesOf(node.children)));
}

/**
 * Where a block routed again stands a pin or a block inside it: a pin where
 * its block's settled port now stands, and a block as large as it was routed
 * again, round the same centre. A block inside grows when its own channels
 * need more room: left at its first size, the container round it closed
 * above its foot and lines ran through it.
 * @param tree The blocks.
 * @param laid Every block laid out so far.
 * @param id The leaf's id.
 * @param centres Every vendor node's centre in the block.
 * @returns Its box, or undefined for a leaf that stays where it is.
 */
function settledLeaf(
	tree: BlockTree,
	laid: ReadonlyMap<string, Laid>,
	id: string,
	centres: ReadonlyMap<string, Point>,
): Box | undefined {
	if (tree.pins.has(id)) return pinnedLeaf(tree, laid, id, centres);
	const inner = tree.blocks.has(id) ? laid.get(id) : undefined;
	if (inner === undefined) return undefined;
	const centre = centres.get(id)!;
	const { width, height } = inner;
	return { x: centre.x - width / 2, y: centre.y - height / 2, width, height };
}

/**
 * The room a block of cards keeps where no line turns under its header, a
 * frame's title row or a region's caption tab, and over its bottom ports when
 * they stand on its edge: the inset it keeps at its sides. Alone in a region,
 * it keeps the inset it keeps in none: the region's own room stands outside
 * its edge, and its caption band in its header.
 * @param block The block.
 * @param insets Its insets.
 * @returns The room, or nothing when the block draws no edge.
 */
function rimOf(block: Block, insets: Insets): Rim | undefined {
	if (block.header === undefined) return undefined;
	const own = insets.side - (block.lone === undefined ? 0 : roomOf(block.lone));
	return [...block.ports.values()].includes("bottom") ? { head: own, foot: own } : { head: own };
}

export { PORT, cornerHeader, leavesOf, markRegions, pinnedLeaf, rimOf, settledLeaf };
