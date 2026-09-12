// Settling the label pills so that no two of them intersect.
//
// Forked from PR Lens's `layout/labels.ts`. Tracks separate the lines, but
// nothing in the router separates the pills riding them: when several labelled
// runs share a gap, track pitch is far finer than a pill, and the pills stack.
// This pass settles every pill so that no two intersect, preferring a nudge
// along the pill's own run — the label stays on its own line, just off the
// crowded spot — over anything that would loosen the tie between a label and
// its line.
//
// The only change is that widths are measured rather than looked up.

import {
	PILL_CLEARANCE,
	PILL_HEIGHT,
	PILL_PADDING_X,
	PILL_TEXT_SIZE,
} from "@/runtime/semantic-renderer/lib/design";
import type { Box, Point } from "@/runtime/semantic-renderer/lib/geometry";
import { measure } from "@/runtime/semantic-renderer/lib/text";
import { PILL_FONT } from "@/runtime/semantic-renderer/lib/fonts";
import { EPSILON, type Curve } from "@/runtime/semantic-renderer/lib/layout/curves";
import type { RoutedEdge } from "@/runtime/semantic-renderer/lib/layout/edges";

/** How big a pill is. */
interface Size {
	/** Its width. */
	readonly width: number;
	/** Its height. */
	readonly height: number;
}

/** A straight run of a route, described by its slide axis. */
interface Run {
	/** Which way the pill may slide along it. */
	readonly axis: "x" | "y";
	/** The coordinate the run holds fixed — y of a horizontal run, x of a vertical one. */
	readonly cross: number;
	/** The lower end of the run. */
	readonly lo: number;
	/** The upper end. */
	readonly hi: number;
}

/** One interval of a run a pill may not centre itself in. */
interface Blocked {
	/** Where the forbidden interval starts. */
	readonly from: number;
	/** Where it ends. */
	readonly to: number;
}

/**
 * One line segment of a route as a run.
 * @param start Where the segment begins.
 * @param end Where it ends.
 * @returns The run.
 */
function runOf(start: Point, end: Point): Run {
	const horizontal = Math.abs(end.y - start.y) < EPSILON;
	if (horizontal) {
		return {
			axis: "x",
			cross: start.y,
			lo: Math.min(start.x, end.x),
			hi: Math.max(start.x, end.x),
		};
	}
	return { axis: "y", cross: start.x, lo: Math.min(start.y, end.y), hi: Math.max(start.y, end.y) };
}

/**
 * The longest straight run of a route — the run the router pins the label to,
 * and the only one collision handling may slide it along. Earlier segments win
 * a tie, matching how the anchor itself is chosen.
 * @param curve The route.
 * @returns The run, or undefined when the route only bends.
 */
function longestRun(curve: Curve): Run | undefined {
	let best: Run | undefined;
	let start = curve.from;
	for (const segment of curve.segments) {
		if (segment.kind === "line") {
			const run = runOf(start, segment.to);
			if (best === undefined || run.hi - run.lo > best.hi - best.lo) {
				best = run;
			}
		}
		start = segment.to;
	}
	return best;
}

/**
 * A box of this size centred on a point.
 * @param centre Where it goes.
 * @param size How big it is.
 * @returns The box.
 */
function centred(centre: Point, size: Size): Box {
	return {
		x: centre.x - size.width / 2,
		y: centre.y - size.height / 2,
		width: size.width,
		height: size.height,
	};
}

/**
 * A point on a run, at a distance along it.
 * @param run The run.
 * @param along How far along.
 * @returns The point.
 */
function centreOn(run: Run, along: number): Point {
	return run.axis === "x" ? { x: along, y: run.cross } : { x: run.cross, y: along };
}

/**
 * Exactly PILL_CLEARANCE of air is enough, so the comparisons are strict.
 * @param a One box.
 * @param b The other.
 * @returns True when they are closer than the clearance.
 */
function collides(a: Box, b: Box): boolean {
	return (
		a.x < b.x + b.width + PILL_CLEARANCE &&
		b.x < a.x + a.width + PILL_CLEARANCE &&
		a.y < b.y + b.height + PILL_CLEARANCE &&
		b.y < a.y + a.height + PILL_CLEARANCE
	);
}

