// The straight channels two cards whose spans overlap can share: one pair of
// pins, one on each card's facing face, at a coordinate both spans reach.
import { ROUTE_NUDGE_DISTANCE } from "@/transformers/semantic-renderer/config";
import type { AlignedPin } from "@/transformers/semantic-renderer/lib/layout/avoid-pins";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import { ROUTE_LANE } from "@/transformers/semantic-renderer/lib/layout/routing-clearance";

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
 * @param lanes Whether every lane of the shared span is a fallback ({@link laneSteps}).
 * @returns One ordered group of source and target pins per available axis.
 */
export function candidates(
	one: Box,
	two: Box,
	anchor?: number,
	lanes = false,
): [AlignedPin, AlignedPin][][] {
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
		const along = { axis, extent, low, high };
		result.push(
			channelCoordinates(one, two, along, anchor, lanes).map(
				(coordinate): [AlignedPin, AlignedPin] => [
					{ face: faces[0], position: (coordinate - one[axis]) / one[extent] },
					{ face: faces[1], position: (coordinate - two[axis]) / two[extent] },
				],
			),
		);
	}
	return result;
}

/**
 * The coordinates a straight channel is tried at, nearest the preferred one
 * first: the preferred one, the shared span's middle and each card's centre,
 * then, when asked, every other lane of the span ({@link laneSteps}).
 * @param one Source card bounds.
 * @param two Target card bounds.
 * @param along The axis the cards share a span on, and that span.
 * @param along.axis The coordinate along it.
 * @param along.extent The dimension along it.
 * @param along.low The span's start.
 * @param along.high The span's end.
 * @param anchor Optional reserved-label center on the horizontal axis.
 * @param lanes Whether every lane of the shared span is a fallback.
 * @returns The coordinates, in the order they are tried.
 */
function channelCoordinates(
	one: Box,
	two: Box,
	{
		axis,
		extent,
		low,
		high,
	}: {
		readonly axis: "x" | "y";
		readonly extent: "width" | "height";
		readonly low: number;
		readonly high: number;
	},
	anchor: number | undefined,
	lanes: boolean,
): number[] {
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
	if (!lanes) return coordinates;
	return [
		...coordinates,
		...laneSteps(balanced, low, high).filter((x) => !coordinates.includes(x)),
	];
}

/**
 * The rest of a shared span, tried only when every centred channel is
 * blocked: each lane from the preferred coordinate outwards, then the span's
 * two ends. Two cards with the same span and a third card over its middle
 * got no straight channel although a lane beside the third card was clear,
 * so the line hooked out of one card's side and into the other's (Agent
 * workbench's "Board changes reach the workhorse").
 * @param from The preferred coordinate inside the span.
 * @param low The span's start.
 * @param high The span's end.
 * @returns The coordinates, nearest the preferred one first.
 */
function laneSteps(from: number, low: number, high: number): number[] {
	const steps: number[] = [];
	for (let offset = ROUTE_LANE; from - offset >= low || from + offset <= high; offset += ROUTE_LANE)
		steps.push(...[from - offset, from + offset].filter((x) => x >= low && x <= high));
	return [...steps, low, high];
}
