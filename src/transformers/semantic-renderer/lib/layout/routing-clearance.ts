import {
	APPROACH_STRAIGHT,
	BEND_RADIUS,
	ROUTE_OBSTACLE_CLEARANCE,
	ROUTE_OPEN_CORRIDOR,
} from "@/transformers/semantic-renderer/config";

/** Physical distance outside a semantic solid available to its final bend and arrow approach. */
export const CARD_ROUTE_CLEARANCE = Math.max(
	APPROACH_STRAIGHT + BEND_RADIUS,
	ROUTE_OBSTACLE_CLEARANCE,
);

/** Native solid expansion; an equal positive pin inset keeps the endpoint on its visible border. */
export const CARD_ROUTE_EXPANSION = CARD_ROUTE_CLEARANCE - ROUTE_OBSTACLE_CLEARANCE;

/** Two semantic solids need a positive open passage between their native buffers. */
export const CARD_ROUTING_GAP = 2 * CARD_ROUTE_CLEARANCE + ROUTE_OPEN_CORRIDOR;

/** A forced label is another native obstacle, whose buffer must clear the semantic solid's footprint. */
export const ANCHOR_CARD_CLEARANCE = CARD_ROUTE_CLEARANCE + ROUTE_OBSTACLE_CLEARANCE;
