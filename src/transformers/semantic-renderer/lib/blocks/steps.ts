// Steps a joined line need not take, taken out (visual polish). A line that
// passes several blocks is joined from a piece routed in each, and each piece
// was routed before the others stood beside it: where two pieces meet at a
// port that lines up with neither, or where a block's tracks turned the line
// for something that is out of the way once the blocks stand together, the
// joined line steps sideways and on, doubles back at a wall, or climbs a
// staircase where one turn would do. Once the drawing is joined, each such
// step is taken out by sliding the run between its two turns onto the
// column, or row, of the run before or after it, so the two runs either side
// become one. A slide is kept only where the line's new stretch stays clear
// of every card, title and label, keeps a lane from every other line and
// half a lane from every wall, crosses no more lines and no wall it did not
// cross, and still runs through the line's own label. A run another line
// shares, a trunk, never moves; nor does a line's first or last run leave
// the card face it meets.
import { BEND_RADIUS } from "@/transformers/semantic-renderer/config";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { corners } from "@/transformers/semantic-renderer/lib/blocks/laid";
import { LANE } from "@/transformers/semantic-renderer/lib/track/chains";

/** How far a line's new stretch keeps from a card, a title or a label. */
const CLEARANCE = LANE / 2;
/** The shortest run between two turns, whose two bends need room. */
const SHORTEST = 2 * BEND_RADIUS;
/** How close two coordinates are and still one. */
const SAME = 0.5;
/** How far apart two lines on one axis still read as one. */
const HANDOFF = 4 * LANE;
/** How many times every line is looked at again, after the others moved. */
const PASSES = 3;

/** A line as the steps read it: its points and its label's box. */
interface Drawn {
	readonly points: readonly Point[];
	readonly label?: Box;
}

/** What every line keeps clear of. */
interface Surroundings {
	/** Every card, title row and caption. */
	readonly boxes: readonly Box[];
	/** Every container's and group region's box. */
	readonly walls: readonly Box[];
	/** The band across each container's top its title stands in, which only an upright run crosses. */
	readonly bands: readonly Box[];
}

/** A straight run of a line: level runs keep their y, upright ones their x. */
interface Run {
	readonly from: Point;
	readonly to: Point;
}

/** A run read along its axis: where across it stands, and its low and high ends along. */
interface Span {
	readonly level: boolean;
	readonly at: number;
	readonly low: number;
	readonly high: number;
}

/** Everything a slide of one line is weighed against. */
interface Weighing {
	/** Every other line's runs. */
	readonly others: readonly Span[];
	/** Every box the line keeps clear of, grown by the room it keeps. */
	readonly boxes: readonly Box[];
	readonly walls: readonly Box[];
	/** Every title band, grown by a lane. */
	readonly bands: readonly Box[];
	readonly label: Box | undefined;
}

/**
 * A line's runs.
 * @param points Its points.
 * @returns The runs, in order.
 */
function runsOf(points: readonly Point[]): Run[] {
	return points.slice(1).map((to, index) => ({ from: points[index]!, to }));
}

/**
 * A run read along its axis.
 * @param run The run.
 * @returns Its span.
 */
function spanOf(run: Run): Span {
	const { from, to } = run;
	const level = Math.abs(from.y - to.y) < Math.abs(from.x - to.x);
	const [one, other] = level ? [from.x, to.x] : [from.y, to.y];
	return {
		level,
		at: level ? from.y : from.x,
		low: Math.min(one, other),
		high: Math.max(one, other),
	};
}

/**
 * How far along two spans share.
 * @param one A span.
 * @param other Another.
 * @returns The shared length, negative when they are apart.
 */
function shared(one: Span, other: Span): number {
	return Math.min(one.high, other.high) - Math.max(one.low, other.low);
}

/**
 * Whether two spans lie on one line and share some of it.
 * @param one A span.
 * @param other Another.
 * @returns True when they do.
 */
