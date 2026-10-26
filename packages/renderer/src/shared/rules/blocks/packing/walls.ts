// A block's lines to and from its side walls: which wall a line leaves or
// enters by, the lines drawn straight from a card's side to its wall,
// running such a line onto the wall once routed, the points the block's
// parent must route around, and where a block of blocks stands its own
// ports on its walls.
import type { Box, Point } from "#shared/rules/geometry.ts";
import { walledPoints } from "#shared/rules/blocks/cards/card-graph.ts";
import { PORT } from "#shared/rules/blocks/folds/leaves.ts";
import type { Block, BlockTree, Line, Side } from "#shared/rules/blocks/tree/tree.ts";
import { spreadAlong } from "#shared/rules/track/channels/channels.ts";
import { LANE } from "#shared/rules/track/routes/chains.ts";
import type { Item, Scene } from "#shared/rules/track/scene/scene.ts";

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
 * @returns The wall, or nothing when its port is on the top or bottom, or is no port.
 */
function wallOf(block: Block, line: Line): "left" | "right" | undefined {
	const side = block.ports.get(line.to);
	return side === "left" || side === "right" ? side : undefined;
}

/**
 * The wall a line leaves the block by carrying its label, when its port is
 * on one. Graphviz ranks such a line through its label to a stub below it,
 * as it ranks a line from a wall from a stub above, and the line turns to
 * the wall in the channel under its label. A line before a join carries its
 * label in its source's block (`joins.ts`); held on the block's bottom
 * instead, its port stood at the far end of the bottom from a block beside
 * it, and the line ran from Local platform operator down the whole region
 * and along its foot (Device Trust Control Plane, native hosts, Blocks).
 * @param block The block.
 * @param line The line.
 * @returns The wall, or nothing.
 */
function labelledOut(block: Block, line: Line): "left" | "right" | undefined {
	return line.labelled ? wallOf(block, line) : undefined;
}

/**
 * Whether Graphviz ranks a line of the block: every line but one to a wall
 * that carries no label there, which runs from its card along the channel under it.
 * @param block The block.
 * @param line The line.
 * @returns True when it does.
 */
function ranks(block: Block, line: Line): boolean {
	return wallOf(block, line) === undefined || line.labelled;
}

/**
 * The wall a line runs to along the channel under its card: a line to a
 * wall that Graphviz does not rank.
 * @param block The block.
 * @param line The line.
 * @returns The wall, or nothing.
 */
function channelWall(block: Block, line: Line): "left" | "right" | undefined {
	return ranks(block, line) ? undefined : wallOf(block, line);
}

/**
 * How a line meets the block's walls, as the track router reads it: the
 * wall it runs to along the channel under its card, the wall it comes in
 * from, and the wall it runs to through its label. A line that meets no
 * wall has none of them.
 * @param block The block.
 * @param line The line.
 * @returns The walls it meets.
 */
