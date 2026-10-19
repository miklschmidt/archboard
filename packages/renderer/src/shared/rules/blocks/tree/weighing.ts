// What the block engine weighs a layout on when it chooses between layouts on
// how they read (ADR 0039): a block of cards laid out, or a whole drawing as
// placed, each on its lines as drawn: their crossings, their bends and their
// length, and the page. A block of cards also counts each line that laps
// round it past every card it holds as a crossing: stacked, One write lands
// (Track) turned its lines four times less, but sent 'announce the accepted
// write' down the page's right edge alongside another line. It counts each
// line that turns round the corner of a container it has no end in as a
// crossing too: stacked, Code evidence (Track) sent 'read a board, write one
// under its lease' over the container and down its far side, across the whole
// page. Each also counts its lines' runs away from their ends as crossings
// (`away.ts`).
import { awayPlaced } from "#shared/rules/blocks/lines/away.ts";
import { corners, type Laid } from "#shared/rules/blocks/tree/laid.ts";
import type { Projection } from "#shared/rules/blocks/tree/tree.ts";
import type { Box, Point } from "#shared/rules/geometry.ts";
import type { FrameShape } from "#shared/rules/track/scene/containers.ts";
import { crossingsOf, LAP, lapsOf, type Weighed } from "#shared/rules/track/scene/score.ts";

/** A drawing as placed: its page, its cards and containers, and every relationship's points. */
interface Page {
	readonly width: number;
	readonly height: number;
	readonly cards?: readonly { readonly id: string; readonly box: Box }[];
	readonly frames?: readonly { readonly id: string; readonly box: Box }[];
	readonly edges: readonly { readonly id: string; readonly points: readonly Point[] }[];
}

/**
 * What a layout's lines show a reader: their crossings, their bends and
 * their length.
 * @param page The layout's page.
 * @param page.width Its width.
 * @param page.height Its height.
 * @param lines Every line's points.
 * @returns What the layout is weighed on.
 */
function readingOf(
	page: { width: number; height: number },
	lines: readonly (readonly Point[])[],
): Weighed {
	const turns = lines.map((points) => corners(points));
	let length = 0;
	for (const points of turns)
		for (const [index, to] of points.slice(1).entries())
			length += Math.abs(to.x - points[index]!.x) + Math.abs(to.y - points[index]!.y);
	return {
		width: page.width,
		height: page.height,
		crossings: crossingsOf(turns),
		bends: turns.reduce((sum, points) => sum + Math.max(0, points.length - 2), 0),
		length,
	};
}

/** A straight run of a line, from one of its corners to the next. */
interface Leg {
	readonly from: Point;
	readonly to: Point;
}

/**
 * Whether a value lies between two bounds, or on one.
 * @param value The value.
 * @param low The lower bound.
 * @param high The upper bound.
 * @returns True when it does.
 */
function between(value: number, low: number, high: number): boolean {
	return value >= low && value <= high;
}

/**
 * Whether a point stands inside a box or on its edge.
 * @param point The point.
 * @param box The box.
 * @returns True when it does.
 */
function within(point: Point, box: Box): boolean {
	return (
		between(point.x, box.x - 1, box.x + box.width + 1) &&
		between(point.y, box.y - 1, box.y + box.height + 1)
	);
}

/**
 * Whether a run is level, passes over or under a box, and passes one of its sides.
 * @param leg The run.
 * @param box The box.
 * @returns True when it does.
 */
function passesBy(leg: Leg, box: Box): boolean {
	const { from, to } = leg;
	const level = Math.abs(from.y - to.y) < 0.5;
	const sides = [box.x, box.x + box.width];
	return (
		level &&
		!between(from.y, box.y, box.y + box.height) &&
		sides.some((side) => side > Math.min(from.x, to.x) && side < Math.max(from.x, to.x))
	);
}

/**
 * Whether a run is upright and runs beside a box for more than a short way.
 * @param leg The run.
 * @param box The box.
 * @returns True when it does.
 */
function runsBeside(leg: Leg, box: Box): boolean {
	const { from, to } = leg;
	const along =
		Math.min(Math.max(from.y, to.y), box.y + box.height) - Math.max(Math.min(from.y, to.y), box.y);
	return Math.abs(from.x - to.x) < 0.5 && !between(from.x, box.x, box.x + box.width) && along > LAP;
}

/**
 * How many lines turn round the corner of a container they have no end in:
 * over or under it past one side, then down or up beside it for more than a
 * short way, or the other way round. A reader follows such a line round a
 * container it has nothing to do with, as round a block a line laps
 * ({@link lapsOf}).
 * @param lines Every line's corners.
 * @param frames The containers the block draws inline.
 * @returns The lines.
 */
function turnsRoundOf(lines: readonly (readonly Point[])[], frames: readonly FrameShape[]): number {
	return lines.filter((points) => {
		const legs = points.slice(1).map((to, index): Leg => ({ from: points[index]!, to }));
		return frames.some(
			({ box }) =>
				!within(points[0]!, box) &&
				!within(points.at(-1)!, box) &&
				legs.slice(1).some((leg, index) => {
					const before = legs[index]!;
					return (
						(passesBy(before, box) && runsBeside(leg, box)) ||
						(runsBeside(before, box) && passesBy(leg, box))
					);
				}),
		);
	}).length;
}

/**
 * What a block of cards laid out is weighed on, each line that laps round it
 * past every card it holds ({@link lapsOf}) or turns round a container it has
 * no end in ({@link turnsRoundOf}) counted as a crossing more. A label rides
 * its line, so it does not hide a lap.
 * @param laid The block laid out.
 * @returns What it is weighed on.
 */
function weighedLaid(laid: Laid): Weighed {
	const lines = [...laid.lines.values()].map((points) => corners(points));
	const cards = [...laid.boxes].filter(([id]) => !id.startsWith("label:")).map(([, box]) => box);
	const read = readingOf(laid, lines);
	const round = turnsRoundOf(lines, laid.frames ?? []);
	return { ...read, crossings: read.crossings + lapsOf(lines, cards) + round };
}

/**
 * What a whole drawing as placed is weighed on, its lines joined end to end
 * through every block, and their runs away from their ends.
 * @param placed The drawing.
 * @param projections Where each relationship is drawn, for its ends.
 * @returns What it is weighed on.
 */
function weighedPlaced(
	placed: Page,
	projections: readonly Pick<Projection, "edge">[],
): Weighed & { readonly away: number } {
	return {
		...readingOf(
			placed,
			placed.edges.map(({ points }) => points),
		),
		away: awayPlaced(projections, placed),
	};
}

export { weighedLaid, weighedPlaced, type Page };
