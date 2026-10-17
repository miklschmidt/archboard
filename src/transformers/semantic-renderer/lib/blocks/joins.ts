// Lines that join on the way to one card stay one line into it. Lines of one
// kind that reach one card through the same ports into its blocks run as one
// past the first they share; if each then carried its label beside the card,
// they would part again to their labels and end apart. So each such join is
// kept whole one of two ways: each line's label sits before the join, by its
// source, or each line keeps ports of its own and the lines never join. The
// joins whose labels would move to one block take one way together, since
// labels before some of a block's joins and not others rank its cards
// unevenly; each such block takes the way that reads better in the drawing as
// a whole.
import type { BlockTree, Projection } from "@/transformers/semantic-renderer/lib/blocks/tree";
import { lineLength } from "@/transformers/semantic-renderer/lib/blocks/laying";
import { weighedPlaced, type Page } from "@/transformers/semantic-renderer/lib/blocks/weighing";
import type { Point } from "@/transformers/semantic-renderer/lib/geometry";
import { LANE } from "@/transformers/semantic-renderer/lib/track/chains";
import { trunkKind } from "@/transformers/semantic-renderer/lib/track/route";
import { crossingsOf, takes } from "@/transformers/semantic-renderer/lib/track/score";
import { fitIn } from "@/shared/shell-geometry/index";

/**
 * How much line costs as much as one crossing in the joins' earlier weighing
 * ({@link costsLess}): a crossing the reader has to look twice at is worth a
 * long run of line, and less than this lets a trunk kept whole lose to lines
 * that each hop what it hopped once.
 */
const LINE_PER_CROSSING = 1000;

/** How near two costs are for the page to decide between them, in that weighing: a twentieth. */
const NEAR = 0.05;

/** What the joins read of the blocks: which blocks joins move labels to, and where each relationship is drawn. */
type Joined = Pick<BlockTree, "joining" | "projections">;

/** A drawing laid out one way: its blocks, and the drawing as placed. */
interface Drawn<Placed extends Page> {
	readonly tree: Joined;
	readonly placed: Placed;
}

/**
 * What relationships of one kind share when they reach one card through the
 * same ports into its blocks: past the first they would run as one.
 * @param projection Where one is drawn.
 * @param upward Whether it runs upward where it is drawn.
 * @returns The key, or nothing for one that enters no block.
 */
function joinOf(projection: Projection, upward: boolean): string {
	const { edge, into, from } = projection;
	return into.length === 0 ? "" : `${from}|${edge.targets[0]}|${trunkKind(edge)}|${upward}`;
}

/**
 * The block a relationship's label moves to when it is kept before a join:
 * the innermost around its source.
 * @param projection Where it is drawn.
 * @returns The block's id.
 */
function blockOf(projection: Projection): string {
	return (projection.out[0] ?? projection.at).id;
}

/**
 * The blocks that joins move labels to when kept before them, and how each
 * relationship in a join keeps it whole.
 * @param projections Where each relationship is drawn.
 * @param back The relationships that run upward where they are drawn.
 * @param apart The blocks whose joins keep ports of their own, by id.
 * @returns Those blocks, and the relationships in joins each way, by id.
 */
function joinWays(
	projections: readonly Projection[],
	back: ReadonlySet<string>,
	apart: ReadonlySet<string>,
): { joining: Set<string>; before: Set<string>; apart: Set<string> } {
	const joins = projections.map((one) => joinOf(one, back.has(one.edge.id)));
	const [joining, before, own] = [new Set<string>(), new Set<string>(), new Set<string>()];
	projections.forEach((projection, index) => {
		const join = joins[index]!;
		if (join === "" || joins.indexOf(join) === joins.lastIndexOf(join)) return;
		const block = blockOf(projection);
		joining.add(block);
		(apart.has(block) ? own : before).add(projection.edge.id);
	});
	return { joining, before, apart: own };
}

/**
 * A set with one member taken out, or put in when it was not there.
 * @param set The set.
 * @param member The member.
 * @returns The new set.
 */
function toggled(set: ReadonlySet<string>, member: string): Set<string> {
	const next = new Set(set);
	if (!next.delete(member)) next.add(member);
	return next;
}

/**
 * A route's straight runs, each as its two ends.
 * @param points The route.
 * @returns The runs.
 */
function runsOf(points: readonly Point[]): (readonly [Point, Point])[] {
	return points.slice(1).map((point, index) => [points[index]!, point] as const);
}

