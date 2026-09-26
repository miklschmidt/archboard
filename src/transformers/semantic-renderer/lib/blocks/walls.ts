// A block's lines to and from its side walls: which wall a line leaves or
// enters by, running such a line onto the wall once routed, and the points
// the block's parent must route around.
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { walledPoints } from "@/transformers/semantic-renderer/lib/blocks/card-graph";
import { PORT } from "@/transformers/semantic-renderer/lib/blocks/leaves";
import type { Block, Line } from "@/transformers/semantic-renderer/lib/blocks/tree";
import { LANE } from "@/transformers/semantic-renderer/lib/track/chains";

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

export { entersBy, innerPoints, wallLines, wallOf };
