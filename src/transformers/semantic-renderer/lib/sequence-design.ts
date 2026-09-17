import type { Weight } from "@/transformers/semantic-renderer/lib/svg/styles";

// Sequence-diagram measurements, used by the data-flow renderer.
// Participants occupy columns; their dashed vertical lifelines show progression
// down the sequence. Messages are interaction arrows between participants, and
// activation bars mark intervals when a participant is active.
// Shared card, label, margin and typography measurements live in `lib/design.ts`.

/**
 * Bounds for the uniform participant-column width. The maximum prevents one
 * long name from widening every column; longer names use normal card text fitting.
 */
const COLUMN_MIN_WIDTH = 112;
const COLUMN_MAX_WIDTH = 192;

/**
 * Space between participant columns: a visible seam and no more. A message's
 * label sits above its arrow and spans the lifelines it joins, so the gap
 * carries no words; ten participants at the old 78 ran a request across a
 * page four times wider than it was tall.
 */
const COLUMN_GAP = 16;

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

/** Dash pattern for the vertical participant lifelines. */
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
 * Gap between an interaction label and its arrow. Sequence labels sit above
 * horizontal arrows to keep their direction visible.
 */
const MESSAGE_LABEL_GAP = 5;
/** How far a self-message's label stands off the loop it names. */
const SELF_LABEL_GAP = 8;

/**
 * A step's note: a caveat drawn under the message it qualifies, in the card
 * note's face, on a plate of the frame's own ground so a lifeline it crosses
 * passes behind the words without drawing a box around them. It wraps to the
 * hop it annotates, never narrower than a readable measure and never wider
 * than a comfortable line, and the message's row grows to hold it, so the next
 * message never lands on it.
 */
const STEP_NOTE_GAP = 4;
const STEP_NOTE_INSET = 8;
const STEP_NOTE_PADDING_X = 4;
const STEP_NOTE_PADDING_Y = 2;
const STEP_NOTE_MIN_WIDTH = 180;
const STEP_NOTE_MAX_WIDTH = 320;

/**
 * Maximum animated dots per repeated step, keeping them countable and preventing
 * a high repetition count from delaying the rest of the sequence.
 */
const MAX_PULSES_PER_STEP = 3;

/**
 * Uniform interaction-line weight; flow steps do not carry individual emphasis.
 */
const STEP_WEIGHT: Weight = "normal";

export {
	STEP_WEIGHT,
	MAX_PULSES_PER_STEP,
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
	STEP_NOTE_GAP,
	STEP_NOTE_INSET,
	STEP_NOTE_PADDING_X,
	STEP_NOTE_PADDING_Y,
	STEP_NOTE_MIN_WIDTH,
	STEP_NOTE_MAX_WIDTH,
};
