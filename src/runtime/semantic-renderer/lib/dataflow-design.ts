// The measurements of a message sequence.
//
// These belong with `lib/design.ts` in spirit — they are the same sort of thing,
// and the day somebody retunes the picture they will want both open. They are a
// file of their own because nothing outside the data-flow grammar reads one of
// them, so putting them in the shared design system would give every architecture
// change a file to merge for no benefit.
//
// Everything the two grammars share — the card, the label plate, the margins,
// the type sizes, the container header — stays in `lib/design.ts` and is imported
// from there. A number that appears in both files would be a second opinion about
// what a card is.

/**
 * How wide a participant column is, at its narrowest and at its widest.
 *
 * One width is shared by every column of every flow — see `layout/dataflow.ts` —
 * so the number has to hold the longest participant name anyone brought, within
 * reason. The ceiling is where that stops: past it a single long name would
 * widen twenty columns, and a name over budget steps down and is cut by the same
 * card rule every other card obeys.
 */
const COLUMN_MIN_WIDTH = 168;
const COLUMN_MAX_WIDTH = 288;

/**
 * The air between two columns. It is the room a message's label has before it
 * starts passing over its neighbours, so it is generous relative to the gap
 * between two cards in the architecture grammar.
 */
const COLUMN_GAP = 78;

/** The air between the bottom of a participant's card and the top of its lifeline. */
const LIFELINE_GAP = 6;
/** How far the first message sits below the top of the lifelines. */
const FIRST_MESSAGE_DROP = 36;
/** The vertical step from one message to the next, and from one self-message. */
const MESSAGE_PITCH = 40;
const SELF_MESSAGE_PITCH = 58;
/** The run of empty lifeline under the last message, before the frame closes. */
const FLOW_BOTTOM_PADDING = 20;
/** The air between one flow's frame and the next. */
const FLOW_GAP = 32;

/** A lifeline is time passing rather than a connection, so it is drawn as one. */
const LIFELINE_DASH = "3 5";

/** Half the width of an activation bar, and how far it holds arrows off the lifeline. */
const ACTIVATION_HALF_WIDTH = 6;
/** The room an arrowhead needs of its own, short of whatever it points at. */
const MARKER_INSET = 5;
/** The corner radius of an activation bar. */
const ACTIVATION_RADIUS = 3;

/** How far right a self-message reaches, and how far it drops before turning back. */
const SELF_LOOP_REACH = 52;
const SELF_LOOP_DROP = 8;
const SELF_LOOP_CORNER = 7;
/** How far below its own row a self-message loop reaches. */
const SELF_LOOP_EXTENT = SELF_LOOP_DROP + SELF_LOOP_CORNER * 2;

/**
 * The air under a message's label plate.
 *
 * The plate sits above its arrow rather than astride it, which is the one place
 * this grammar parts company with the architecture one. An architecture route
 * bends and doubles back, so the only reliably readable place for its words is
 * on top of it; a message is a straight horizontal run whose whole meaning is
 * which way it points, and a plate through the middle of one cuts the line in
 * two and puts the words a long way from the arrowhead.
 */
const MESSAGE_LABEL_GAP = 5;
/** How far a self-message's label stands off the loop it names. */
const SELF_LABEL_GAP = 8;

export {
	COLUMN_MIN_WIDTH,
	COLUMN_MAX_WIDTH,
	COLUMN_GAP,
	LIFELINE_GAP,
	LIFELINE_DASH,
	FIRST_MESSAGE_DROP,
	MESSAGE_PITCH,
	SELF_MESSAGE_PITCH,
	FLOW_BOTTOM_PADDING,
	FLOW_GAP,
	ACTIVATION_HALF_WIDTH,
	ACTIVATION_RADIUS,
	MARKER_INSET,
	SELF_LOOP_REACH,
	SELF_LOOP_DROP,
	SELF_LOOP_CORNER,
	SELF_LOOP_EXTENT,
	MESSAGE_LABEL_GAP,
	SELF_LABEL_GAP,
};
