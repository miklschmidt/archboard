import {
	APPROACH_STRAIGHT,
	BEND_RADIUS,
	LABEL_ROUTE_CLEARANCE,
	ROUTE_OBSTACLE_CLEARANCE,
	ROUTE_OPEN_CORRIDOR,
} from "@/transformers/semantic-renderer/config";
import type { RouteRequest } from "@/transformers/semantic-renderer/lib/layout/route-requests";

/** Physical distance outside a semantic solid available to its final bend and arrow approach. */
export const CARD_ROUTE_CLEARANCE = Math.max(
	APPROACH_STRAIGHT + BEND_RADIUS,
	ROUTE_OBSTACLE_CLEARANCE,
);

/** Native solid expansion; an equal positive pin inset keeps the endpoint on its visible border. */
export const CARD_ROUTE_EXPANSION = CARD_ROUTE_CLEARANCE - ROUTE_OBSTACLE_CLEARANCE;

/** Two semantic solids need a positive open passage between their native buffers. */
export const CARD_ROUTING_GAP = 2 * CARD_ROUTE_CLEARANCE + ROUTE_OPEN_CORRIDOR;

/**
 * Native label expansion: a line keeps the same distance from a reserved
 * label as from a label placed on its own run, not the router's shorter
 * buffer, when the routes ask for it (finishing.ts).
 */
export const LABEL_ROUTE_EXPANSION = LABEL_ROUTE_CLEARANCE - ROUTE_OBSTACLE_CLEARANCE;

/**
 * How far a forced label is anchored from a card: it is another native
 * obstacle, whose own clearance must clear the card's footprint.
 * @param route What the routes ask for (route-requests.ts); the full label clearance when it says so.
 * @returns The distance.
 */
export function anchorClearance(route: Pick<RouteRequest, "labelClearance"> = {}): number {
	return (
		CARD_ROUTE_CLEARANCE +
		(route.labelClearance === true ? LABEL_ROUTE_CLEARANCE : ROUTE_OBSTACLE_CLEARANCE)
	);
}

/**
 * The pitch of neighbouring parallel lines: one lane, the width a reader needs
 * to follow each line and the hops of one line need to clear the other.
 */
export const ROUTE_LANE = 16;

/** How far a line keeps off a frame wall, so the wall never takes the line's colour. */
export const WALL_CLEARANCE = ROUTE_LANE / 2;