/**
 * How long two routes run on one line, within a point.
 * @param one A route.
 * @param other Another.
 * @returns The length.
 */
function sharedLength(one: readonly Point[], other: readonly Point[]): number {
	let length = 0;
	for (const [a, b] of runsOf(one))
		for (const [c, d] of runsOf(other))
			for (const [across, along] of [
				["x", "y"],
				["y", "x"],
			] as const) {
				if ([b, c, d].some((point) => Math.abs(point[across] - a[across]) > 1)) continue;
				const low = Math.max(Math.min(a[along], b[along]), Math.min(c[along], d[along]));
				const high = Math.min(Math.max(a[along], b[along]), Math.max(c[along], d[along]));
				length += Math.max(0, high - low);
			}
	return length;
}

/**
 * How many pairs of lines of one kind to one card share ink on the way and
 * then end apart on it: what no way of keeping a join may leave.
 * @param drawn The drawing.
 * @returns The count.
 */
function partedOf(drawn: Drawn<Page>): number {
	const towards = new Map(
		drawn.tree.projections.map(({ edge }) => [edge.id, `${edge.targets[0]}|${trunkKind(edge)}`]),
	);
	const lines = drawn.placed.edges.filter(({ points }) => points.length > 1);
	return lines.reduce(
		(sum, one, index) =>
			sum +
			lines.slice(index + 1).filter((other) => {
				if (towards.get(one.id) !== towards.get(other.id)) return false;
				const [end, otherEnd] = [one.points.at(-1)!, other.points.at(-1)!];
				if (Math.hypot(end.x - otherEnd.x, end.y - otherEnd.y) < 1) return false;
				return sharedLength(one.points, other.points) > LANE;
			}).length,
		0,
	);
}

/**
 * Whether a value lies strictly between two others, clear of both.
 * @param value The value.
 * @param one One end.
 * @param other The other end.
 * @returns True when it is inside.
 */
function clear(value: number, one: number, other: number): boolean {
	return value > Math.min(one, other) + 1 && value < Math.max(one, other) - 1;
}

/**
 * How many times one line crosses another, each pair of lines counted at
 * each place: a trunk of several lines crosses a line once for each of them,
 * as a join kept before its labels draws its trunk far across the drawing.
 * @param lines Every line's points.
 * @returns The crossings.
 */
function pairCrossings(lines: readonly (readonly Point[])[]): number {
	const runs = lines.flatMap((points, line) =>
		points.slice(1).map((to, index) => ({ line, from: points[index]!, to })),
	);
	const level = runs.filter(({ from, to }) => Math.abs(from.y - to.y) < 0.5);
	const upright = runs.filter(({ from, to }) => Math.abs(from.x - to.x) < 0.5);
	const places = level.flatMap((one) =>
		upright
			.filter(
				(other) =>
					other.line !== one.line &&
					clear(other.from.x, one.from.x, one.to.x) &&
					clear(one.from.y, other.from.y, other.to.y),
			)
			.map(
				(other) =>
					`${one.line}|${other.line}|${Math.round(other.from.x)},${Math.round(one.from.y)}`,
			),
	);
	return new Set(places).size;
}

/**
 * Whether one drawing's lines cost less than another's, as the joins
 * weighed a drawing before ADR 0039: each crossing half as much again for
 * each line through it past the first, and its line at a crossing's worth
 * for every {@link LINE_PER_CROSSING}; costing about as much, the page that
 * fits the reference pane better. It weighs the drawing with the steps its
 * lines need not take taken out, as the reading measures do; before ADR
 * 0039 it weighed the drawing with them.
 * @param one A drawing.
 * @param other Another.
 * @returns True when the first costs less.
 */
function costsLess(one: Page, other: Page): boolean {
	const [cost, least] = [costOf(one), costOf(other)];
	const [fit, best] = [fitIn(one), fitIn(other)];
	if (Math.abs(cost - least) > NEAR * Math.min(cost, least) || Math.abs(fit - best) < 1e-9)
		return cost < least - 1e-9;
	return fit > best;
}

/**
 * What a drawing's lines cost in the joins' earlier weighing ({@link costsLess}).
 * @param placed The drawing.
 * @returns The cost, in crossings.
 */