function wallsOf(
	block: Block,
	line: Line,
): { wall?: "left" | "right"; enters?: "left" | "right"; leaves?: "left" | "right" } {
	const [wall, enters, leaves] = [channelWall, entersBy, labelledOut].map((by) => by(block, line));
	return {
		...(wall === undefined ? {} : { wall }),
		...(enters === undefined ? {} : { enters }),
		...(leaves === undefined ? {} : { leaves }),
	};
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
 * The wall an item stands apart toward: the one wall that every line to
 * or from it crosses. Lines to and from a wall are ranked only with their
 * own labels and stubs, so such an item is a part of the block's graph of
 * its own.
 * @param block The block.
 * @param item The item.
 * @returns The wall, or nothing when some line of it stays inside or they cross both.
 */
function wallReached(block: Block, item: string): "left" | "right" | undefined {
	const sides = new Set<"left" | "right" | undefined>();
	for (const line of block.lines.values()) {
		if (line.from === item) sides.add(wallOf(block, line));
		if (line.to === item) sides.add(entersBy(block, line));
	}
	const [wall] = sides;
	return sides.size === 1 ? wall : undefined;
}

/** What placing a block of blocks' own ports on its walls reads of its layout (`pack.ts`). */
interface Packed {
	readonly block: Block;
	readonly tree: BlockTree;
	/** Where the block put its items, header and own ports. */
	readonly boxes: Map<string, Box>;
	/** Where a pin stands in the block, and the edge of its own block it is on. */
	pinAt(end: string): Point & { side: Side };
}

/**
 * Place a block of blocks' own ports on its side walls, within the block:
 * each level with the pins its lines reach ({@link levelOf}), and a lane from
 * the others on its wall. Ports of two kinds that reach one block want one
 * place: on one point they drew the two lines as one, and libavoid finds no
 * route to the later of two pins on one point of a block, so on Codex
 * realtime voice (Blocks) three trunks out of Workhorses took a dogleg
 * through Chat conversations and its Workhorse list (`trunks.ts`).
 * @param packed The block's layout; its ports' boxes are set.
 * @param width The block's width.
 * @param span Where the packed items start and end.
 * @param span.top Where they start.
 * @param span.bottom Where they end.
 */
function placeWallPorts(
	packed: Packed,
	width: number,
	span: { top: number; bottom: number },
): void {
	for (const side of ["left", "right"] as const) {
		const wanted = [...packed.block.ports]
			.filter(([, at]) => at === side)
			.map(([port]) => ({ port, y: levelOf(packed, port, side) }))
			.toSorted((one, other) => one.y - other.y);
		const ys = spreadAlong(
			[span.top, span.bottom],
			wanted.map(({ y }) => y),
		);
		const x = side === "left" ? 0 : width;
		for (const [index, { port }] of wanted.entries())
			packed.boxes.set(port, {
				x: x - PORT / 2,
				y: ys[index]! - PORT / 2,
				width: PORT,
				height: PORT,
			});
	}
}

/**
 * Where one of a block of blocks' own ports on a side wall wants to stand:
 * level with the pins its lines reach on that wall of their blocks, else
 * with their blocks' middle.
 * @param packed The block's layout.
 * @param port The port.
 * @param side The wall it stands on.
 * @returns Its y.
 */
function levelOf(packed: Packed, port: string, side: "left" | "right"): number {
	const reached = [...packed.block.lines.values()]
		.flatMap((line) => (line.to === port ? [line.from] : line.from === port ? [line.to] : []))
		.flatMap((end) => {
			const owner = packed.boxes.get(packed.tree.pins.get(end)?.block.id ?? "");
			if (owner === undefined) return [];
			const at = packed.pinAt(end);
			return [at.side === side ? at.y : owner.y + owner.height / 2];
		});
	return reached.reduce((sum, y) => sum + y, 0) / Math.max(1, reached.length);
}

/** Where an item that reaches one wall stands in the order Graphviz meets a block's items. */
const TOWARD = { left: -1, right: 1 } as const;

/**
 * A block's items in the order Graphviz meets them: the items that stand
 * apart toward the left wall first, those toward the right wall last
 * ({@link wallReached}). Graphviz sets the parts of a graph side by side
 * in the order it meets them. In the board's order, Device CA certificate
 * state stood at the far end of its region from Device Identity beside it,
 * and the line between them ran the region's width (Device Trust Control
 * Plane, native hosts, Blocks). An item that some line holds among the rest
 * keeps its place: Graphviz orders it with them, and moving it only stirs
 * that order.
 * @param block The block.
 * @param items Its items, in the board's order.
 * @returns The items, each wall's toward it.
 */
function towardWalls(block: Block, items: readonly string[]): string[] {
	const toward = new Map(items.map((item) => [item, wallReached(block, item)]));
	/**
	 * Where an item stands in the order: before, among or after the rest.
	 * @param item The item.
	 * @returns -1, 0 or 1.
	 */
	const at = (item: string): number => {
		const wall = toward.get(item);
		return wall === undefined ? 0 : TOWARD[wall];
	};
	return items.toSorted((one, other) => at(one) - at(other));
}

/**
 * A block's items in the order Graphviz meets them: toward the walls when
 * every block faces its walls ({@link towardWalls}), else the board's order.
 * @param tree The blocks.
 * @param block The block.
 * @returns The items.
 */
function itemsOf(tree: BlockTree, block: Block): readonly string[] {
	return tree.facing ? towardWalls(block, block.items) : block.items;
}

/**
 * Whether facing every block's walls changes a board's blocks (`BlockTree`):
 * some block that holds a line's label turns it to a wall, or stands an item
 * reached only through a wall toward it.
 * @param tree The blocks, every block facing its walls.
 * @returns True when it does.
 */
function facingTurns(tree: BlockTree): boolean {
	return [...tree.blocks.values()].some(
		(block) =>
			[...block.lines.values()].some((line) => labelledOut(block, line) !== undefined) ||
			itemsOf(tree, block).some((item, index) => item !== block.items[index]),
	);
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
		const wall = channelWall(block, line);
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
 * Mark on a scene the stretch of its band that each line drawn straight to
 * a wall runs along, which the scene's router does not route ({@link Scene.besides}).
 * @param scene The placed scene, whose besides are set.
 * @param beside The lines.
 */
function markBesides(scene: Scene, beside: readonly Beside[]): void {
	for (const { card, wall } of beside) {
		const { box, band } = scene.cards.get(card)!;
		const run =
			wall === "left" ? ([-Infinity, box.x] as const) : ([box.x + box.width, Infinity] as const);
		scene.besides.set(band, [...(scene.besides.get(band) ?? []), run]);
	}
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

export {
	besidePoints,
	besideWalls,
	entersBy,
	facingTurns,
	innerPoints,
	itemsOf,
	labelledOut,
	markBesides,
	placeWallPorts,
	ranks,
	wallLines,
	wallOf,
	wallsOf,
};
