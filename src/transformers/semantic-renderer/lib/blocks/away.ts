// How far relationships' lines run away from the region between their two
// ends (ADR 0039): the length of each line outside the box round both its
// ends, grown by a lane's room to turn. A reader follows a line from one end
// to the other; one that leaves that region loops round a block, runs over
// the top of the picture or enters its card by the far wall, and the eye
// goes with it. Each stretch of AWAY_CROSSING a line runs away is weighed as
// a crossing.
import {
	covering,
	inflate,
	type Box,
	type Point,
} from "@/transformers/semantic-renderer/lib/geometry";
import {
	corners,
	moved,
	shifted,
	type Laid,
} from "@/transformers/semantic-renderer/lib/blocks/laid";
import type {
	Block,
	BlockTree,
	Projection,
} from "@/transformers/semantic-renderer/lib/blocks/tree";

/** The room round a line's two ends it may use to turn without running away. */
const AWAY_SLACK = 24;
/** How far a line runs away from its ends to read as badly as one crossing: the trunk router's rate. */
const AWAY_CROSSING = 300;
/**
 * How many times as far a packing's lines may run away from their ends as
 * in the packing whose lines run away least, and {@link AWAY_MARGIN} more,
 * and still be weighed. A packing is weighed before the board's second
 * layout turns its lines to the walls their blocks face each other by
 * (`sides.ts`), so the least is partly lines that will not stay where they
 * run; the room grows with it.
 */
const AWAY_FACTOR = 4;
/**
 * How many crossings' worth further than {@link AWAY_FACTOR} allows a
 * packing's lines may run away from their ends and still be weighed. Only a
 * packing whose lines loop round its blocks is set aside: beside Client
 * access and ingress, TLS termination (Azure deployment internals, Blocks)
 * sent the lines into it out and over the top of the picture.
 */
const AWAY_MARGIN = 4;

/** A line, and the boxes of its two ends. */
interface Ended {
	readonly points: readonly Point[];
	readonly ends: readonly [Box, Box];
}

/** The blocks of a tree, its relationships and how each is routed through them. */
type Routed = Pick<BlockTree, "blocks" | "projections" | "routes">;

/**
 * A box's span along an axis, then across it.
 * @param region The box.
 * @param level Whether the axis is level.
 * @returns Its low and high ends along the axis, then across it.
 */
function spansOf(region: Box, level: boolean): readonly [number, number, number, number] {
	const x = [region.x, region.x + region.width] as const;
	const y = [region.y, region.y + region.height] as const;
	return level ? [...x, ...y] : [...y, ...x];
}

/**
 * How much of one level or upright run lies outside a box.
 * @param from Where it starts.
 * @param to Where it ends.
 * @param region The box.
 * @returns The length outside.
 */
function outside(from: Point, to: Point, region: Box): number {
	const level = Math.abs(from.y - to.y) < Math.abs(from.x - to.x);
	const [one, other, across] = level ? [from.x, to.x, from.y] : [from.y, to.y, from.x];
	const [start, end] = [Math.min(one, other), Math.max(one, other)];
	const [low, high, near, far] = spansOf(region, level);
	const inside = across < near || across > far ? 0 : Math.min(end, high) - Math.max(start, low);
	return end - start - Math.max(0, inside);
}

/**
 * How far one line runs outside the box round its two ends.
 * @param line The line and its ends.
 * @returns The length outside.
 */
function awayOf(line: Ended): number {
	const { points, ends } = line;
	const region = inflate(covering(...ends), AWAY_SLACK);
	return points.slice(1).reduce((sum, to, index) => sum + outside(points[index]!, to, region), 0);
}

/**
 * How many crossings some lines' runs away from their ends weigh: each
 * line's length outside the box round its ends, in {@link AWAY_CROSSING}s.
 * @param lines The lines and their ends.
 * @returns The crossings they weigh.
 */
function runsAway(lines: Iterable<Ended>): number {
	let crossings = 0;
	for (const line of lines) crossings += Math.floor(awayOf(line) / AWAY_CROSSING);
	return crossings;
}

/** The lines a block holds whole, joined through the blocks inside it as they are laid out so far. */
class HeldWhole {
	/** Where each block inside the block stands in it. */
	private readonly origins = new Map<string, Point>();

	/**
	 * Place every block inside the block.
	 * @param tree The blocks.
	 * @param laid Every block inside it, laid out.
	 * @param block The block.
	 * @param candidate The block laid out the way weighed.
	 */
	constructor(
		private readonly tree: Routed,
		private readonly laid: ReadonlyMap<string, Laid>,
		private readonly block: Block,
		private readonly candidate: Laid,
	) {
		this.origins.set(block.id, { x: 0, y: 0 });
		this.descend(block);
	}