function costOf(placed: Page): number {
	const points = placed.edges.map((line) => line.points);
	const seen = crossingsOf(points);
	return seen + (pairCrossings(points) - seen) / 2 + lineLength(points) / LINE_PER_CROSSING;
}

/**
 * Whether one drawing reads better than another: it parts fewer joined
 * lines; or, as few, it draws no more line, and it reads better in the order
 * of ADR 0039 and no worse anywhere than the drawing whose lines cost less
 * ({@link costsLess}), or else its lines cost less ({@link takes}). A join
 * kept another way that draws more line buys what it saves with runs a
 * reader follows further, as a packing does (`solves.ts`): with a region
 * round Pane session, Working with an agent (Blocks) kept its joins into
 * Agent apart to fit the pane better, at a crossing more and 6% more line,
 * and ran its lines into Agent from every side; with three regions round one
 * card, What the CLI can be asked (Blocks) kept the lines into Board writes
 * apart for one crossing fewer and drew 18% more line.
 * @param one A drawing.
 * @param other Another.
 * @returns True when the first reads better.
 */
function drawsBetter(one: Drawn<Page>, other: Drawn<Page>): boolean {
	const [parted, fewest] = [partedOf(one), partedOf(other)];
	if (parted !== fewest) return parted < fewest;
	const [mine, theirs] = [one, other].map(({ tree, placed }) =>
		weighedPlaced(placed, tree.projections),
	);
	if ((mine!.length ?? 0) > (theirs!.length ?? 0)) return false;
	return takes(mine!, theirs!, costsLess(one.placed, other.placed));
}

/**
 * Lay a drawing out with some blocks' joins apart, by block id, and every
 * block facing its walls when asked (`BlockTree`), unless called off first.
 */
type Lay<Placed> = (
	apart: ReadonlySet<string>,
	signal: AbortSignal,
	facing?: boolean,
) => Promise<Placed>;

/** A drawing as a solve answers it: whether facing every block's walls would change it (`place.ts`). */
type Facing = Page & { readonly faces?: boolean | undefined };

/** One layout asked for: its answer, how to call it off, and whether a turn to come weighs it. */
interface Asked<Placed> {
	readonly calling: AbortController;
	promise: Promise<Placed>;
	needed: boolean;
}

/**
 * The same key for a set of blocks apart, whatever their order.
 * @param apart The blocks whose joins stay apart.
 * @returns The key.
 */
function apartKey(apart: ReadonlySet<string>): string {
	return JSON.stringify([...apart].toSorted());
}

/**
 * A way to lay a drawing out that lays it with each set of blocks apart
 * once, however often it is asked, and a way to call off the layouts no turn
 * to come weighs. A layout asked for ahead and never awaited is dropped, a
 * failure included: laid out one by one, it would never have been asked for.
 * A layout called off while a worker holds it is answered all the same, and
 * kept for a later ask. One called off while it waits is forgotten, and laid
 * out afresh when a turn asks for it again.
 * @param lay Lay the drawing out with some blocks' joins apart, by block id.
 * @returns The way to ask for a layout, and the way to keep only the ones still needed.
 */
function layingOnce<Placed>(lay: Lay<Placed>): {
	readonly ask: (apart: ReadonlySet<string>) => Promise<Placed>;
	readonly keep: (needed: readonly ReadonlySet<string>[]) => void;
} {
	const asked = new Map<string, Asked<Placed>>();
	/**
	 * Ask for a layout, once.
	 * @param apart The blocks whose joins stay apart.
	 * @returns Its layout.
	 */
	const ask = (apart: ReadonlySet<string>): Promise<Placed> => {
		const key = apartKey(apart);
		let entry = asked.get(key);
		if (entry === undefined) {
			const calling = new AbortController();
			const held: Asked<Placed> = { calling, promise: lay(apart, calling.signal), needed: true };
			// The host refuses only a solve still waiting with the signal's reason.
			// A turn may have asked for it again while that refusal travelled.
			held.promise = held.promise.catch((error: unknown) => {
				if (!calling.signal.aborted || error !== calling.signal.reason) throw error;
				if (asked.get(key) === held) asked.delete(key);
				if (held.needed) return ask(apart);
				throw error;
			});
			held.promise.catch(() => undefined);
			asked.set(key, held);
			entry = held;
		}
		entry.needed = true;
		return entry.promise;
	};
	/**
	 * Call off every layout asked for that no turn to come weighs.
	 * @param needed The layouts the turns to come weigh.
	 */
	const keep = (needed: readonly ReadonlySet<string>[]): void => {
		const keys = new Set(needed.map(apartKey));
		for (const [key, entry] of asked) {
			entry.needed = keys.has(key);
			if (!entry.needed) entry.calling.abort();
		}
	};
	return { ask, keep };
}

