// Steps a joined line need not take, taken out (visual polish). A line that
// passes several blocks is joined from a piece routed in each, and each piece
// was routed before the others stood beside it: where two pieces meet at a
// port that lines up with neither, or where a block's tracks turned the line
// for something that is out of the way once the blocks stand together, the
// joined line steps sideways and on, doubles back at a wall, or climbs a
// staircase where one turn would do. Once the drawing is joined, each such
// step is taken out by sliding the run between its two turns onto the
// column, or row, of the run before or after it, so the two runs either side
// become one. A slide is kept only where the line's new stretch keeps the
// router's clearance from every card and title, half a lane from every
// label, a lane from every other line and a lane and a half from every wall,
// crosses no more lines and no wall it did not cross, and still runs straight
// through the line's own label: no turn comes within a bend's radius of the
// label, since a turn rounds that far along each run it joins and a label on
// the curve sits off its line. A run other lines share, a trunk, moves only
// with all of them and only where none runs much longer for it; a line's
// first or last run never leaves the card face it meets.
import { APPROACH_STRAIGHT, BEND_RADIUS } from "#shared/constants/spacing.ts";
import { inflate, type Box, type Point } from "#shared/rules/geometry.ts";
import { corners } from "#shared/rules/blocks/tree/laid.ts";
import { TRUNK_CLEARANCE } from "#shared/rules/blocks/packing/trunks.ts";
import { LANE, REGION_CLEARANCE } from "#shared/rules/track/routes/chains.ts";
import {
	SAME,
	crosses,
	fresh,
	lengthOf,
	onOne,
	runsOf,
	sameSpan,
	samePoint,
	shared,
	spanOf,
	through,
	wallSpans,
	type Run,
	type Span,
} from "#shared/rules/blocks/lines/spans.ts";

/** How far a line's new stretch keeps from another line's label. */
const LABEL_CLEARANCE = LANE / 2;
/** The shortest run between two turns, whose two bends need room. */
const SHORTEST = 2 * BEND_RADIUS;
/** The shortest last run after a turn: its bend, and the straight run its arrowhead needs. */
const SHORTEST_ARRIVAL = BEND_RADIUS + APPROACH_STRAIGHT;
/** How far apart two lines on one axis still read as one. */
const HANDOFF = 4 * LANE;
/**
 * How much longer a slide may make a line it moves: a trunk's lines follow
 * its slide, and a turn or two more to run with the trunk reads better than a
 * step, but a way round a far channel does not. Measured on the dogfood
 * boards: the slides that read well add up to 308 px (Board persistence
 * whole, Archboard server whole), the ways round at least 703 px (Codex
 * workhorse whole).
 */
const CARRIED = 24 * LANE;
/**
 * How many times every line is looked at again, after the others moved: a
 * bound on time, since a slide can free another line's slide on and on.
 */
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

/** The lines one slide moves, by index, with their points after it. */
type Moved = Map<number, Point[]>;

/** What a line a slide moves is weighed against, given every line the slide moves. */
type Weigher = (moved: ReadonlySet<number>, line: number) => Weighing;

