// Turning one drawn line into another, as arithmetic.
//
// A connection's route is a `d` attribute the renderer wrote — a run of
// straight legs and rounded corners — and the route of the same connection in
// the next picture is another. Between the two the pane wants a line that is a
// line the whole way: no polyline stand-in that squares the corners off, no
// snap at either end. So both routes are read into the one shape every command
// can be written as, a chain of cubic Bézier segments (`path-reading`), the
// shorter chain is cut until the two have the same number of segments, and
// then every control point is a straight interpolation. A cubic interpolated
// pointwise is still a cubic, which is what keeps the corners round in flight.
//
// Nothing here touches a DOM. It is the arithmetic the transition applies, and
// it is held to what it does by module tests without a browser.

import {
	mix,
	parsePath,
	type Cubic,
	type Outline,
	type Point,
} from "@/ui/semantic-board-canvas/lib/path-reading";

/**
 * A point along a cubic.
 * @param from Where it starts.
 * @param segment The segment.
 * @param t How far along, 0 to 1.
 * @returns The point.
 */
function along(from: Point, segment: Cubic, t: number): Point {
	const u = 1 - t;
	const a = u * u * u;
	const b = 3 * u * u * t;
	const c = 3 * u * t * t;
	const d = t * t * t;
	return {
		x: a * from.x + b * segment.c1.x + c * segment.c2.x + d * segment.to.x,
		y: a * from.y + b * segment.c1.y + c * segment.c2.y + d * segment.to.y,
	};
}

/** How finely a cubic is walked when its length is wanted. */
const LENGTH_STEPS = 16;

/**
 * How long a cubic is, near enough: the polyline through sixteen points of it.
 * @param from Where it starts.
 * @param segment The segment.
 * @returns The length.
 */
function cubicLength(from: Point, segment: Cubic): number {
	let total = 0;
	let previous = from;
	for (let step = 1; step <= LENGTH_STEPS; step += 1) {
		const next = along(from, segment, step / LENGTH_STEPS);
		total += Math.hypot(next.x - previous.x, next.y - previous.y);
		previous = next;
	}
	return total;
}

/**
 * Where each segment of an outline starts.
 * @param outline The outline.
 * @returns One point per segment, in order.
 */
function starts(outline: Outline): Point[] {
	return outline.segments.map((_segment, index) =>
		index === 0 ? outline.start : outline.segments[index - 1]!.to,
	);
}

/**
 * How long an outline is, near enough to set a dash to.
 * @param outline The outline.
 * @returns Its length.
 */
function outlineLength(outline: Outline): number {
	const from = starts(outline);
	return outline.segments.reduce(
		(total, segment, index) => total + cubicLength(from[index]!, segment),
		0,
	);
}

/**
 * Cut one cubic into two that together draw exactly the same curve.
 * @param from Where it starts.
 * @param segment The segment.
 * @returns Its two halves.
 */
function split(from: Point, segment: Cubic): [Cubic, Cubic] {
	const ab = mix(from, segment.c1, 0.5);
	const bc = mix(segment.c1, segment.c2, 0.5);
	const cd = mix(segment.c2, segment.to, 0.5);
	const abc = mix(ab, bc, 0.5);
	const bcd = mix(bc, cd, 0.5);
	const middle = mix(abc, bcd, 0.5);
	return [
		{ c1: ab, c2: abc, to: middle },
		{ c1: bcd, c2: cd, to: segment.to },
	];
}

/**
 * Which segment of an outline is longest.
 * @param outline The outline.
 * @returns Its index.
 */
function longestSegment(outline: Outline): number {
	const from = starts(outline);
	let longest = 0;
	let longestLength = -1;
	outline.segments.forEach((segment, index) => {
		const length = cubicLength(from[index]!, segment);
		if (length > longestLength) {
			longestLength = length;
			longest = index;
		}
	});
	return longest;
}

/**
 * The same outline in more segments, the longest cut in half each time.
 *
 * Cutting the longest keeps the added anchors spread along the line, so when
 * the other outline's anchors are interpolated against them nothing bunches
 * up at one end.
 * @param outline The outline.
 * @param count How many segments it should have; at least what it has.
 * @returns The outline, drawn in that many segments.
 */
function refine(outline: Outline, count: number): Outline {
	let refined = outline;
	while (refined.segments.length < count) {
		const index = longestSegment(refined);
		const segments = [...refined.segments];
		segments.splice(index, 1, ...split(starts(refined)[index]!, segments[index]!));
		refined = { ...refined, segments };
	}
	return refined;
}

/**
 * A number as a `d` writes it: two decimals, no trailing noise.
 * @param value The number.
 * @returns Its text.
 */
function figure(value: number): string {
	return String(Math.round(value * 100) / 100);
}

/**
 * A point as a `d` writes it.
 * @param point The point.
 * @returns Its text.
 */
function coordinates(point: Point): string {
	return `${figure(point.x)},${figure(point.y)}`;
}

/**
 * Write an outline back as a `d`.
 * @param outline The outline.
 * @returns The attribute, absolute and in cubics throughout.
 */
function serialise(outline: Outline): string {
	const parts = [`M${coordinates(outline.start)}`];
	for (const { c1, c2, to } of outline.segments) {
		parts.push(`C${coordinates(c1)} ${coordinates(c2)} ${coordinates(to)}`);
	}
	if (outline.closed) {
		parts.push("Z");
	}
	return parts.join(" ");
}

/**
 * The outline some way between two of the same length.
 * @param left The outline at 0.
 * @param right The outline at 1.
 * @param progress How far from left to right.
 * @returns The outline.
 */
function between(left: Outline, right: Outline, progress: number): Outline {
	return {
		start: mix(left.start, right.start, progress),
		closed: right.closed,
		segments: left.segments.map((segment, index) => {
			const other = right.segments[index]!;
			return {
				c1: mix(segment.c1, other.c1, progress),
				c2: mix(segment.c2, other.c2, progress),
				to: mix(segment.to, other.to, progress),
			};
		}),
	};
}

/**
 * A function from progress to the line that far between two routes.
 *
 * Exact at both ends: at 0 it answers the first `d` as it was written and at 1
 * the second, so a picture that has finished moving is the picture the server
 * drew, byte for byte in this attribute.
 * @param from The route to leave.
 * @param to The route to arrive at.
 * @returns The morph, or null when either route is not one this can carry.
 */
function morphPath(from: string, to: string): ((progress: number) => string) | null {
	const a = parsePath(from);
	const b = parsePath(to);
	if (a === null || b === null || a.segments.length === 0 || b.segments.length === 0) {
		return null;
	}
	const count = Math.max(a.segments.length, b.segments.length);
	const left = refine(a, count);
	const right = refine(b, count);
	return (progress: number): string => {
		if (progress <= 0) {
			return from;
		}
		return progress >= 1 ? to : serialise(between(left, right, progress));
	};
}

/**
 * How long a drawn line is, for drawing it on from one end.
 * @param d The attribute.
 * @returns Its length, or null when it is not a line this can measure.
 */
function pathLength(d: string): number | null {
	const outline = parsePath(d);
	return outline === null ? null : outlineLength(outline);
}

export { morphPath, parsePath, pathLength, serialise, type Cubic, type Outline, type Point };
