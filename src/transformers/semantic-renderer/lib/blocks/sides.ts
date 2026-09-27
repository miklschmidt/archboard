// Which edge of each block a relationship crosses, chosen once the board is
// laid out. The tree first sends every relationship out of the bottom of each
// block around its source and into the top of each block around its target
// (upward, the other way round), before anything stands anywhere. Where the
// two blocks it runs between in the block that holds both ends stand beside
// each other, or the wrong way up, that sends the line away from its other
// end and round a block. So the board is laid out again with the line
// leaving and entering every block of its chain by the edges that face each
// other: the walls where the two blocks stand further apart across than up
// and down, else the faces toward each other.
import type { Laid } from "@/transformers/semantic-renderer/lib/blocks/laid";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import type {
	BlockTree,
	Face,
	Projection,
	Side,
} from "@/transformers/semantic-renderer/lib/blocks/tree";

/**
 * The edges of each block a line's chain crosses, where its outermost blocks
 * do not stand the way its faces point.
 * @param tree The blocks, laid out once.
 * @param laid Every block laid out.
 * @returns Each moved port's edge, keyed by `exitKey` by the port it would otherwise be.
 */
function sidesOf(tree: BlockTree, laid: ReadonlyMap<string, Laid>): Map<string, Side> {
	const sides = new Map<string, Side>();
	const back = tree.backEdges();
	for (const projection of tree.projections) {
		const upward = back.has(projection.edge.id);
		const facing = facingOf(projection, laid, upward);
		if (facing === undefined) continue;
		const [outFace, inFace]: [Face, Face] = upward ? ["top", "bottom"] : ["bottom", "top"];
		const kind = tree.kindOf(projection.edge);
		for (const block of projection.out)
			sides.set(exitKey(block.id, "out", outFace, `${projection.to}|${kind}`), facing[0]);
		for (const block of projection.into)
			sides.set(exitKey(block.id, "in", inFace, `${projection.from}|${kind}`), facing[1]);
	}
	return sides;
}

/**
 * The edges a line's two outermost blocks face each other by, when its faces
 * do not: for a line down, the block it enters does not stand wholly below the
 * one it leaves; for a line up, wholly above.
 * @param projection The line's projection.
 * @param laid Every block laid out.
 * @param upward Whether the line runs upward.
 * @returns The edge it leaves by and the edge it enters by, or nothing.
 */
function facingOf(
	projection: Projection,
	laid: ReadonlyMap<string, Laid>,
	upward: boolean,
): [Side, Side] | undefined {
	const { at, out, into } = projection;
	const boxes = laid.get(at.id)?.boxes;
	const [one, other] = [out.at(-1), into.at(-1)].map((block) =>
		block === undefined ? undefined : boxes?.get(block.id),
	);
	if (one === undefined || other === undefined) return undefined;
	const below = other.y >= one.y + one.height;
	const above = other.y + other.height <= one.y;
	if (upward ? above : below) return undefined;
	return sidesBetween(one, other);
}

/**
 * The edges two boxes face each other by: their walls where they stand
 * further apart across than up and down, else their tops and bottoms.
 * @param one The box a line leaves.
 * @param other The box it enters.
 * @returns The edge of each.
 */
function sidesBetween(one: Box, other: Box): [Side, Side] {
	const across = Math.max(other.x - one.x - one.width, one.x - other.x - other.width);
	const down = Math.max(other.y - one.y - one.height, one.y - other.y - other.height);
	if (across >= down) return other.x > one.x ? ["right", "left"] : ["left", "right"];
	return other.y > one.y ? ["bottom", "top"] : ["top", "bottom"];
}

/**
 * The key a port's moved edge is kept by.
 * @param block The block's id.
 * @param way Whether the line leaves or enters the block there.
 * @param face The face the tree gave the port.
 * @param along What the lines through the port share: their far end and kind.
 * @returns The key.
 */
function exitKey(block: string, way: "in" | "out", face: Face, along: string): string {
	return `${block}|port:${way}|${face}|${along}`;
}

export { exitKey, sidesOf };