/** Everything a slide of one line is weighed against. */
interface Weighing {
	/** Every other line's runs. */
	readonly others: readonly Span[];
	/** Every box the line keeps clear of, grown by the room it keeps. */
	readonly boxes: readonly Box[];
	readonly walls: readonly Box[];
	/** Every title band, grown by a lane. */
	readonly bands: readonly Box[];
	/** The line's own label, grown by a bend's radius: what its turns keep clear of. */
	readonly label: Box | undefined;
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
 * Whether a line leaves and meets its cards the way it did: its first and
 * last runs run the same way. A line that shares a trunk's step can have its
 * own end run on the run that vanishes.
 * @param next The line after a slide.
 * @param old The line before.
 * @returns True when they do.
 */
function keepsEnds(next: readonly Point[], old: readonly Point[]): boolean {
	return (
		wayOf(next[0]!, next[1]!) === wayOf(old[0]!, old[1]!) &&
		wayOf(next.at(-2)!, next.at(-1)!) === wayOf(old.at(-2)!, old.at(-1)!)
	);
}

/**
 * The way a run runs, as the sign of its step in x and y.
 * @param from Its start.
 * @param to Its end.
 * @returns The way.
 */
function wayOf(from: Point, to: Point): string {
	return `${Math.sign(to.x - from.x)},${Math.sign(to.y - from.y)}`;
}

/**
 * Whether every run between two turns a slide made or changed has room for its
 * bends, and the last run after a turn room for its bend and its arrowhead.
 * @param next The line after a slide.
 * @param old The line before.
 * @returns True when it does.
 */
function roomy(next: readonly Point[], old: readonly Point[]): boolean {
	const was = runsOf(old).map(spanOf);
	/**
	 * Whether a run is one the line had before the slide.
	 * @param run The run.
	 * @returns True when it is.
	 */
	const kept = (run: Run): boolean => was.some((span) => sameSpan(span, spanOf(run)));
	const runs = runsOf(next);
	const arrival = runs.length > 1 ? runs.at(-1) : undefined;
	return (
		runs.slice(1, -1).every((run) => lengthOf(run) >= SHORTEST || kept(run)) &&
		(arrival === undefined || lengthOf(arrival) >= SHORTEST_ARRIVAL || kept(arrival))
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

/** One slide: the run between two turns, by its index, and the point whose axis it slides onto. */
interface Slide {
	readonly at: number;
	readonly onto: Point;
}

/**
 * Every slide that takes a step out of a line: each run between two turns
 * slid onto the axis of the run before the turn before it, or after the turn
 * after it, so the run between vanishes. A line's first and last runs meet
 * cards and never vanish.
 * @param points The line.
 * @returns The slides.
 */
function slidesOf(points: readonly Point[]): Slide[] {
	const last = points.length - 1;
	const out: Slide[] = [];
	for (let at = 1; at + 2 <= last; at += 1)
		for (const onto of [at - 1, at + 2].filter((one) => one > 0 && one < last))
			out.push({ at, onto: points[onto]! });
	return out;
}

/**
 * Where a line runs the same run between two turns as another: the run's index.
 * @param route The line.
 * @param run The run's two ends.
 * @returns The index, or -1 when the line does not turn at both its ends.
 */
function runIn(route: readonly Point[], run: readonly [Point, Point]): number {
	return route.findIndex(
		(point, at) =>
			at > 0 &&
			at + 2 < route.length &&
			samePoint(point, run[0]) &&
			samePoint(route[at + 1]!, run[1]),
	);
}

/**
 * The lines one slide moves: the line, and every line sharing a stretch it
 * moves, a trunk, which slides the same run with it. A line that shares the
 * stretch but not the whole run between two turns cannot follow.
 * @param routes Every line's points.
 * @param line The line slid.
 * @param slide The slide.
 * @returns Each moved line's points, by index, or nothing when a sharer cannot follow.
 */
function trunkOf(
	routes: readonly (readonly Point[])[],
	line: number,
	slide: Slide,
): Moved | undefined {
	const route = routes[line]!;
	const run = [route[slide.at]!, route[slide.at + 1]!] as const;
	const moved: Moved = new Map([[line, corners(slid(route, slide.at, slide.onto))]]);
	for (const member of moved.keys()) {
		const gone = fresh(routes[member]!, moved.get(member)!);
		for (const [other, points] of routes.entries()) {
			if (moved.has(other) || !sharesAny(points, gone)) continue;
			const at = runIn(points, run);
			if (at < 0) return undefined;
			moved.set(other, corners(slid(points, at, slide.onto)));
		}
	}
	return moved;
}

/**
 * Whether a line runs along any of some stretches.
 * @param points The line.
 * @param stretches The stretches.
 * @returns True when it does.
 */
function sharesAny(points: readonly Point[], stretches: readonly Span[]): boolean {
	return runsOf(points).some((run) => stretches.some((span) => onOne(span, spanOf(run))));
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
 * it takes or adds comes within a bend of its label, and nothing it adds runs
 * through a box or a title band, or crowds another line. A trunk it takes
 * moves with every line on it (`trunkOf`).
 * @param added The stretches the slide adds.
 * @param gone The stretches it takes away.
 * @param weighing What the line is weighed against.
 * @returns True when they do.
 */
function movesClear(added: readonly Span[], gone: readonly Span[], weighing: Weighing): boolean {
	const { label } = weighing;
	const labelled = [...added, ...gone].some((span) => label !== undefined && through(span, label));
	return !labelled && !added.some((span) => blocked(span, weighing));
}

/**
 * Whether a new stretch runs through a box, runs level through a title band,
 * runs along a wall, or crowds another line.
 * @param span The stretch.
 * @param weighing What its line is weighed against.
 * @returns True when it does.
 */
function blocked(span: Span, weighing: Weighing): boolean {
	const { others, boxes, bands, walls } = weighing;
	return (
		boxes.some((box) => through(span, box)) ||
		(span.level && bands.some((band) => through(span, band))) ||
		walls.some((box) => hugs(span, box)) ||
		crowds(span, others)
	);
}

/**
 * Whether a stretch runs along one of a box's walls nearer than a lane and a
 * half: a wall is a thin line, and a line a lane off it reads as its outline.
 * @param span The stretch.
 * @param box The box.
 * @returns True when it does.
 */
function hugs(span: Span, box: Box): boolean {
	return wallSpans(box).some(
		(wall) =>
			wall.level === span.level &&
			Math.abs(wall.at - span.at) < REGION_CLEARANCE &&
			shared(span, wall) > SAME,
	);
}

/**
 * How far a line runs.
 * @param line The line.
 * @returns Its length.
 */
function reach(line: readonly Point[]): number {
	return runsOf(line).reduce((sum, run) => sum + lengthOf(run), 0);
}

/**
 * What a line costs among the others: every crossing before any length.
 * @param line The line.
 * @param others The other lines' runs.
 * @returns The cost.
 */
function costOf(line: readonly Point[], others: readonly Span[]): number {
	return crossings(line, others) * 1e6 + reach(line);
}

/**
 * Whether every run stays on one axis within the join tolerance.
 * @param points The line after a slide.
 * @returns True when no slide stretches a small port offset into a diagonal.
 */
function onAxes(points: readonly Point[]): boolean {
	return runsOf(points).every(
		({ from, to }) => Math.abs(from.x - to.x) < SAME || Math.abs(from.y - to.y) < SAME,
	);
}

/**
 * Whether every line a slide moves keeps its shape and stays clear of the lines it does not move.
 * @param moved Each moved line's points, by index.
 * @param routes Every line's points before the slide.
 * @param weigh What a moved line is weighed against.
 * @returns True when they all do.
 */
function fits(moved: Moved, routes: readonly (readonly Point[])[], weigh: Weigher): boolean {
	const lines = new Set(moved.keys());
	return [...moved].every(([line, next]) => {
		const old = routes[line]!;
		return (
			onAxes(next) &&
			reach(next) <= reach(old) + CARRIED &&
			keepsEnds(next, old) &&
			roomy(next, old) &&
			keepsClear(next, old, weigh(lines, line))
		);
	});
}

/**
 * What a slide costs: every line it moves, among the lines it does not.
 * @param moved Each moved line's points, by index.
 * @param weigh What a moved line is weighed against.
 * @returns The cost.
 */
function slideCost(moved: Moved, weigh: Weigher): number {
	const lines = new Set(moved.keys());
	return [...moved].reduce((sum, [line, next]) => sum + costOf(next, weigh(lines, line).others), 0);
}

/**
 * The best slide that takes a step out of a line, if any keeps every line it
 * moves clear: the one crossing fewest lines, then the shortest.
 * @param routes Every line's points.
 * @param line The line.
 * @param weigh What a moved line is weighed against.
 * @returns The lines it moves, or nothing.
 */
function bestSlide(
	routes: readonly (readonly Point[])[],
	line: number,
	weigh: Weigher,
): Moved | undefined {
	const kept = slidesOf(routes[line]!).flatMap((slide) => {
		const moved = trunkOf(routes, line, slide);
		return moved !== undefined && fits(moved, routes, weigh) ? [moved] : [];
	});
	const costs = kept.map((moved) => slideCost(moved, weigh));
	return kept[costs.indexOf(Math.min(...costs))];
}

/**
 * What one line is weighed against: every line a slide does not move as it
 * stands now, and every box, other lines' labels among them, grown by the room kept.
 * @param lines Every line.
 * @param routes Every line's points as they stand now.
 * @param around What every line keeps clear of.
 * @returns The weighing, given the lines a slide moves and the line weighed.
 */
function weighingOf(
	lines: readonly Drawn[],
	routes: readonly (readonly Point[])[],
	around: Surroundings,
): Weigher {
	const runs = routes.map((route) => runsOf(route).map(spanOf));
	const boxes = around.boxes.map((box) => inflate(box, TRUNK_CLEARANCE));
	const labels = lines.map(({ label }) =>
		label === undefined ? undefined : inflate(label, LABEL_CLEARANCE),
	);
	const own = lines.map(({ label }) =>
		label === undefined ? undefined : inflate(label, BEND_RADIUS),
	);
	const bands = around.bands.map((band) => inflate(band, LANE));
	return (moved, line) => ({
		others: runs.flatMap((spans, at) => (moved.has(at) ? [] : spans)),
		boxes: [
			...boxes,
			...labels.flatMap((label, at) => (at === line || label === undefined ? [] : [label])),
		],
		walls: around.walls,
		bands,
		label: own[line],
	});
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
		let slides = 0;
		for (let line = 0; line < routes.length; line += 1)
			for (
				let moved = bestSlide(routes, line, weighingOf(lines, routes, around));
				moved !== undefined;
				moved = bestSlide(routes, line, weighingOf(lines, routes, around))
			) {
				for (const [one, next] of moved) routes[one] = next;
				slides += 1;
			}
		if (slides === 0) break;
	}
	return routes;
}

export { unstepped, type Drawn, type Surroundings };
