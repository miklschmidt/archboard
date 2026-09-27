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
import type { ElkExtendedEdge } from "@archboard/elk-rs";
import type { BlockTree, Projection } from "@/transformers/semantic-renderer/lib/blocks/tree";
import { lineLength } from "@/transformers/semantic-renderer/lib/blocks/laying";
import { weighedPlaced, type Page } from "@/transformers/semantic-renderer/lib/blocks/weighing";
import type { Point } from "@/transformers/semantic-renderer/lib/geometry";
import { LANE } from "@/transformers/semantic-renderer/lib/track/chains";
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

/** A drawing laid out one way: its blocks, and the drawing as placed. */
interface Drawn<Placed extends Page> {
	readonly tree: BlockTree;
	readonly placed: Placed;
}

/**
 * The kind a line is bundled by: the relationship's kind and comparison standing.
 * @param edge The relationship.
 * @returns The kind.
 */
function kindOf(edge: ElkExtendedEdge): string {
	const options = edge.layoutOptions ?? {};
	const kind = options["archboard.relationship.kind"] ?? "";
	return `${kind}|${options["archboard.relationship.standing"] ?? "unchanged"}`;
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
	return into.length === 0 ? "" : `${from}|${edge.targets[0]}|${kindOf(edge)}|${upward}`;
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
		drawn.tree.projections.map(({ edge }) => [edge.id, `${edge.targets[0]}|${kindOf(edge)}`]),
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
 * lines; or, as few, it reads better in the order of ADR 0039 and no worse
 * anywhere than the drawing whose lines cost less ({@link costsLess}), or
 * else its lines cost less ({@link takes}).
 * @param one A drawing.
 * @param other Another.
 * @returns True when the first reads better.
 */
function drawsBetter(one: Drawn<Page>, other: Drawn<Page>): boolean {
	const [parted, fewest] = [partedOf(one), partedOf(other)];
	if (parted !== fewest) return parted < fewest;
	const [mine, theirs] = [one, other].map(({ placed }) => weighedPlaced(placed));
	return takes(mine!, theirs!, costsLess(one.placed, other.placed));
}

/**
 * Lay a drawing out with every join kept whole the way that reads better:
 * every join before its labels; then every join apart; then, from the better
 * of those, each block's joins turned the other way in turn, kept where the
 * drawing reads better.
 * @param lay Lay the drawing out with some blocks' joins apart, by block id.
 * @returns The drawing laid out best.
 */
function layJoined<Placed extends Page>(
	lay: (apart: ReadonlySet<string>) => Drawn<Placed>,
): Drawn<Placed> {
	let best = lay(new Set());
	const blocks = [...best.tree.joining];
	let apart = new Set<string>();
	const trials = [
		...(blocks.length > 1 ? [(): Set<string> => new Set(blocks)] : []),
		...blocks.map((block) => (): Set<string> => toggled(apart, block)),
	];
	for (const next of trials) {
		const trial = next();
		const tried = lay(trial);
		if (drawsBetter(tried, best)) [best, apart] = [tried, trial];
	}
	return best;
}

export { joinWays, kindOf, layJoined, type Drawn };