/** A box measured in one run's own two axes. */
interface Projection {
	/** Where the box starts, along the run. */
	readonly alongLo: number;
	/** Where it ends, along the run. */
	readonly alongHi: number;
	/** Where it starts, across the run. */
	readonly crossLo: number;
	/** Where it ends, across the run. */
	readonly crossHi: number;
}

/**
 * A box in one run's own axes.
 * @param box The box.
 * @param axis The run's axis.
 * @returns The box, measured along and across the run.
 */
function project(box: Box, axis: "x" | "y"): Projection {
	if (axis === "x") {
		return {
			alongLo: box.x,
			alongHi: box.x + box.width,
			crossLo: box.y,
			crossHi: box.y + box.height,
		};
	}
	return {
		alongLo: box.y,
		alongHi: box.y + box.height,
		crossLo: box.x,
		crossHi: box.x + box.width,
	};
}

/**
 * Half a pill, measured along a run.
 * @param size The pill.
 * @param axis The run's axis.
 * @returns Half its extent along the run.
 */
function alongHalf(size: Size, axis: "x" | "y"): number {
	return (axis === "x" ? size.width : size.height) / 2;
}

/**
 * Half a pill, measured across a run.
 * @param size The pill.
 * @param axis The run's axis.
 * @returns Half its extent across the run.
 */
function crossHalf(size: Size, axis: "x" | "y"): number {
	return (axis === "x" ? size.height : size.width) / 2;
}

/**
 * The stretch of one run a settled box forbids a pill's centre, when the two
 * are near enough in the cross axis to matter at all.
 * @param run The run.
 * @param size The pill.
 * @param box The settled box.
 * @returns The forbidden interval, or nothing.
 */
function blockedBy(run: Run, size: Size, box: Box): Blocked[] {
	const at = project(box, run.axis);
	const cross = crossHalf(size, run.axis);
	if (run.cross - cross >= at.crossHi + PILL_CLEARANCE) {
		return [];
	}
	if (run.cross + cross <= at.crossLo - PILL_CLEARANCE) {
		return [];
	}
	const along = alongHalf(size, run.axis);
	return [{ from: at.alongLo - PILL_CLEARANCE - along, to: at.alongHi + PILL_CLEARANCE + along }];
}

/**
 * Which of two candidate positions is the better answer: nearer the run's
 * midpoint, and the lower coordinate when they tie.
 * @param candidate The position being considered.
 * @param best The best so far, if any.
 * @param preferred The run's midpoint.
 * @returns True when the candidate wins.
 */
function beats(candidate: number, best: number | undefined, preferred: number): boolean {
	if (best === undefined) {
		return true;
	}
	const gap = Math.abs(candidate - preferred) - Math.abs(best - preferred);
	return gap < 0 || (gap === 0 && candidate < best);
}

/**
 * The position along the run closest to its midpoint where the pill clears
 * everything already settled, or undefined when the run offers no room.
 *
 * A pill wider than a short run may only take the midpoint — overhanging both
 * ends evenly, which is what the router always did with short runs. `reach`
 * lets a second, more desperate pass push the pill up to that far past the
 * run's ends — still square on its own line, at the line's foot.
 * @param run The run.
 * @param size The pill.
 * @param settled Every pill already placed.
 * @param reach How far past the run's ends the pill may be pushed.
 * @returns Where along the run the pill's centre goes, or undefined.
 */
function slideAlong(
	run: Run,
	size: Size,
	settled: readonly Box[],
	reach: number,
): number | undefined {
	const half = alongHalf(size, run.axis);
	const preferred = (run.lo + run.hi) / 2;
	const lo = Math.min(run.lo + half - reach, preferred);
	const hi = Math.max(run.hi - half + reach, preferred);
	const blocked = settled.flatMap((box) => blockedBy(run, size, box));

	let best: number | undefined;
	/**
	 * Take a candidate position when it is legal and better than the best so far.
	 * @param candidate The position.
	 */
	const consider = (candidate: number): void => {
		const legal =
			candidate >= lo &&
			candidate <= hi &&
			!blocked.some((b) => b.from < candidate && candidate < b.to);
		if (legal && beats(candidate, best, preferred)) {
			best = candidate;
		}
	};

	consider(preferred);
	for (const b of blocked) {
		consider(b.from);
		consider(b.to);
	}
	return best;
}