function onOne(one: Span, other: Span): boolean {
	return (
		one.level === other.level && Math.abs(one.at - other.at) < SAME && shared(one, other) > SAME
	);
}

/**
 * The stretches of a span no span on its line covers.
 * @param span The span.
 * @param cover The spans that may cover it.
 * @returns The uncovered stretches.
 */
function uncovered(span: Span, cover: readonly Span[]): Span[] {
	let left: Span[] = [span];
	for (const one of cover.filter((other) => onOne(span, other)))
		left = left.flatMap((piece) =>
			[
				{ ...piece, high: Math.min(piece.high, one.low) },
				{ ...piece, low: Math.max(piece.low, one.high) },
			].filter(({ low, high }) => high - low > SAME),
		);
	return left;
}

/**
 * The stretches of one line's runs another line's runs do not cover.
 * @param line The line.
 * @param cover The other.
 * @returns The stretches.
 */
function fresh(line: readonly Point[], cover: readonly Point[]): Span[] {
	const covering = runsOf(cover).map(spanOf);
	return runsOf(line).flatMap((run) => uncovered(spanOf(run), covering));
}

/**
 * Whether a span runs through a box.
 * @param span The span.
 * @param box The box.
 * @returns True when it does.
 */
function through(span: Span, box: Box): boolean {
	const [low, high, across, deep] = span.level
		? [box.x, box.x + box.width, box.y, box.height]
		: [box.y, box.y + box.height, box.x, box.width];
	return span.at > across && span.at < across + deep && span.high > low && span.low < high;
}

/**
 * A box grown on every side.
 * @param box The box.
 * @param by How far.
 * @returns The grown box.
 */
function grown(box: Box, by: number): Box {
	return { x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by };
}

/**
 * Whether a value lies along a span, clear of its ends.
 * @param value The value.
 * @param span The span.
 * @returns True when it does.
 */
function within(value: number, span: Span): boolean {
	return value > span.low + 1 && value < span.high - 1;
}

/**
 * Whether two square spans cross, each through the other clear of its ends.
 * @param one A span.
 * @param other A span square to it.
 * @returns True when they do.
 */
function crosses(one: Span, other: Span): boolean {
	return within(other.at, one) && within(one.at, other);
}

/**
 * Where a line crosses other lines, once for each place.
 * @param points The line.
 * @param others The other lines' runs.
 * @returns The places.
 */
function crossings(points: readonly Point[], others: readonly Span[]): number {
	const places = new Set<string>();
	for (const span of runsOf(points).map(spanOf))
		for (const other of others.filter((one) => one.level !== span.level)) {
			const [level, upright] = span.level ? [span, other] : [other, span];
			if (crosses(level, upright)) places.add(`${Math.round(upright.at)},${Math.round(level.at)}`);
		}
	return places.size;
}

/**
 * Whether a stretch runs beside another nearer than a lane, or on the other's
 * axis end to end with it, so the eye follows one into the other.
 * @param span The stretch.
 * @param other A run parallel to it.
 * @returns True when it does.
 */
function beside(span: Span, other: Span): boolean {
	const apart = Math.abs(other.at - span.at);
	if (apart < BEND_RADIUS) return shared(span, other) > -HANDOFF;
	return apart < LANE && shared(span, other) > -SAME;
}

/**
 * Whether a new stretch of a line crowds another line: runs beside it nearer
 * than a lane or on its axis (`beside`), or crosses it within a lane of where
 * it turns or splits, so the hop and the bend read as one knot.
 * @param span The new stretch.
 * @param others The other lines' runs.
 * @returns True when it does.
 */
function crowds(span: Span, others: readonly Span[]): boolean {
	return others.some((other) => {
		if (other.level === span.level) return beside(span, other);
		const nearEnd = Math.min(Math.abs(span.at - other.low), Math.abs(span.at - other.high));
		return crosses(span, other) && nearEnd < LANE + BEND_RADIUS;
	});
}

