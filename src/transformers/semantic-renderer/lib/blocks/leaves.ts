// A block of cards' placed leaves, set right where Graphviz leaves them
// off: the header in its corner, with the ports on its rank beside it.
import type { ElkNode } from "@archboard/elk-rs";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import type { Insets, Laid } from "@/transformers/semantic-renderer/lib/blocks/laid";
import type { Rim } from "@/transformers/semantic-renderer/lib/track/spacing";
import { LANE } from "@/transformers/semantic-renderer/lib/track/chains";
import { extentOf } from "@/transformers/semantic-renderer/lib/track/labels";
import type { Item, Scene } from "@/transformers/semantic-renderer/lib/track/scene";
import type { Nesting } from "@/transformers/semantic-renderer/lib/blocks/inline";
import { roomOf, sideRoom } from "@/transformers/semantic-renderer/lib/blocks/lone";
import type { Block, BlockTree } from "@/transformers/semantic-renderer/lib/blocks/tree";

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
 * cards under them right by its width.
 * @param leaves Every placed leaf; the header's and those on its rank move in place.
 * @param id The header's id.
 */
function cornerHeader(leaves: readonly ElkNode[], id: string): void {
	const header = leaves.find((leaf) => leaf.id === id);
	if (header === undefined) return;
	header.x = Math.min(...leaves.filter((leaf) => leaf !== header).map(({ x }) => x!));
	const beside = leaves
		.filter((leaf) => leaf !== header && level(leaf, header))
		.toSorted((one, other) => one.x! - other.x!);
	let free = header.x + header.width! + LANE;
	for (const leaf of beside) {
		leaf.x = Math.max(leaf.x!, free);
		free = leaf.x + leaf.width! + LANE;
	}
}

/**
 * Let a block's own top and bottom ports slide along its edge while it is
 * routed: Graphviz stands them beside the header, which may hold a port away
 * from its line, and a port may then move onto that line's column. A block
 * routed again from where its parent settled its ports slides them on from
 * there. A top port keeps clear of the header, as a settled one does. Under
 * the Blocks engine a block's ports are settled from its parent and held, so
 * nothing slides there, nor at the root, which has no ports of its own.
 * @param scene The block's scene, whose sliding ports are set.
 * @param block The block.
 * @param nesting How containers and group regions are drawn.
 */
function letPortsSlide(scene: Scene, block: Block, nesting: Nesting): void {
	if (block.kind === "root" || nesting === "blocks") return;
	for (const [item, stretch] of slidesOf(scene, block)) scene.slides.set(item, stretch);
}

/**
 * Mark the items of a block's scene that stand for group regions: a region
 * packed whole, and a card laid out as the region it is alone in, whose own
 * faces stand in from its box (`lone.ts`). A lane keeps a region's clearance
 * off each, as a region's wall has no inset of its own; but under Blocks,
 * off a packed region only: a block of cards is as wide as its Graphviz
 * ranks, and kept off a card's region there, the lanes beside it pushed the
 * next one along its container's wall (Recording a walkthrough).
 * @param scene The block's scene, whose region items are set.
 * @param block The block.
 * @param tree The blocks.
 */
function markRegions(scene: Scene, block: Block, tree: BlockTree): void {
	for (const item of block.items) {
		const [lone, card] = [tree.lone.get(item), scene.cards.get(item)];
		if (lone !== undefined) card!.inset = sideRoom(card!.box.width, lone);
		if (keepsRegionClearance(tree, item, scene.inline)) scene.regionBlocks.add(card!);
	}
}

/**
 * Whether a lane keeps a region's clearance off an item of a block.
 * @param tree The blocks.
 * @param item The item.
 * @param inline Whether the board is drawn by the Track engine.
 * @returns True for a region packed whole, and under Track a card laid out as its region.
 */
function keepsRegionClearance(tree: BlockTree, item: string, inline: boolean): boolean {
	return (inline && tree.lone.has(item)) || tree.blocks.get(item)?.kind === "region";
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
 * A block's own top and bottom ports in its scene, each with the stretch of
 * its edge it may stand on.
 * @param scene The block's scene.
 * @param block The block.
 * @returns Each port's item and stretch.
 */
function slidesOf(scene: Scene, block: Block): [Item, readonly [number, number]][] {
	const [left, right] = extentOf(scene);
	const clear = block.header === undefined ? left : Math.max(left, block.header.width + LANE);
	return [...block.ports].flatMap(([port, side]): [Item, readonly [number, number]][] => {
		const item = scene.cards.get(port);
		if (item === undefined || side === "left" || side === "right") return [];
		const low = side === "top" ? clear : left;
		return [[item, [low, Math.max(low, right)]]];
	});
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

export { PORT, cornerHeader, letPortsSlide, markRegions, pinnedLeaf, rimOf };
