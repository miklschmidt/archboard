// Renderer distances are diagram pixels, independent of camera zoom.
// Edit this file to tune spacing; rebuild the frontend, restart the canvas,
// and reload the viewer.
// Text sizes and visual styling remain in lib/design.ts.

/** Space around the final drawing. */
export const DIAGRAM_MARGIN = 20;
/** Native placement coordinate margin, before final drawing bounds are measured. */
export const PLACEMENT_MARGIN = 24;
/** Equal space below a container title and at its sides/bottom. */
export const CONTAINER_INSET = 24;
/** Horizontal space between cards; also the gap in packed collections. */
export const CARD_GAP = 24;
/** Vertical space between ranks. Reserved labels add their measured height. */
export const RANK_GAP = 32;
/** Space between downward columns, including continuation routes and labels. */
export const COLUMN_GAP = 192;
/** Minimum relative fit improvement before adding another downward column. */
export const WRAP_MIN_FIT_GAIN = 0.05;

/** Label-to-card whitespace. */
export const LABEL_CARD_CLEARANCE = 16;
/** Whitespace between separate label boxes. */
export const LABEL_LABEL_CLEARANCE = 24;
/** Whitespace between a label and an unrelated route. */
export const LABEL_ROUTE_CLEARANCE = 12;

/** Native router buffer around obstacles. Increasing this can close tight passages. */
export const ROUTE_OBSTACLE_CLEARANCE = 8;
/** Native separation preference for neighboring route segments. */
export const ROUTE_NUDGE_DISTANCE = 12;
/** Native cost of adding a segment; larger values favor fewer bends. */
export const ROUTE_SEGMENT_PENALTY = 20;
/** Target corner radius; limited by available leg and label space. */
export const BEND_RADIUS_MAX = 14;
/** Bend space reserved together with the straight arrow approach. */
export const BEND_RADIUS_MIN = 8;
/** Hero arrow approach, scaled with rendered stroke width; exceeds its 9.735px marker reach. */
export const APPROACH_STRAIGHT = 12;
/** Crossing bridge size and clearance from surrounding ink. */
export const BRIDGE_RADIUS = 7;
export const BRIDGE_CLEARANCE = 3;
/** Reach of a self-returning curve. */
export const SELF_LOOP_REACH = 26;

// Sequence/flow spacing.
export const NEST_INSET = 18;
export const HEADER_GAP = 8;
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