/**
 * How many times a line crosses each wall.
 * @param points The line.
 * @param walls The walls' boxes.
 * @returns The count for each box.
 */
function wallCrossings(points: readonly Point[], walls: readonly Box[]): number[] {
	const spans = runsOf(points).map(spanOf);
	return walls.map((box) => {
		const edges = wallSpans(box);
		return spans.reduce(
			(sum, span) =>
				sum + edges.filter((edge) => edge.level !== span.level && crosses(span, edge)).length,
			0,
		);
	});
}

/**
 * A box's four walls.
 * @param box The box.
 * @returns Its top, bottom, left and right walls.
 */
function wallSpans(box: Box): Span[] {
	const [right, bottom] = [box.x + box.width, box.y + box.height];
	return [
		{ level: true, at: box.y, low: box.x, high: right },
		{ level: true, at: bottom, low: box.x, high: right },
		{ level: false, at: box.x, low: box.y, high: bottom },
		{ level: false, at: right, low: box.y, high: bottom },
	];
}

/**
 * A run's length.
 * @param run The run.
 * @returns Its length.
 */
function lengthOf(run: Run): number {
	return Math.abs(run.to.x - run.from.x) + Math.abs(run.to.y - run.from.y);
}

/**
 * Whether every run between two turns a slide made or changed has room for its bends.
 * @param next The line after a slide.
 * @param old The line before.
 * @returns True when it does.
 */
function roomy(next: readonly Point[], old: readonly Point[]): boolean {
	const was = runsOf(old).map(spanOf);
	return runsOf(next)
		.slice(1, -1)
		.every((run) => lengthOf(run) >= SHORTEST || was.some((span) => sameSpan(span, spanOf(run))));
}

/**
 * Whether two spans are one.
 * @param one A span.
 * @param other Another.
 * @returns True when they are.
 */
function sameSpan(one: Span, other: Span): boolean {
	return (
		one.level === other.level &&
		Math.abs(one.at - other.at) < SAME &&
		Math.abs(one.low - other.low) < SAME &&
		Math.abs(one.high - other.high) < SAME
	);
}

/**
 * A line with the run between two turns slid onto the axis of a run two before or after it.
 * @param points The line.
 * @param index The run's index.
 * @param onto The point whose axis it slides onto.
 * @returns The line, not yet simplified.
 */
function slid(points: readonly Point[], index: number, onto: Point): Point[] {
	const upright = Math.abs(points[index]!.x - points[index + 1]!.x) < SAME;
	return points.map((point, at) => {
		if (at !== index && at !== index + 1) return point;
		return upright ? { x: onto.x, y: point.y } : { x: point.x, y: onto.y };
	});
}

/**
 * Every line one slide takes a step out of: each run between two turns slid
 * onto the axis of the run before the turn before it, or after the turn after
 * it, so the run between vanishes. A line's first and last runs meet cards
 * and never vanish.
 * @param points The line.
 * @returns The slid lines, simplified: a run a slide turns back on itself
 * is only as long as it reaches.
 */
function slides(points: readonly Point[]): Point[][] {
	const last = points.length - 1;
	const out: Point[][] = [];
	for (let index = 1; index + 2 <= last; index += 1)
		for (const onto of [index - 1, index + 2].filter((one) => one > 0 && one < last))
			out.push(corners(slid(points, index, points[onto]!)));
	return out;
}

/**
 * Whether a slide keeps a line clear of everything around it: what it moves
 * clear (`movesClear`), no more crossings, and the same walls crossed.
 * @param next The line after the slide.
 * @param old The line before.
 * @param weighing What it is weighed against.
 * @returns True when it does.
 */
function keepsClear(next: readonly Point[], old: readonly Point[], weighing: Weighing): boolean {
	const { others, walls } = weighing;
	return (
		movesClear(fresh(next, old), fresh(old, next), weighing) &&
		crossings(next, others) <= crossings(old, others) &&
		wallCrossings(next, walls).join() === wallCrossings(old, walls).join()
	);
}

