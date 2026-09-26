// The straight channels two cards whose spans overlap can share: one pair of
// pins, one on each card's facing face, at a coordinate both spans reach.
import { ROUTE_NUDGE_DISTANCE } from "@/transformers/semantic-renderer/config";
import type { AlignedPin } from "@/transformers/semantic-renderer/lib/layout/avoid-pins";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";

const AXES = [
	["x", "width", "y", "height", "SOUTH", "NORTH"],
	["y", "height", "x", "width", "EAST", "WEST"],
] as const;

/**
 * Prefer the reserved label center for vertical channels when one is supplied.
 * @param one Source card bounds.
 * @param two Target card bounds.
 * @param axis Shared span axis.
 * @param extent Dimension along that axis.
 * @param anchor Optional label center.
 * @returns Preferred global channel coordinate.
 */
function preferredCoordinate(
	one: Box,
	two: Box,
	axis: "x" | "y",
	extent: "width" | "height",
	anchor?: number,
): number {
	if (axis === "x" && anchor !== undefined) return anchor;
	return (one[axis] + one[extent] / 2 + two[axis] + two[extent] / 2) / 2;
}

/**
 * Candidate straight channels through two overlapping endpoint spans.
 * @param one Source card bounds.
 * @param two Target card bounds.
 * @param anchor Optional reserved-label center on the horizontal axis.
 * @returns One ordered group of source and target pins per available axis.
 */
export function candidates(one: Box, two: Box, anchor?: number): [AlignedPin, AlignedPin][][] {
	const result: [AlignedPin, AlignedPin][][] = [];
	for (const [axis, extent, cross, crossExtent, forward, reverse] of AXES) {
		const low = Math.max(one[axis], two[axis]) + ROUTE_NUDGE_DISTANCE;
		const high = Math.min(one[axis] + one[extent], two[axis] + two[extent]) - ROUTE_NUDGE_DISTANCE;
		if (low > high) continue;
		if (
			Math.max(one[cross], two[cross]) <
			Math.min(one[cross] + one[crossExtent], two[cross] + two[crossExtent])
		)
			continue;
		const faces =
			one[cross] < two[cross] ? ([forward, reverse] as const) : ([reverse, forward] as const);
		/**
		 * Keep the card center inside the common available span.
		 * @param coordinate Unclamped card center.
		 * @returns A point in the usable span.
		 */
		const clamp = (coordinate: number): number => Math.max(low, Math.min(high, coordinate));
		const balanced = clamp(preferredCoordinate(one, two, axis, extent, anchor));
		const coordinates = [
			...new Set([
				balanced,
				(low + high) / 2,
				clamp(one[axis] + one[extent] / 2),
				clamp(two[axis] + two[extent] / 2),
			]),
		].toSorted((a, b) => Math.abs(a - balanced) - Math.abs(b - balanced) || a - b);
		const pair: [AlignedPin, AlignedPin][] = [];
		for (const coordinate of coordinates)
			pair.push([
				{ face: faces[0], position: (coordinate - one[axis]) / one[extent] },
				{ face: faces[1], position: (coordinate - two[axis]) / two[extent] },
			]);
		result.push(pair);
	}
	return result;
}
