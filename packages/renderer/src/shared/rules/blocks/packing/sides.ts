// Which edge of each block a relationship crosses, chosen once the board is
// laid out. The tree first sends every relationship out of the bottom of each
// block around its source and into the top of each block around its target
// (upward, the other way round), before anything stands anywhere. Where the
// two blocks it runs between in the block that holds both ends stand beside
// each other, or the wrong way up, that sends the line away from its other
// end and round a block. So the board is laid out again with the line
// leaving and entering every block of its chain by the edges that face each
// other: the walls where the two blocks stand further apart across than up
// and down, else the faces toward each other. A region round one node
// (`lone.ts`) stands its node taller, and turns no line's faces: where the
// two blocks stand beside each other by no more than their regions round
// one node add to their height, they stand as they would without them.
import type { Laid } from "#shared/rules/blocks/tree/laid.ts";
import { grownBy } from "#shared/rules/blocks/tree/lone.ts";
import type { Box } from "#shared/rules/geometry.ts";
import type { Block, BlockTree, Face, Projection, Side } from "#shared/rules/blocks/tree/tree.ts";

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
		const facing = facingOf(projection, laid, upward, tree);
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
 * one it leaves, or no more above than their regions round one node add to
 * their height; for a line up, wholly above. A block beside a column is
 * centred on it, so a region round one node in the column could stand the
 * block beside where it stood below: in Working with an agent (Blocks), the
 * region round Pane session stood Voice 16 px up beside the cards over Agent,
 * and the lines from Application composition into Voice moved to side walls,
 * stood Pane session off to the middle and ran round Voice.
 * @param projection The line's projection.
 * @param laid Every block laid out.
 * @param upward Whether the line runs upward.
 * @param tree The blocks, which name every node alone in its region.
 * @returns The edge it leaves by and the edge it enters by, or nothing.
 */
function facingOf(
	projection: Projection,
	laid: ReadonlyMap<string, Laid>,
	upward: boolean,
	tree: BlockTree,
): [Side, Side] | undefined {
	const ends = endsOf(projection, laid);
	if (ends === undefined) return undefined;
	const { leaves, enters, one, other } = ends;
	const room = grownIn(tree, leaves) + grownIn(tree, enters);
	const stands = upward
		? other.y + other.height <= one.y + room
		: other.y + room >= one.y + one.height;
	return stands ? undefined : sidesBetween(one, other);
}

/**
 * A line's two outermost blocks, each with its box in the block that holds both.
 * @param projection The line's projection.
 * @param laid Every block laid out.
 * @returns The block it leaves and the one it enters, and their boxes; nothing where one is missing.
 */
function endsOf(
	projection: Projection,
	laid: ReadonlyMap<string, Laid>,
): { leaves: Block; enters: Block; one: Box; other: Box } | undefined {
	const [leaves, enters] = [projection.out.at(-1), projection.into.at(-1)];
	if (leaves === undefined || enters === undefined) return undefined;
	const [one, other] = [leaves, enters].map((block) =>
		laid.get(projection.at.id)?.boxes.get(block.id),
	);
	return one && other && { leaves, enters, one, other };
}

/**
 * How much taller a block stands for the regions round one node it is or
 * holds: each adds its caption band and inset ({@link grownBy}).
 * @param tree The blocks.
 * @param block The block.
 * @returns The height they add, at most.
 */
function grownIn(tree: BlockTree, block: Block): number {
	const own = block.lone === undefined ? 0 : grownBy(block.lone);
	return tree.innermostFirst(block).reduce(
		(sum, inner) =>
			sum +
			inner.items.reduce((more, item) => {
				const lone = tree.lone.get(item);
				return more + (lone === undefined ? 0 : grownBy(lone));
			}, 0),
		own,
	);
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
