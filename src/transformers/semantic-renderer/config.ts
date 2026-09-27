// Renderer distances are diagram pixels, independent of camera zoom.
// Edit this file to tune spacing; rebuild the frontend, restart the server,
// and reload the viewer.
// Text sizes and visual styling remain in lib/design.ts.

/** Space around the final drawing. */
export const DIAGRAM_MARGIN = 20;
/** Extra space a planned board's page adds around the drawing to hold its frame. */
export const PLANNED_FRAME_MARGIN = 16;
/** Distance from the page edge to a planned board's dashed frame. */
export const PLANNED_FRAME_INSET = 8;
/** Equal space below a container title and at its sides/bottom. */
export const CONTAINER_INSET = 20;

/** Label-to-card whitespace. */
export const LABEL_CARD_CLEARANCE = 16;
/** Whitespace between separate label boxes. */
export const LABEL_LABEL_CLEARANCE = 24;
/** Whitespace between a label and an unrelated route. */
export const LABEL_ROUTE_CLEARANCE = 12;

/** Whitespace a line's ink keeps from a card it passes. */
export const ROUTE_OBSTACLE_CLEARANCE = 8;
/**
 * The pitch of neighbouring parallel lines: one lane, the width a reader needs
 * to follow each line and the hops of one line need to clear the other.
 */
export const ROUTE_LANE = 16;
/** Fixed radius of ordinary edge bends. Routing must provide enough room; this never shrinks. */
export const BEND_RADIUS = 8;
/** Required straight run after the final bend, for every arrow (largest marker reaches 9.735px). */
export const APPROACH_STRAIGHT = 12;
/** Crossing bridge size and clearance from surrounding ink. */
export const BRIDGE_RADIUS = 7;
export const BRIDGE_CLEARANCE = 3;
/** Reach of a self-returning curve. */
export const SELF_LOOP_REACH = 26;

// Sequence/flow spacing.
export const NEST_INSET = 18;
/** A flow's heads stand as far under its title row as its sides stand from them. */
export const HEADER_GAP = 18;
export const CONTAINER_TOP_PAD = 8;
export const CONTAINER_BOTTOM_PAD = 14;
export const CARD_PADDING_X = 13;

// Padding inside measured architecture cards and relationship labels.
export const ARCHITECTURE_CARD_PADDING = 16;
export const ARCHITECTURE_HEADER_PADDING = 20;
export const ARCHITECTURE_ICON_GAP = 12;
export const ARCHITECTURE_NOTE_GAP = 2;
export const ARCHITECTURE_LABEL_PADDING_X = 10;
export const ARCHITECTURE_LABEL_PADDING_Y = 8;
