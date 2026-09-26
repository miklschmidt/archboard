// The stretches of a block of blocks' top or bottom edge a trunk inside can
// reach a port on straight: clear of the blocks packed against that edge. A
// port under such a block is reached only round it, along the edge.
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";

/** A stretch of an edge: its lowest and highest x. */
type Span = readonly [number, number];

/**
 * The stretches of an edge no blocked stretch covers.
 * @param edge The edge.
 * @param blocked The blocked stretches.
 * @returns The free ones, left to right.
 */
function freeOf(edge: Span, blocked: readonly Span[]): Span[] {
	const free: Span[] = [];
	let from = edge[0];
	for (const [low, high] of blocked.toSorted((one, other) => one[0] - other[0])) {
		if (low > from) free.push([from, Math.min(low, edge[1])]);
		from = Math.max(from, high);
	}
	if (from < edge[1]) free.push([from, edge[1]]);
	return free;
}

/**
 * How far an x stands outside a span.
 * @param span The span.
 * @param x The x.
 * @returns The distance, zero inside it.
 */
function apart(span: Span, x: number): number {
	return Math.max(span[0] - x, x - span[1], 0);
}

/**
 * The free stretch of an edge nearest an x, clear of some boxes by a margin.
 * @param edge The edge.
 * @param boxes The boxes standing against it.
 * @param margin How far a port keeps from each box's sides.
 * @param x Where the port wants to stand.
 * @returns The stretch, or the whole edge when the boxes cover it.
 */
function openStretch(edge: Span, boxes: readonly Box[], margin: number, x: number): Span {
	const blocked = boxes.map((box): Span => [box.x - margin, box.x + box.width + margin]);
	const free = freeOf(edge, blocked).toSorted((one, other) => apart(one, x) - apart(other, x));
	return free[0] ?? edge;
}

export { openStretch, type Span };
