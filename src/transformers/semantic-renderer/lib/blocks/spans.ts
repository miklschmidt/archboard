// A line's runs read along their axes (visual polish): where each stands
// across, how far it reaches along, and what two runs, or a run and a box,
// share. The steps a joined line need not take are found with these
// (`steps.ts`).
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";

/** How close two coordinates are and still one. */
const SAME = 0.5;

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
 * Whether two points are one.
 * @param one A point.
 * @param other Another.
 * @returns True when they are.
 */
function samePoint(one: Point, other: Point): boolean {
	return Math.abs(one.x - other.x) < SAME && Math.abs(one.y - other.y) < SAME;
}

export {
	SAME,
	crosses,
	fresh,
	grown,
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
};
