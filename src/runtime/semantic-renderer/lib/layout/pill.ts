// How big a label pill is.
//
// Its own module because two passes need the same answer: the port allocator,
// which has to keep two labelled runs far enough apart that neither pill lies
// across the other's line, and the label pass that draws them.

import {
	PILL_CLEARANCE,
	PILL_HEIGHT,
	PILL_PADDING_X,
	PILL_TEXT_SIZE,
} from "@/runtime/semantic-renderer/lib/design";
import { opposedSide, sideAxis } from "@/runtime/semantic-renderer/lib/geometry";
import type { Channel, Route } from "@/runtime/semantic-renderer/lib/layout/plan";
import { PILL_FONT } from "@/runtime/semantic-renderer/lib/fonts";
import { measure } from "@/runtime/semantic-renderer/lib/text";

/** How big a pill is. */
interface PillSize {
	/** Its width. */
	readonly width: number;
	/** Its height. */
	readonly height: number;
}

/**
 * The pill one label is drawn as. Measured in the mono face the pill is set in,
 * because a pill sized against another family is one its own text overflows.
 * @param label What the connection carries.
 * @returns The pill's size.
 */
function pillSize(label: string): PillSize {
	return {
		width: measure(label, PILL_FONT, PILL_TEXT_SIZE) + PILL_PADDING_X * 2,
		height: PILL_HEIGHT,
	};
}

/**
 * The gap a labelled route crosses straight through — one gap, opposed faces.
 * Its pill rides the crossing, so it stacks in that gap's depth and lies across
 * the face it left by; a pill on a run travelling *along* a gap does neither.
 * @param route The planned route.
 * @returns The gap it crosses, or undefined when it labels or crosses nothing.
 */
function crossedGap(route: Route): Channel | undefined {
	const only = route.channels.length === 1 ? route.channels[0] : undefined;
	if (route.edge.label === undefined || only === undefined) {
		return undefined;
	}
	return opposedSide(route.fromSide) === route.toSide ? only : undefined;
}

/**
 * How far this route's ports must stand from their neighbours on the same face.
 *
 * A pill is centred on its own run, so a neighbour closer than half the pill is
 * a line drawn under somebody else's words. Half of the pill measured along the
 * axis the ports spread on: its width on a top or bottom face, its height on a
 * left or right one, where the pill lies the other way round.
 * @param route The planned route.
 * @returns The pitch its face needs, or zero when its label asks for nothing.
 */
function pillReach(route: Route): number {
	const label = route.edge.label;
	if (label === undefined || crossedGap(route) === undefined) {
		return 0;
	}
	const size = pillSize(label);
	const across = sideAxis(route.fromSide) === "x" ? size.width : size.height;
	return across / 2 + PILL_CLEARANCE;
}

export { type PillSize, crossedGap, pillReach, pillSize };
