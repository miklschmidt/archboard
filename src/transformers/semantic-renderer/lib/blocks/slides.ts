// A packed block slid along its row or column to stand over or under the
// blocks its lines reach, where packing centred it on the row instead: its
// lines then drop straight rather than stepping across the gap.
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { SAME, moved } from "@/transformers/semantic-renderer/lib/blocks/laid";
import {
	headerOf,
	type Block,
	type BlockTree,
} from "@/transformers/semantic-renderer/lib/blocks/tree";
import { LANE } from "@/transformers/semantic-renderer/lib/track/chains";

/** How far apart two ends may be and still be one straight run. */
const STRAIGHT = 0.5;

/** What a slide reads of a packed block of blocks. */
interface Packed {
	readonly block: Block;
	readonly tree: BlockTree;
	readonly boxes: Map<string, Box>;
	readonly gap: number;
	facing(tail: string, head: string): { one: Point; other: Point; upright: boolean } | undefined;
}

/**
 * The packed block a line end stands on, when it is a pin on one.
 * @param packed The packed block of blocks.
 * @param end The line end.
 * @returns The block's id, or nothing.
 */
function ownerOf(packed: Packed, end: string): string | undefined {
	return packed.tree.pins.get(end)?.block.id;
}

/**
 * Where a line leaves a packed block and where it reaches another, when it
 * joins the block to another whose pins face each other.
 * @param packed The packed block of blocks.
 * @param id The packed block.
 * @param line The line.
 * @param line.tail Its upper end.
 * @param line.head Its lower end.
 * @returns Its two pins, the block's first, and whether they face over and under.
 */
function faced(
	packed: Packed,
	id: string,
	line: { readonly tail: string; readonly head: string },
): { mine: Point; theirs: Point; upright: boolean } | undefined {
	const owners = [ownerOf(packed, line.tail), ownerOf(packed, line.head)];
	if (!owners.includes(id)) return undefined;
	const facing = packed.facing(line.tail, line.head);
	if (facing === undefined) return undefined;
	const { one, other, upright } = facing;
	return owners[1] === id
		? { mine: other, theirs: one, upright }
		: { mine: one, theirs: other, upright };
}

/**
 * Whether a line end is a pin on a container the line ends on: its port
 * leads nowhere inside but to the container's own header, and settles
 * anywhere along its face the line reaches straight, so the line asks no
 * block to slide.
 * @param packed The packed block of blocks.
 * @param end The line end.
 * @returns True when it is.
 */
function enters(packed: Packed, end: string): boolean {
	const pin = packed.tree.pins.get(end);
	if (pin === undefined) return false;
	const inside = [...pin.block.lines.values()].filter(
		({ from, to }) => from === pin.port || to === pin.port,
	);
	return inside.every(({ from, to }) => (from === pin.port ? to : from) === headerOf(pin.block));
}

/**
 * How far each line between a packed block and another, their pins facing
 * each other across the way the packing is read, steps sideways from it.
 * @param packed The packed block of blocks.
 * @param id The packed block.
 * @param across Whether the packing is in rows, so its lines face over and under.
 * @returns Each step, or nothing when a line faces the other way.
 */
function stepsOf(packed: Packed, id: string, across: boolean): number[] | undefined {
	const pairs = [...packed.block.lines.values()]
		.filter(({ tail, head }) => !enters(packed, tail) && !enters(packed, head))
		.flatMap((line) => faced(packed, id, line) ?? []);
	if (pairs.some(({ upright }) => upright !== across)) return undefined;
	return pairs.map(({ mine, theirs }) => (across ? theirs.x - mine.x : theirs.y - mine.y));
}

/**
 * How far a packed block slides to stand in line with the blocks its lines
 * reach: their steps' mean, when they agree to within a lane.
 * @param packed The packed block of blocks.
 * @param id The packed block.
 * @param across Whether the packing is in rows.
 * @returns The slide, or nothing.
 */
function slideOf(packed: Packed, id: string, across: boolean): Point | undefined {
	const steps = stepsOf(packed, id, across) ?? [];
	if (steps.length === 0 || Math.max(...steps) - Math.min(...steps) > LANE) return undefined;
	const step = steps.reduce((sum, one) => sum + one, 0) / steps.length;
	if (Math.abs(step) < STRAIGHT) return undefined;
	return across ? { x: step, y: 0 } : { x: 0, y: step };
}

/**
 * Whether a packed block may slide: it stays within the packed items'
 * extent, so the block never grows, and what it sweeps through keeps the
 * room trunks need from every other, so it never jumps a neighbour.
 * @param packed The packed block of blocks.
 * @param id The packed block.
 * @param by The slide.
 * @param extent Where the packed items stand.
 * @returns True when it may.
 */
function slides(packed: Packed, id: string, by: Point, extent: Box): boolean {
	const from = packed.boxes.get(id)!;
	const to = moved(from, by);
	const inside =
		to.x >= extent.x - SAME &&
		to.x + to.width <= extent.x + extent.width + SAME &&
		to.y >= extent.y - SAME &&
		to.y + to.height <= extent.y + extent.height + SAME;
	const room = packed.gap - 2 * LANE;
	const [low, high] = [Math.min(from.x, to.x), Math.max(from.x, to.x) + from.width];
	const [top, bottom] = [Math.min(from.y, to.y), Math.max(from.y, to.y) + from.height];
	return (
		inside &&
		packed.block.items
			.filter((item) => item !== id)
			.map((item) => packed.boxes.get(item)!)
			.every(
				(other) =>
					high + room <= other.x ||
					other.x + other.width + room <= low ||
					bottom + room <= other.y ||
					other.y + other.height + room <= top,
			)
	);
}

/**
 * Slide each packed block whose lines across the way the packing is read
 * all step the same way to stand in line with the blocks they reach, where
 * it may.
 * @param packed The packed block of blocks; its boxes move.
 * @param across Whether the packing is in rows.
 * @param extent Where the packed items stand.
 * @returns Whether any block slid.
 */
function slideToTrunks(packed: Packed, across: boolean, extent: Box): boolean {
	let slid = false;
	for (const id of packed.block.items) {
		const by = slideOf(packed, id, across);
		if (by === undefined || !slides(packed, id, by, extent)) continue;
		packed.boxes.set(id, moved(packed.boxes.get(id)!, by));
		slid = true;
	}
	return slid;
}

export { slideToTrunks };
