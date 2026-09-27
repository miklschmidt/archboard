// A block's lines to and from its side walls: which wall a line leaves or
// enters by, the lines drawn straight from a card's side to its wall,
// running such a line onto the wall once routed, and the points the block's
// parent must route around.
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { walledPoints } from "@/transformers/semantic-renderer/lib/blocks/card-graph";
import { PORT } from "@/transformers/semantic-renderer/lib/blocks/leaves";
import type { Block, BlockTree, Line } from "@/transformers/semantic-renderer/lib/blocks/tree";
import { LANE } from "@/transformers/semantic-renderer/lib/track/chains";
import type { Item, Scene } from "@/transformers/semantic-renderer/lib/track/scene";

/** A line drawn straight from a card's side to the block's wall. */
interface Beside {
	readonly key: string;
	readonly card: string;
	readonly wall: "left" | "right";
}

/**
 * The wall a line leaves the block by, when its port is on one.
 * @param block The block.
 * @param line The line.
 * @returns The wall, or nothing for a line Graphviz ranks.
 */
function wallOf(block: Block, line: Line): "left" | "right" | undefined {
	const side = block.ports.get(line.to);
	return side === "left" || side === "right" ? side : undefined;
}

/**
 * The wall a line enters the block by, when its port is on one.
 * @param block The block.
 * @param line The line.
 * @returns The wall, or nothing.
 */
function entersBy(block: Block, line: Line): "left" | "right" | undefined {
	const side = block.ports.get(line.from);
	return side === "left" || side === "right" ? side : undefined;
}

/**
 * Every point the lines of a block inside the board draw, which its parent
 * must route around: all but the end where a line to or from a wall meets
 * the wall, which stands where the block ends. The board's own lines are
 * fitted on the page when it is drawn.
 * @param block The block.
 * @param lines Every line's points.
 * @returns The points.
 */
function innerPoints(block: Block, lines: ReadonlyMap<string, Point[]>): Point[] {
	if (block.kind === "root") return [];
	return [...block.lines.values()].flatMap((line) => {
		const points = lines.get(line.key) ?? [];
		if (wallOf(block, line) !== undefined) return points.slice(0, -1);
		return entersBy(block, line) === undefined ? points : points.slice(1);
	});
}

/**
 * Run every line to a wall onto the block's own wall, and stand its port there.
 * @param block The block.
 * @param lines Every line's points, the lines to a wall ending on their tracks; those are replaced.
 * @param boxes Every box, to which the side ports are added.
 * @param width The block's width.
 * @returns The height of every such line's track, which the block must hold.
 */
function wallLines(
	block: Block,
	lines: Map<string, Point[]>,
	boxes: Map<string, Box>,
	width: number,
): number[] {
	return [...block.lines.values()].flatMap((line) => {
		const points = lines.get(line.key);
		const leaves = wallOf(block, line);
		const enters = entersBy(block, line);
		if (points === undefined) return [];
		const moved = walledPoints(points, { leaves, enters }, width);
		if (moved === undefined) return [];
		lines.set(line.key, moved);
		const end = leaves === undefined ? moved[0]! : moved.at(-1)!;
		const port = leaves === undefined ? line.from : line.to;
		boxes.set(port, { x: end.x - PORT / 2, y: end.y - PORT / 2, width: PORT, height: PORT });
		return [end.y + LANE];
	});
}

/**
 * The lines that leave a container or a cluster by a wall straight from their
 * card's side: a card that stands outermost on its band toward the wall, with
 * nothing between, and no other line to that wall from that side. Routed on
 * the tracks, such a line leaves its card by the bottom and runs along the
 * channel under it, a hook under the card's corner. Two lines from one side
 * are left to the tracks, whose order the block's parent keeps; standing a
 * lane apart on the side, the parent's trunks could cross them. A group
 * region keeps its lines on the tracks: packed tight among its parent's
 * other regions, the lower wall port and the shorter region it made moved
 * the parent's trunks into more crossings (Browser application whole).
 * @param block The block.
 * @param tree The blocks.
 * @param scene The placed scene.
 * @returns The lines.
 */
function besideWalls(block: Block, tree: BlockTree, scene: Scene): Beside[] {
	if (block.kind === "region") return [];
	const beside = [...block.lines.values()].flatMap((line) => {
		const wall = wallOf(block, line);
		const item = scene.cards.get(line.from);
		if (wall === undefined || !tree.cards.has(line.from) || item === undefined) return [];
		if (block.clusterOf.has(line.from) || !outermost(scene, item, wall)) return [];
		return [{ key: line.key, card: line.from, wall }];
	});
	const sides = beside.map(({ card, wall }) => `${card}|${wall}`);
	return beside.filter(
		(_, index) => sides.indexOf(sides[index]!) === sides.lastIndexOf(sides[index]!),
	);
}

/**
 * Whether nothing stands between a card and a wall on the card's band.
 * @param scene The placed scene.
 * @param item The card.
 * @param wall The wall.
 * @returns True when nothing does.
 */
function outermost(scene: Scene, item: Item, wall: "left" | "right"): boolean {
	const items = [...scene.cards.values(), ...scene.labels.values(), ...scene.titles.values()];
	return items.every((one) => {
		const { box } = one;
		if (one === item || one.band !== item.band || box.width <= PORT) return true;
		return wall === "right" ? box.x < item.box.x + item.box.width : box.x + box.width > item.box.x;
	});
}

/**
 * The points of the lines drawn straight from a card's side to a wall,
 * level with the card's middle.
 * @param scene The routed scene.
 * @param beside The lines.
 * @param left How far every x moves.
 * @returns Each line's points, from its card; the end at the wall stands a
 * lane out from the card, and is run onto the wall once the block's width is known.
 */
function besidePoints(scene: Scene, beside: readonly Beside[], left: number): Map<string, Point[]> {
	return new Map(
		beside.map(({ key, card, wall }) => {
			const box = scene.moved(scene.cards.get(card)!, left);
			const [y, x] = [box.y + box.height / 2, wall === "right" ? box.x + box.width : box.x];
			return [
				key,
				[
					{ x, y },
					{ x: x + (wall === "right" ? LANE : -LANE), y },
				],
			];
		}),
	);
}

export { besidePoints, besideWalls, entersBy, innerPoints, wallLines, wallOf };
