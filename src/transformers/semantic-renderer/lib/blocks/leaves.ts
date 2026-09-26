// A block of cards' placed leaves, set right where Graphviz leaves them
// off: the header in its corner, with the ports on its rank beside it.
import type { ElkNode } from "@archboard/elk-rs";
import { LANE } from "@/transformers/semantic-renderer/lib/track/chains";
import { extentOf } from "@/transformers/semantic-renderer/lib/track/labels";
import type { Scene } from "@/transformers/semantic-renderer/lib/track/scene";
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
 * first routed: Graphviz stands them beside the header, which may hold a
 * port away from its line, and a port may then move onto that line's column.
 * A top port keeps clear of the header, as a settled one does.
 * @param scene The block's scene, whose sliding ports are set.
 * @param block The block.
 */
function letPortsSlide(scene: Scene, block: Block): void {
	const [left, right] = extentOf(scene);
	const clear = block.header === undefined ? left : Math.max(left, block.header.width + LANE);
	const faces = [...block.ports].filter(([, side]) => side === "top" || side === "bottom");
	for (const [port, side] of faces) {
		const item = scene.cards.get(port);
		if (item === undefined) continue;
		const low = side === "top" ? clear : left;
		scene.slides.set(item, [low, Math.max(low, right)]);
	}
}

export { cornerHeader, letPortsSlide };
