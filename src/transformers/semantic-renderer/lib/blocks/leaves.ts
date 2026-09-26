// A block of cards' placed leaves, set right where Graphviz leaves them
// off: the header in its corner, with the ports on its rank beside it.
import type { ElkNode } from "@archboard/elk-rs";
import { LANE } from "@/transformers/semantic-renderer/lib/track/chains";
import { extentOf } from "@/transformers/semantic-renderer/lib/track/labels";
import type { Item, Scene } from "@/transformers/semantic-renderer/lib/track/scene";
import type { Nesting } from "@/transformers/semantic-renderer/lib/blocks/inline";
import type { Block } from "@/transformers/semantic-renderer/lib/blocks/tree";

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
 * from its line, and a port may then move onto that line's column. A top port
 * keeps clear of the header, as a settled one does. Only the Blocks engine
 * settles a block's ports from its parent and routes the block again, so
 * there nothing slides, nor at the root, which has no ports of its own.
 * Either way the scene learns which cards are the block's ports.
 * @param scene The block's scene, whose ports and sliding ports are set.
 * @param block The block.
 * @param nesting How containers and group regions are drawn.
 */
function letPortsSlide(scene: Scene, block: Block, nesting: Nesting): void {
	for (const port of block.ports.keys()) {
		const item = scene.cards.get(port);
		if (item !== undefined) scene.ports.add(item);
	}
	if (block.kind === "root" || nesting === "blocks") return;
	for (const [item, stretch] of slidesOf(scene, block)) scene.slides.set(item, stretch);
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

export { cornerHeader, letPortsSlide };