	/**
	 * Every line the block holds whole.
	 * @returns Each line and the boxes of its ends.
	 */
	lines(): Ended[] {
		return this.tree.projections.flatMap((projection) => this.lineOf(projection) ?? []);
	}

	/**
	 * A block laid out: the block weighed the way weighed, else as laid out so far.
	 * @param one The block.
	 * @returns It laid out.
	 */
	private laidOf(one: Block): Laid | undefined {
		return one === this.block ? this.candidate : this.laid.get(one.id);
	}

	/**
	 * Give the blocks inside one block their origins, and those inside them.
	 * @param outer The block, already placed.
	 */
	private descend(outer: Block): void {
		for (const item of outer.items) {
			const [inner, box] = [this.tree.blocks.get(item), this.laidOf(outer)?.boxes.get(item)];
			if (inner === undefined || box === undefined) continue;
			this.origins.set(item, moved(box, this.origins.get(outer.id)!));
			this.descend(inner);
		}
	}

	/**
	 * Where a line's end stands: its box in the first of some blocks that holds it.
	 * @param blocks The blocks, innermost first.
	 * @param id The end's id.
	 * @returns Its box, unless no block holds it.
	 */
	private endIn(blocks: readonly Block[], id: string | undefined): Box | undefined {
		const holder = blocks.find((one) => this.laidOf(one)?.boxes.has(id ?? ""));
		return holder && moved(this.laidOf(holder)!.boxes.get(id!)!, this.origins.get(holder.id)!);
	}

	/**
	 * One relationship's line, joined through every block it passes, and its ends.
	 * @param projection Where it is drawn.
	 * @returns The line, unless the block does not hold it whole or an end is not laid out.
	 */
	private lineOf(projection: Projection): Ended | undefined {
		const { edge, at, out, into } = projection;
		if (at !== this.block) return undefined;
		const from = this.endIn([...out, at], edge.sources[0]);
		const to = this.endIn([...into, at], edge.targets[0]);
		if (from === undefined || to === undefined) return undefined;
		const pieces = this.tree.routes.get(edge.id)?.pieces ?? [];
		const points = pieces.flatMap(([one, key]) =>
			shifted(this.laidOf(one)?.lines.get(key) ?? [], this.origins.get(one.id) ?? { x: 0, y: 0 }),
		);
		return { points: corners(points), ends: [from, to] };
	}
}

/**
 * The ways a block of blocks may be laid out whose lines, held whole in it,
 * run away from their ends little more than in the way they run away least
 * ({@link AWAY_FACTOR}, {@link AWAY_MARGIN}).
 * @param tree The blocks.
 * @param laid Every block inside it, laid out.
 * @param block The block.
 * @param ways Each way, laid out.
 * @returns The ways kept, in their order.
 */
function nearestAway<Way extends { readonly laid: Laid }>(
	tree: Routed,
	laid: ReadonlyMap<string, Laid>,
	block: Block,
	ways: readonly Way[],
): Way[] {
	const away = ways.map((way) => runsAway(new HeldWhole(tree, laid, block, way.laid).lines()));
	const least = Math.min(...away);
	return ways.filter((_, index) => away[index]! <= AWAY_FACTOR * least + AWAY_MARGIN);
}

/** A drawing as placed: its cards, its containers and every relationship's points. */
interface Drawing {
	readonly cards?: readonly { readonly id: string; readonly box: Box }[];
	readonly frames?: readonly { readonly id: string; readonly box: Box }[];
	readonly edges: readonly { readonly id: string; readonly points: readonly Point[] }[];
}

/**
 * How many crossings the runs away of a whole drawing's lines weigh ({@link runsAway}).
 * @param projections Where each relationship is drawn, for its ends.
 * @param drawing The drawing as placed.
 * @returns The crossings they weigh.
 */
function awayPlaced(projections: readonly Pick<Projection, "edge">[], drawing: Drawing): number {
	const boxes = new Map(
		[...(drawing.frames ?? []), ...(drawing.cards ?? [])].map(({ id, box }) => [id, box]),
	);
	const ends = new Map(
		projections.map(({ edge }) => [edge.id, [edge.sources[0], edge.targets[0]]] as const),
	);
	return runsAway(
		drawing.edges.flatMap(({ id, points }) => {
			const [from, to] = (ends.get(id) ?? []).map((end) => boxes.get(end ?? ""));
			return from === undefined || to === undefined ? [] : [{ points, ends: [from, to] as const }];
		}),
	);
}

export { awayPlaced, nearestAway };
