// Layout primitives shared by the read-back paths.
//
// A user moving a box is a statement about the design (AGENTS.md), so
// every surface that reads a board back has to be able to say something about
// where things sit. The two things worth saying are the same everywhere:
// **what is near what** (proximity clustering) and **whereabouts on the board**
// (a coarse region name). Both are relative — they survive the board being
// panned, zoomed, or tidied wholesale — which is exactly why they are the ones
// worth reporting and raw coordinates are not.
//
// Extracted here because `describe` and `compare` must agree: a cluster the
// read-back names has to be the same cluster the diff says was split.

import { extentOf, type Measurable } from "@/runtime/engine/geometry";

/** A rectangle of board, as everything in this file speaks about one. */
interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * The stretch of board one element occupies.
 *
 * The one way to turn an element into a Box, because the obvious way is wrong
 * for arrows: an arrow's stored `x, y` is its first point, not its top-left,
 * and an arrow that runs leftwards or upwards is nowhere inside
 * `x .. x + width`. Everything in this file is fed boxes, so a reader that
 * builds one directly from those fields puts arrows in the wrong cluster, the
 * wrong region and outside the frame — and those signals are what an agent
 * narrates back when a user rearranges the board (TASK-038). `geometry.ts`
 * does the measuring; this is the adapter into Box's vocabulary.
 * @param element The element, or nothing.
 * @returns Its box.
 */
function boxOf(element: Measurable | null | undefined): Box {
	const extent = extentOf(element);
	return { x: extent.x, y: extent.y, w: extent.width, h: extent.height };
}

/** The extent of a set of boxes, in the coordinates they were drawn in. */
interface BoundingBox {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

// How close two shapes have to be before a human would call them "together".
// Roughly one box-width of whitespace: closer than this and the gap reads as
// layout, wider and it reads as separation.
const CLUSTER_GAP = 160;

/**
 * The boxes a human would call groups, largest group first.
 *
 * Connected components under "within `gap` of each other". Union-find rather
 * than a distance matrix, so a chain of near-neighbours reads as one cluster,
 * which is how a human sees a row of boxes.
 * @param items The boxes to group.
 * @param gap How much whitespace still reads as togetherness.
 * @returns The groups.
 */
function clusterBoxes<T extends Box>(items: T[], gap = CLUSTER_GAP): T[][] {
	const parent = items.map((_, i) => i);
	/**
	 * The representative of one box's group, flattening the chain on the way.
	 * @param i Which box.
	 * @returns The group's index.
	 */
	const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
	/**
	 * Whether two boxes are close enough to read as one group.
	 * @param a One box.
	 * @param b The other.
	 * @returns True when they are within `gap` on both axes.
	 */
	const near = (a: T, b: T): boolean =>
		a.x - gap < b.x + b.w &&
		b.x - gap < a.x + a.w &&
		a.y - gap < b.y + b.h &&
		b.y - gap < a.y + a.h;
	for (let i = 0; i < items.length; i++) {
		for (let j = i + 1; j < items.length; j++) {
			if (near(items[i]!, items[j]!)) {
				parent[find(j)] = find(i);
			}
		}
	}
	const groups = new Map<number, T[]>();
	items.forEach((item, i) => {
		const root = find(i);
		if (!groups.has(root)) {
			groups.set(root, []);
		}
		groups.get(root)!.push(item);
	});
	return [...groups.values()].toSorted((a, b) => b.length - a.length);
}

/**
 * The box round a set of boxes.
 * @param boxes The boxes.
 * @returns Their extent, or null for an empty set — the only honest answer,
 * because a frame drawn round nothing has no thirds.
 */
function boundingBoxOf(boxes: Box[]): BoundingBox | null {
	if (boxes.length === 0) {
		return null;
	}
	return {
		minX: Math.min(...boxes.map((b) => b.x)),
		minY: Math.min(...boxes.map((b) => b.y)),
		maxX: Math.max(...boxes.map((b) => b.x + b.w)),
		maxY: Math.max(...boxes.map((b) => b.y + b.h)),
	};
}

/**
 * Whether a shape's centre stayed put.
 *
 * `regionName` reads the centre and nothing else, so an unchanged centre is a
 * proof: whatever new region name the shape has been assigned, it came from
 * the frame moving and not from the shape. Absolute, and therefore only ever
 * true when the two sides share a coordinate system — which is the case it is
 * for.
 * @param a The box before.
 * @param b The box after.
 * @param tolerance How far the centre may drift and still count as still.
 * @returns True when it did not move.
 */
function sameCentre(a: Box, b: Box, tolerance = 1): boolean {
	return (
		Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) <= tolerance &&
		Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) <= tolerance
	);
}

/**
 * Which third of a span a coordinate falls in.
 *
 * A span too small to divide is all middle: thirds of nothing would put shapes
 * in "left" and "right" on the strength of a pixel.
 * @param v The coordinate.
 * @param lo The span's start.
 * @param hi The span's end.
 * @returns 0, 1 or 2.
 */
const third = (v: number, lo: number, hi: number): number => {
	if (hi - lo < 1) {
		return 1;
	}
	const t = (v - lo) / (hi - lo);
	return t < 0.34 ? 0 : t < 0.67 ? 1 : 2;
};

/**
 * Whereabouts on the board, as a human would point: thirds of the bounding box
 * in each axis.
 *
 * Relative to the box rather than to the canvas origin, so the name means the
 * same thing on a board that was drawn at (0,0) and one drawn three screens to
 * the right.
 *
 * The frame is a choice, and it matters: whatever the box is drawn round moves
 * every name inside it. `compare` therefore draws it round the nodes both
 * boards have, not round everything on each board, so that arriving and
 * departing nodes cannot rename their neighbours' whereabouts.
 * @param cx The centre's x.
 * @param cy The centre's y.
 * @param box The frame the thirds are of.
 * @returns The region's name.
 */
function regionName(cx: number, cy: number, box: BoundingBox): string {
	const rows = ["top", "middle", "bottom"];
	const cols = ["left", "centre", "right"];
	const r = third(cy, box.minY, box.maxY);
	const c = third(cx, box.minX, box.maxX);
	if (r === 1 && c === 1) {
		return "centre";
	}
	return `${rows[r]}-${cols[c]}`;
}

export {
	type Box,
	boxOf,
	type BoundingBox,
	CLUSTER_GAP,
	clusterBoxes,
	boundingBoxOf,
	sameCentre,
	regionName,
};
