// Where an operation puts the elements it was aimed at.
//
// Alignment and distribution are stated about edges, and an arrow's `x` is not
// its left edge — it is wherever the arrow was started from, which for a
// leftward arrow is its right edge (geometry.ts). So a target is worked out in
// extent space and then applied as a translation of the stored origin, which
// moves a box and an arrow by the same rule.

import { extentOf } from "@/runtime/engine/geometry";
import type { ServerElement } from "@/runtime/engine/types";

type Alignment = "left" | "center" | "right" | "top" | "middle" | "bottom";
type Direction = "horizontal" | "vertical";

/** An element's box on the canvas, whatever its stored origin means. */
interface Extent {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** One element moved, as a write states it. */
type Move = Record<string, unknown> & { id: string; x?: number; y?: number };

/**
 * Every element's box, measured once so the arithmetic below never re-measures.
 * @param elements The elements.
 * @returns The boxes by element id.
 */
function extentsOf(elements: readonly ServerElement[]): Map<string, Extent> {
	return new Map(elements.map((el) => [el.id, extentOf(el)]));
}

/**
 * Where one edge of the aligned set sits.
 * @param boxes The elements' boxes.
 * @param elements The elements.
 * @param alignment Which edge or centre they align on.
 * @returns The coordinate every element is aligned to.
 */
function alignmentTarget(
	boxes: ReadonlyMap<string, Extent>,
	elements: readonly ServerElement[],
	alignment: Alignment,
): number {
	/**
	 * One element's box.
	 * @param el The element.
	 * @returns Its box, which was measured before this was called.
	 */
	const boxOf = (el: ServerElement): Extent => boxes.get(el.id)!;
	switch (alignment) {
		case "left":
			return Math.min(...elements.map((el) => boxOf(el).x));
		case "right":
			return Math.max(...elements.map((el) => boxOf(el).x + boxOf(el).width));
		case "top":
			return Math.min(...elements.map((el) => boxOf(el).y));
		case "bottom":
			return Math.max(...elements.map((el) => boxOf(el).y + boxOf(el).height));
		case "center":
			return mean(elements.map((el) => boxOf(el).x + boxOf(el).width / 2));
		default:
			return mean(elements.map((el) => boxOf(el).y + boxOf(el).height / 2));
	}
}

/**
 * The average of some numbers.
 * @param values The numbers.
 * @returns Their mean.
 */
function mean(values: readonly number[]): number {
	return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Where one element's box has to land for it to be aligned.
 * @param box The element's box.
 * @param alignment Which edge or centre it aligns on.
 * @param target Where that edge or centre sits.
 * @returns The box's new top-left, on the axis the alignment names.
 */
function alignedBoxOrigin(box: Extent, alignment: Alignment, target: number): Partial<Extent> {
	const inset = ALIGNMENT_INSET[alignment];
	const extent = HORIZONTAL_ALIGNMENTS.has(alignment) ? box.width : box.height;
	const wanted = target - extent * inset;
	return HORIZONTAL_ALIGNMENTS.has(alignment) ? { x: wanted } : { y: wanted };
}

// How much of the element sits before the edge it aligns on: none for the
// leading edges, all of it for the trailing ones, half for a centre.
const ALIGNMENT_INSET: Record<Alignment, number> = {
	left: 0,
	top: 0,
	right: 1,
	bottom: 1,
	center: 0.5,
	middle: 0.5,
};

const HORIZONTAL_ALIGNMENTS = new Set<Alignment>(["left", "right", "center"]);

/**
 * The moves that align a set of elements on one edge or centre.
 * @param elements The elements.
 * @param alignment Which edge or centre they align on.
 * @returns One move per element.
 */
function alignmentMoves(elements: readonly ServerElement[], alignment: Alignment): Move[] {
	const boxes = extentsOf(elements);
	const target = alignmentTarget(boxes, elements, alignment);
	return elements.map((el) => {
		const box = boxes.get(el.id)!;
		const wanted = alignedBoxOrigin(box, alignment, target);
		return {
			id: el.id,
			...(wanted.x === undefined ? {} : { x: el.x + (wanted.x - box.x) }),
			...(wanted.y === undefined ? {} : { y: el.y + (wanted.y - box.y) }),
		};
	});
}

/**
 * The moves that leave even gaps between a set of elements, along one axis.
 *
 * The span is measured from the first element the caller named to the last,
 * and each element in turn is placed one gap after the one before it.
 * @param elements The elements, in the order the caller named them.
 * @param direction Which axis to space them along.
 * @returns One move per element.
 */
function distributionMoves(elements: readonly ServerElement[], direction: Direction): Move[] {
	const boxes = extentsOf(elements);
	const horizontal = direction === "horizontal";
	const gap = evenGap(boxes, elements, horizontal);
	const moves: Move[] = [];
	let at = startOf(boxes.get(elements[0]!.id)!, horizontal);
	for (const el of elements) {
		const box = boxes.get(el.id)!;
		const moved = startOf(el, horizontal) + (at - startOf(box, horizontal));
		moves.push({ id: el.id, ...(horizontal ? { x: moved } : { y: moved }) });
		at += horizontal ? box.width : box.height;
		at += gap;
	}
	return moves;
}

/** Anything with a top-left corner: a box, or an element's own origin. */
type Placed = { x: number; y: number };

/**
 * Where something starts along the axis being distributed.
 * @param at The box or origin.
 * @param horizontal Whether the axis is horizontal.
 * @returns Its x or its y.
 */
function startOf(at: Placed, horizontal: boolean): number {
	return horizontal ? at.x : at.y;
}

/**
 * The gap that spaces the elements evenly between the two outermost ones.
 * @param boxes The elements' boxes.
 * @param ordered The elements, in the order they sit along the axis.
 * @param horizontal Whether the axis is horizontal.
 * @returns The gap, which is negative when they overlap.
 */
function evenGap(
	boxes: ReadonlyMap<string, Extent>,
	ordered: readonly ServerElement[],
	horizontal: boolean,
): number {
	const first = boxes.get(ordered[0]!.id)!;
	const last = boxes.get(ordered[ordered.length - 1]!.id)!;
	/**
	 * How far one box reaches along the axis being distributed.
	 * @param box The box.
	 * @returns Its width or its height.
	 */
	const extent = (box: Extent): number => (horizontal ? box.width : box.height);
	const start = horizontal ? first.x : first.y;
	const span = (horizontal ? last.x : last.y) + extent(last) - start;
	const occupied = ordered.reduce((sum, el) => sum + extent(boxes.get(el.id)!), 0);
	return (span - occupied) / (ordered.length - 1);
}

export { type Alignment, type Direction, type Move, alignmentMoves, distributionMoves };