/**
 * The tiebreak for a pill none of its runs can host: hold the anchor's position
 * along the line and step square off it, nearer side first, until the pill
 * clears — it ends up beside its own line rather than on it, but never more
 * than a step or two away, and always in the same place for the same document.
 * @param anchor Where the label wanted to be.
 * @param axis The run's axis.
 * @param size The pill.
 * @param settled Every pill already placed.
 * @returns Where the pill goes.
 */
function stepAside(anchor: Point, axis: "x" | "y", size: Size, settled: readonly Box[]): Box {
	const step = crossHalf(size, axis) * 2 + PILL_CLEARANCE;
	// Below (or right of) the line first. Either side is the same distance, so
	// the order is arbitrary geometry and deliberate typography: a label pushed
	// off a line near the top of the picture lands inside it rather than in the
	// margin above it, which is where PR Lens's up-first order put it.
	for (let k = 1; ; k += 1) {
		for (const sign of [1, -1]) {
			const offset = sign * k * step;
			const centre =
				axis === "x"
					? { x: anchor.x, y: anchor.y + offset }
					: { x: anchor.x + offset, y: anchor.y };
			const box = centred(centre, size);
			if (!settled.some((other) => collides(box, other))) {
				return box;
			}
		}
	}
}

/**
 * Where one pill ends up.
 * @param curve The route it labels.
 * @param anchor Where the router put its label.
 * @param size The pill.
 * @param settled Every pill already placed.
 * @returns The pill's box.
 */
function settle(curve: Curve, anchor: Point, size: Size, settled: readonly Box[]): Box {
	const run = longestRun(curve);
	if (run !== undefined) {
		const onLine = onRun(run, size, settled);
		if (onLine !== undefined) {
			return onLine;
		}
	}

	// A route that only bends — a self-loop — has no run to slide along; its
	// anchor still stands wherever it is clear.
	const atAnchor = centred(anchor, size);
	if (!settled.some((other) => collides(atAnchor, other))) {
		return atAnchor;
	}
	return stepAside(anchor, run === undefined ? "x" : run.axis, size, settled);
}

/**
 * Where on its own line a pill can sit: square on it if there is room, and
 * failing that a little past one of its ends.
 * @param run The route's longest straight run.
 * @param size The pill.
 * @param settled Everything already placed.
 * @returns The pill's box, or undefined when the line cannot host it.
 */
function onRun(run: Run, size: Size, settled: readonly Box[]): Box | undefined {
	for (const reach of [0, PILL_HEIGHT]) {
		const along = slideAlong(run, size, settled, reach);
		if (along !== undefined) {
			return centred(centreOn(run, along), size);
		}
	}
	return undefined;
}

/**
 * A pill box for every labelled route, none intersecting any other and none
 * landing on the words of a card or a band header.
 *
 * Routes settle in document order, and a pill whose anchor is already clear
 * stays exactly where the router put it, so an uncrowded diagram is untouched.
 * PR Lens settled pills against other pills alone, which was enough when a
 * label only ever rode a line through a gap; a route that attaches to a band
 * header has a short run right beside the header's own text, and a pill landing
 * there covers the one thing that says what the band is.
 * @param routed Every drawn route.
 * @param occupied Boxes a pill must stay off: the cards and the band headers.
 * @returns Each labelled edge's pill box, by edge id.
 */
function placeLabelPills(
	routed: readonly RoutedEdge[],
	occupied: readonly Box[],
): Map<string, Box> {
	const placed: Box[] = [...occupied];
	const boxes = new Map<string, Box>();
	for (const { edge, curve, labelAnchor } of routed) {
		if (edge.label === undefined || labelAnchor === undefined) {
			continue;
		}
		// The mono face, because that is the face the pill is drawn in: a pill
		// sized against one family and set in another is a pill its own text
		// overflows.
		const size = {
			width: measure(edge.label, PILL_FONT, PILL_TEXT_SIZE) + PILL_PADDING_X * 2,
			height: PILL_HEIGHT,
		};
		const box = settle(curve, labelAnchor, size, placed);
		placed.push(box);
		boxes.set(edge.id, box);
	}
	return boxes;
}

export { placeLabelPills };
