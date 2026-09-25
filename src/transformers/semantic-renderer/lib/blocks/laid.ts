// What laying a block out answers, and the small geometry the block engine
// moves it with.
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";

/** One rank of a laid-out block: where it lies, and the block's items on it. */
interface Band {
	readonly top: number;
	readonly bottom: number;
	readonly items: readonly string[];
}

/** A block laid out: its size, and where its items, labels, ports and lines are inside it. */
interface Laid {
	readonly width: number;
	readonly height: number;
	/** Every item's, header's, port's and label's box, in the block's own coordinates. */
	readonly boxes: ReadonlyMap<string, Box>;
	/** Each line's points, by key, from its source end to its target end. */
	readonly lines: ReadonlyMap<string, Point[]>;
	/** Its ranks, top to bottom, when Graphviz ranked it. */
	readonly bands: readonly Band[];
}

/** The room a block keeps around what it holds. */
interface Insets {
	readonly side: number;
	readonly top: number;
	readonly bottom: number;
}

/** How close two coordinates are and still one. */
const SAME = 0.01;

/**
 * Points moved by an offset.
 * @param points The points.
 * @param by The offset.
 * @returns The moved points.
 */
function shifted(points: readonly Point[], by: Point): Point[] {
	return points.map(({ x, y }) => ({ x: x + by.x, y: y + by.y }));
}

/**
 * A box moved by an offset.
 * @param one The box.
 * @param by The offset.
 * @returns The moved box.
 */
function moved(one: Box, by: Point): Box {
	return { ...one, x: one.x + by.x, y: one.y + by.y };
}

/**
 * Whether three points lie on one horizontal or vertical line.
 * @param one The first.
 * @param two The second.
 * @param three The third.
 * @returns True when the middle one turns nothing.
 */
function straight(one: Point, two: Point, three: Point): boolean {
	const vertical = Math.abs(one.x - two.x) < SAME && Math.abs(two.x - three.x) < SAME;
	const horizontal = Math.abs(one.y - two.y) < SAME && Math.abs(two.y - three.y) < SAME;
	return vertical || horizontal;
}

/**
 * Points without repeats or points in the middle of a straight run.
 * @param points The points.
 * @returns The corners.
 */
function corners(points: readonly Point[]): Point[] {
	const kept: Point[] = [];
	for (const point of points) {
		const last = kept.at(-1);
		if (last !== undefined && Math.hypot(last.x - point.x, last.y - point.y) < SAME) continue;
		const before = kept.at(-2);
		if (before !== undefined && straight(before, last!, point)) kept.pop();
		kept.push(point);
	}
	return kept;
}

export { corners, moved, shifted, type Band, type Insets, type Laid };