/**
 * Lay a drawing out with every join kept whole the way that reads better:
 * every join before its labels; then every join apart; then, from the better
 * of those, each block's joins turned the other way in turn, kept where the
 * drawing reads better. Every layout the turns would weigh were none of them
 * kept is asked for at once, so they are laid out side by side; a turn kept
 * changes the ones after it, which are asked for then, and the ones asked
 * for before it that no turn to come weighs are called off. They are weighed
 * in turn all the same, so the drawing is the one laying them out one by one
 * gives. Last, where facing every block's walls would change the drawing
 * kept, it is laid out the same way facing them, and that is kept where it
 * reads better as a turn does. It is asked for as soon as a drawing is
 * kept, and with every join before its labels at once, so it is laid out
 * beside the turns. When the drawing is chosen, or a layout it waits for
 * fails, every layout still asked for is called off.
 * A block that holds the label of a line it crosses keeps that line on its
 * face, and Graphviz meets its items in the board's order. Kept on its face,
 * the line from Local platform operator ran down its region, along its foot
 * and up its far wall to Device Identity beside it (Device Trust Control
 * Plane, native hosts, Blocks). Faced to its walls in every way of keeping
 * the joins, Two doors to a turn (Blocks) drew less line than the way that
 * crossed 14 lines fewer, and this choice could no longer take that way.
 * @param tree The blocks, which name the blocks joins move labels to.
 * @param lay Lay the drawing out with some blocks' joins apart, by block id.
 * @returns The drawing laid out best.
 */
async function layJoined<Placed extends Facing>(
	tree: Joined,
	lay: Lay<Placed>,
): Promise<Drawn<Placed>> {
	const { ask, keep } = layingOnce(lay);
	const faced = layingOnce<Placed>((apart, signal) => lay(apart, signal, true));
	const blocks = [...tree.joining];
	const turns = [
		...(blocks.length > 1 ? [(): Set<string> => new Set(blocks)] : []),
		...blocks.map(
			(block) =>
				(apart: ReadonlySet<string>): Set<string> =>
					toggled(apart, block),
		),
	];
	/**
	 * Ask for every layout from one turn on, as the turns would weigh it were
	 * none of them kept, and call off the ones asked for before that none of
	 * them weighs. The first turns call off nothing: the drawing they start
	 * from is still to be weighed.
	 * @param from The first turn.
	 * @param apart The blocks apart in the drawing kept so far.
	 */
	const ahead = (from: number, apart: ReadonlySet<string>): void => {
		const needed = turns.slice(from).map((turn) => turn(apart));
		if (from > 0) keep(needed);
		for (const one of needed) void ask(one);
	};
	try {
		const first = ask(new Set());
		ahead(0, new Set());
		void faced.ask(new Set());
		let best: Drawn<Placed> = { tree, placed: await first };
		let apart: ReadonlySet<string> = new Set();
		for (const [index, turn] of turns.entries()) {
			const trial = turn(apart);
			// oxlint-disable-next-line no-await-in-loop -- each turn is weighed against the best before it
			const tried = { tree, placed: await ask(trial) };
			if (!drawsBetter(tried, best)) continue;
			[best, apart] = [tried, trial];
			ahead(index + 1, apart);
			faced.keep([apart]);
			if (best.placed.faces === true) void faced.ask(apart);
		}
		return await facedBetter(best, () => faced.ask(apart));
	} finally {
		keep([]);
		faced.keep([]);
	}
}

/**
 * The drawing kept, or the same way laid out with every block facing its
 * walls where that would change it and reads better as a turn does.
 * @param best The drawing kept.
 * @param faced Its layout with every block facing its walls.
 * @returns The drawing that reads better.
 */
async function facedBetter<Placed extends Facing>(
	best: Drawn<Placed>,
	faced: () => Promise<Placed>,
): Promise<Drawn<Placed>> {
	if (best.placed.faces !== true) return best;
	const turned = { tree: best.tree, placed: await faced() };
	return drawsBetter(turned, best) ? turned : best;
}

export { joinWays, layJoined, type Drawn, type Joined };