/**
 * Whether what a slide adds to a line and takes from it stays clear: nothing
 * it takes is a trunk or the run through its label, and nothing it adds runs
 * through a box, a title band or its label, or crowds another line.
 * @param added The stretches the slide adds.
 * @param gone The stretches it takes away.
 * @param weighing What the line is weighed against.
 * @returns True when they do.
 */
function movesClear(added: readonly Span[], gone: readonly Span[], weighing: Weighing): boolean {
	const { others, label } = weighing;
	const labelled = [...added, ...gone].some((span) => label !== undefined && through(span, label));
	return (
		!labelled &&
		!gone.some((span) => others.some((other) => onOne(span, other))) &&
		!added.some((span) => blocked(span, weighing))
	);
}

/**
 * Whether a new stretch runs through a box, runs level through a title band,
 * or crowds another line.
 * @param span The stretch.
 * @param weighing What its line is weighed against.
 * @returns True when it does.
 */
function blocked(span: Span, weighing: Weighing): boolean {
	const { others, boxes, bands } = weighing;
	return (
		boxes.some((box) => through(span, box)) ||
		(span.level && bands.some((band) => through(span, band))) ||
		crowds(span, others)
	);
}

/**
 * What a line costs among the others: every crossing before any length.
 * @param line The line.
 * @param others The other lines' runs.
 * @returns The cost.
 */
function costOf(line: readonly Point[], others: readonly Span[]): number {
	return crossings(line, others) * 1e6 + runsOf(line).reduce((sum, run) => sum + lengthOf(run), 0);
}

/**
 * The best slide that takes a step out of a line, if any keeps it clear:
 * the one crossing fewest lines, then the shortest.
 * @param points The line.
 * @param weighing What it is weighed against.
 * @returns The slid line, or nothing.
 */
function bestSlide(points: readonly Point[], weighing: Weighing): Point[] | undefined {
	const kept = slides(points).filter(
		(next) => roomy(next, points) && keepsClear(next, points, weighing),
	);
	const costs = kept.map((next) => costOf(next, weighing.others));
	const best = costs.indexOf(Math.min(...costs));
	return best < 0 ? undefined : kept[best];
}

/**
 * What one line is weighed against: every other line as it stands now, and
 * every box, other lines' labels among them, grown by the room kept.
 * @param lines Every line.
 * @param routes Every line's points as they stand now.
 * @param index The line.
 * @param around What every line keeps clear of.
 * @returns The weighing.
 */
function weighingOf(
	lines: readonly Drawn[],
	routes: readonly (readonly Point[])[],
	index: number,
	around: Surroundings,
): Weighing {
	const others = routes.flatMap((route, at) => (at === index ? [] : runsOf(route).map(spanOf)));
	const labels = lines.flatMap(({ label }, at) =>
		at === index || label === undefined ? [] : [label],
	);
	return {
		others,
		boxes: [...around.boxes, ...labels].map((box) => grown(box, CLEARANCE)),
		walls: around.walls,
		bands: around.bands.map((band) => grown(band, LANE)),
		label: lines[index]!.label,
	};
}

/**
 * Every line with the steps it need not take taken out.
 * @param lines Every line, with its label.
 * @param around What every line keeps clear of.
 * @returns Each line's points, in order.
 */
function unstepped(lines: readonly Drawn[], around: Surroundings): Point[][] {
	const routes = lines.map(({ points }) => corners(points));
	for (let pass = 0; pass < PASSES; pass += 1) {
		let moved = false;
		for (let index = 0; index < routes.length; index += 1)
			for (
				let next = bestSlide(routes[index]!, weighingOf(lines, routes, index, around));
				next !== undefined;
				next = bestSlide(routes[index]!, weighingOf(lines, routes, index, around))
			) {
				routes[index] = next;
				moved = true;
			}
		if (!moved) break;
	}
	return routes;
}

export { unstepped, type Drawn, type Surroundings };
