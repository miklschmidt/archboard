import { BEND_RADIUS } from "#shared/constants/spacing.ts";
import type { MessageKind } from "@archboard/board/flow";
import { SHADOW_REACH } from "#shared/constants/design.ts";
import { headReach, type Head, type Weight } from "#shared/rules/render/marks.ts";

// Sequence-diagram measurements, used by the sequence renderer.
// Participants occupy columns; their dashed vertical lifelines show progression
// down the sequence. Messages are interaction arrows between participants, and
// activation bars mark intervals when a participant is active.
// Shared card, label, margin and typography measurements live in `shared/constants/design.ts`.

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

/** The card's full shadow reach, plus air for the selected lifeline's stroke. */
const LIFELINE_GAP = SHADOW_REACH + 1;
/** How far the first message sits below the lifeline of the tallest participant card. */
const FIRST_MESSAGE_DROP = 36;
/** The vertical step from one message to the next, and from one self-message. */
const MESSAGE_PITCH = 40;
const SELF_MESSAGE_PITCH = 58;
/** The run of empty lifeline under the last message, before the frame closes. */
const FLOW_BOTTOM_PADDING = 20;
/** The air between one flow's frame and the next. */
const FLOW_GAP = 32;

/**
 * How far above a flow's head of cards the frame's ground reaches while a
 * viewer has moved the head down to keep it in view: past the camera's margin
 * above the head at any readable magnification, so no lifeline or bar runs on
 * above it.
 */
const HEAD_REACH = 64;
/** Half the width of an activation bar, and how far it holds arrows off the lifeline. */
const ACTIVATION_HALF_WIDTH = 6;
/**
 * How far an activation bar runs past the call that starts it and the reply
 * that ends it: past its rounded corner and half an arrowhead (5.5 for a head
 * 11 long), so the arrow meets a straight side.
 */
const BAR_OVERHANG = 9;

/** How far right a self-message reaches, and how far it drops before turning back. */
const SELF_LOOP_REACH = 52;
const SELF_LOOP_DROP = 8;
const SELF_LOOP_CORNER = BEND_RADIUS;
/** How far below its own row a self-message loop reaches. */
const SELF_LOOP_EXTENT = SELF_LOOP_DROP + SELF_LOOP_CORNER * 2;

/**
 * Gap between an interaction label and its arrow. Sequence labels sit above
 * horizontal arrows to keep their direction visible. A wide label reaches over
 * the arrowhead, so the gap clears the half of the head that stands above its
 * line (5.5 for a head 11 long) with a little air.
 */
const MESSAGE_LABEL_GAP = 7;
/** How far a self-message's label stands off the loop it names. */
const SELF_LABEL_GAP = 8;
/** The step from one line of a wrapped message label to the next. */
const MESSAGE_LINE_STEP = 12;
/** How far a message's label keeps from the bars and lifelines either side of it. */
const LABEL_BAR_CLEARANCE = 4;

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
 * A decision's or loop's frame (`shared/rules/layout/sequence/frames.ts`): the air between a frame's
 * edge and the rows around it, the row its operator tab and words stand on,
 * the row an alternative's label stands on, the room between its sides and
 * the ink it holds, and the padding of the tab around its operator.
 */
const FRAME_GAP = 6;
const FRAME_HEAD_HEIGHT = 18;
const FRAME_GUARD_HEIGHT = 16;
const FRAME_PAD = 10;
const FRAME_TAB_PADDING = 6;

/**
 * Maximum pulses per repeated step, keeping them countable and preventing
 * a high repetition count from delaying the rest of the sequence.
 */
const MAX_PULSES_PER_STEP = 3;

/**
 * Uniform interaction-line weight; flow steps do not carry individual emphasis.
 */
const STEP_WEIGHT: Weight = "normal";

/**
 * The arrowhead each message kind ends in.
 *
 * A deliberate deviation from strict UML 2, which draws replies with an open head
 * as well, inherited from PR Lens with its reasoning intact: here the open head is
 * the exclusive mark of "nobody is waiting on this". The dash already says "this
 * is an answer", so an open-headed reply would put the asynchronous signature on
 * every reply and dilute the one distinction the head shape exists to draw.
 */
const STEP_HEAD: Readonly<Record<MessageKind, Head>> = {
	sync: "filled",
	async: "open",
	return: "filled",
	self: "filled",
};

/**
 * How far short of the bar or lifeline it arrives at a message's line stops:
 * exactly the reach of its head, so the tip touches what it points at.
 * @param kind What the message does.
 * @returns The distance.
 */
function arrowStandoff(kind: MessageKind): number {
	return headReach(STEP_HEAD[kind], STEP_WEIGHT);
}

export {
	MAX_PULSES_PER_STEP,
	COLUMN_MIN_WIDTH,
	COLUMN_MAX_WIDTH,
	COLUMN_GAP,
	LIFELINE_GAP,
	FIRST_MESSAGE_DROP,
	MESSAGE_PITCH,
	SELF_MESSAGE_PITCH,
	FLOW_BOTTOM_PADDING,
	FLOW_GAP,
	HEAD_REACH,
	ACTIVATION_HALF_WIDTH,
	BAR_OVERHANG,
	arrowStandoff,
	SELF_LOOP_REACH,
	SELF_LOOP_CORNER,
	SELF_LOOP_EXTENT,
	MESSAGE_LABEL_GAP,
	MESSAGE_LINE_STEP,
	LABEL_BAR_CLEARANCE,
	SELF_LABEL_GAP,
	STEP_NOTE_GAP,
	STEP_NOTE_INSET,
	STEP_NOTE_PADDING_X,
	STEP_NOTE_PADDING_Y,
	STEP_NOTE_MIN_WIDTH,
	STEP_NOTE_MAX_WIDTH,
	FRAME_GAP,
	FRAME_HEAD_HEIGHT,
	FRAME_GUARD_HEIGHT,
	FRAME_PAD,
	FRAME_TAB_PADDING,
};
