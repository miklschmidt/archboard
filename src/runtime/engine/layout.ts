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

import { extentOf, type Measurable } from "./geometry.js";

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

// The one way to turn an element into a Box, because the obvious way is wrong
// for arrows: an arrow's stored `x, y` is its first point, not its top-left,
// and an arrow that runs leftwards or upwards is nowhere inside
// `x .. x + width`. Everything in this file is fed boxes, so a reader that
// builds one directly from those fields puts arrows in the wrong cluster, the
// wrong region and outside the frame — and those signals are what an agent narrates back when a
// user rearranges the board (TASK-038). `geometry.ts` does the measuring;
// this is the adapter into Box's vocabulary.
export function boxOf(element: Measurable | null | undefined): Box {
	const extent = extentOf(element);
	return { x: extent.x, y: extent.y, w: extent.width, h: extent.height };
}

export interface BoundingBox {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

// How close two shapes have to be before a human would call them "together".
// Roughly one box-width of whitespace: closer than this and the gap reads as
// layout, wider and it reads as separation.
export const CLUSTER_GAP = 160;

// Connected components under "within CLUSTER_GAP of each other", largest first.
// Union-find rather than a distance matrix so a chain of near-neighbours reads
// as one cluster, which is how a human sees a row of boxes.
export function clusterBoxes<T extends Box>(items: T[], gap = CLUSTER_GAP): T[][] {
	const parent = items.map((_, i) => i);
	const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
	const near = (a: T, b: T) =>
		a.x - gap < b.x + b.w &&
		b.x - gap < a.x + a.w &&
		a.y - gap < b.y + b.h &&
		b.y - gap < a.y + a.h;
	for (let i = 0; i < items.length; i++) {
		for (let j = i + 1; j < items.length; j++) {
			if (near(items[i]!, items[j]!)) parent[find(j)] = find(i);
		}
	}
	const groups = new Map<number, T[]>();
	items.forEach((item, i) => {
		const root = find(i);
		if (!groups.has(root)) groups.set(root, []);
		groups.get(root)!.push(item);
	});
	return [...groups.values()].toSorted((a, b) => b.length - a.length);
}

// The box round a set of boxes. Null for an empty set, which is the only
// honest answer: a frame drawn round nothing has no thirds.
export function boundingBoxOf(boxes: Box[]): BoundingBox | null {
	if (boxes.length === 0) return null;
	return {
		minX: Math.min(...boxes.map((b) => b.x)),
		minY: Math.min(...boxes.map((b) => b.y)),
		maxX: Math.max(...boxes.map((b) => b.x + b.w)),
		maxY: Math.max(...boxes.map((b) => b.y + b.h)),
	};
}

// Did this shape's centre stay put? `regionName` reads the centre and nothing
// else, so an unchanged centre is a proof: whatever new region name the shape
// has been assigned, it came from the frame moving and not from the shape.
// Absolute, and therefore only ever true when the two sides share a coordinate
// system — which is the case it is for.
export function sameCentre(a: Box, b: Box, tolerance = 1): boolean {
	return (
		Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) <= tolerance &&
		Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) <= tolerance
	);
}

// Whereabouts on the board, as a human would point: thirds of the bounding box
// in each axis. Relative to the box rather than to the canvas origin, so the
// name means the same thing on a board that was drawn at (0,0) and one drawn
// three screens to the right.
//
// The frame is a choice, and it matters: whatever the box is drawn round moves
// every name inside it. `compare` therefore draws it round the nodes both
// boards have, not round everything on each board, so that arriving and
// departing nodes cannot rename their neighbours' whereabouts.
const third = (v: number, lo: number, hi: number): number => {
	if (hi - lo < 1) return 1;
	const t = (v - lo) / (hi - lo);
	return t < 0.34 ? 0 : t < 0.67 ? 1 : 2;
};

export function regionName(cx: number, cy: number, box: BoundingBox): string {
	const rows = ["top", "middle", "bottom"];
	const cols = ["left", "centre", "right"];
	const r = third(cy, box.minY, box.maxY);
	const c = third(cx, box.minX, box.maxX);
	if (r === 1 && c === 1) return "centre";
	return `${rows[r]}-${cols[c]}`;
}
