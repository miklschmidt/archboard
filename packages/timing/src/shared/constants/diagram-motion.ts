// How long a drawn diagram takes to tell an exchange.
//
// The only duration here a person watches rather than waits out, so what it
// pulls against is attention: too long and a reader who looked away never sees
// the beginning come round again, so the page reads as stalled. A pulse flies at
// a speed (a distance a second), which is not a duration and lives with the
// renderer that draws it.

import { durations } from "#shared/constants/durations.ts";

/**
 * The longest a whole exchange's cycle may take before every pulse in it flies
 * faster to keep to it.
 *
 * Past this the exchange reads as stalled rather than slow, so a long one
 * compresses: every message still gets a turn, and the pulses fly faster
 * together. Pulls against the speed of one crossing, which is what says where
 * the message goes.
 */
const FLOW_CYCLE_CAP_MS = 16_000;

/** One picture of a board turning into the next, arriving, and leaving. */
const PICTURE_MS = durations({
	/**
	 * How long a pane takes to turn one picture of a board into the next one of
	 * the same board — another variant, or the same variant after an edit.
	 *
	 * Shared subjects glide from where they were to where they are; that is what
	 * lets a reader keep hold of which card became which. Pulls against attention
	 * two ways: shorter than about half a second and a move across a wide board
	 * reads as a jump with a smear on it; longer than about three quarters and the
	 * board feels like it is waiting for the animation rather than the reader.
	 * Everything below is a fraction of this one number, so the whole choreography
	 * shortens or lengthens together.
	 */
	transition: 640,
	/**
	 * How long a pane takes to bring in a picture it has nothing to carry from:
	 * the first picture of a page, another board, another view of this one.
	 *
	 * The picture is built up the way it is read: frames, then cards in reading
	 * order, then the lines between cards already there, so the eye lands on the
	 * structure before the detail. Pulls against the wait itself: somebody who asked
	 * for a board wants to read it, so the whole entrance is barely longer than a
	 * transition, and a card is readable well before the last line is drawn.
	 */
	entry: 760,
	/**
	 * How long the picture a pane is leaving takes to go, when it goes to another
	 * board or view rather than turning into the next picture.
	 *
	 * Short on purpose: it is only there so the old picture is not snatched away,
	 * and it runs underneath the next picture's entrance.
	 */
	exit: 280,
});

/**
 * When, as fractions of `PICTURE_MS.transition`, each part of the change
 * happens. The order is the point: what is leaving goes first so that what is
 * moving has room, what is moving settles before what is arriving appears, and
 * the content of a card that changed swaps over while its frame is still in
 * flight, so the swap reads as part of the move rather than as a second event.
 */
const PICTURE_TRANSITION_PHASES = Object.freeze({
	/** Subjects only the old picture had are gone by here. */
	exitEnd: 0.35,
	/** Shared subjects begin to move here, and are in place by `moveEnd`. */
	moveStart: 0.06,
	moveEnd: 0.88,
	/**
	 * A changed card's old content and frame cross-fade into the new between
	 * these two: one window for both, so that at every moment the two add up
	 * to a whole card rather than dipping to a faint one halfway.
	 */
	fadeStart: 0.2,
	fadeEnd: 0.68,
	/**
	 * Inside that window, a card's changed content swaps in two halves: what
	 * leaves is gone by here, and what arrives begins here. One after the
	 * other, so a title is never seen twice at once.
	 */
	swapAt: 0.44,
	/** Subjects only the new picture has begin to appear here. */
	enterStart: 0.54,
	/** An arriving connection shows its arrowhead once this much of it is drawn. */
	arrowheadAt: 0.9,
	/**
	 * Every connection label only the new picture has arrives from here to the
	 * end, all together. Timed by its own line, labels came in scattered batches
	 * of every size and each one in a blink; together at the end they arrive as
	 * the last layer of the picture, once the lines they name are in place.
	 */
	labelsStart: 0.66,
});

/** When, as fractions of `PICTURE_MS.entry`, each part of a picture arrives. */
const PICTURE_ENTRY_PHASES = Object.freeze({
	/** Frames fade in over the first part. */
	framesEnd: 0.35,
	/** The first card in reading order begins here, and the last begins by `cardsStartBy`. */
	cardsStart: 0.04,
	cardsStartBy: 0.4,
	/** How long each card takes to arrive. */
	cardSpan: 0.42,
	/** The first line begins drawing here, and the last by `linesStartBy`. */
	linesStart: 0.34,
	linesStartBy: 0.62,
	/** How long each line takes to draw on. */
	lineSpan: 0.38,
	/**
	 * Every connection label only the new picture has arrives from here to the
	 * end, all together. Timed by its own line, labels came in scattered batches
	 * of every size and each one in a blink; together at the end they arrive as
	 * the last layer of the picture, once the lines they name are in place.
	 */
	labelsStart: 0.66,
});

/** A walkthrough presented step by step. */
const PRESENTATION_MS = durations({
	/**
	 * How long the camera takes to glide from one step of a presented walkthrough
	 * to the next, and the veil over what the step is not about takes to follow it.
	 *
	 * A step is a new sentence in a talk, not a jump cut, so the camera travels far
	 * enough to be followed: it pulls back, crosses, and settles on the step. Pulls
	 * against the talk itself: a glide much past a second is dead air between two
	 * sentences, and one shorter than half a second reads as a cut with a blur. A
	 * step that also changes the view the board is read through moves with the
	 * picture instead, on `PICTURE_MS.transition`, so the cards and the camera
	 * arrive together.
	 */
	step: 900,
	/**
	 * How long a presented walkthrough's box takes to arrive over the foot of the picture: it rises a
	 * few pixels and fades in, once, as the camera sets out for the first step.
	 *
	 * Pulls against two things. The box is what is read first, so it is in well before the camera's
	 * glide ends (`PRESENTATION_MS.step`), and it is there before the voice's orb, which flies into its
	 * foot, can land (`VOICE_MS.flight`). And it is the answer to the press that opened the
	 * walkthrough, so it cannot make a person wait: past a quarter of a second it is slower than the
	 * press.
	 */
	boxIn: 220,
	/**
	 * How long a presented walkthrough's box takes to hand one step to the next: the rail's gold
	 * travels to the new step, the step's number rolls, and the heading and the words slide out and
	 * in along the way the reader stepped, one after the other.
	 *
	 * Pulls against the camera's glide (`PRESENTATION_MS.step`, 900): the new words are to be readable
	 * well before the camera has settled, so this is the shorter. It also pulls against a reader who
	 * steps again at once: nothing waits for it, and a move turns round from where it is. Shorter than
	 * about 350ms the gold cannot be followed across the rail, and it is the eye that follows it.
	 */
	boxStep: 520,
});

/**
 * How long a picture takes to swap its cards drawn near (chip, name and
 * responsibility) for the cards seen from far away (a large tile, a larger name
 * and the start of the responsibility), and back. The chip moves and grows into
 * the tile and the words move between their places while they fade (TASK-428).
 * Both views fade over the whole of it, one in as the other goes out, so the
 * words never fade out together. The swap happens once the camera has come to
 * rest (TASK-405).
 *
 * Pulls against the eye that follows the chip. Shorter than about 200 ms the
 * chip jumps rather than travels, and the change of the words reads as a cut.
 * Longer than about 400 ms the reader, who has stopped zooming to read, waits
 * for the words to settle, and reads two sets of words through each other for
 * too long. It also pulls against the cost: every card's chip and words move in
 * the same frames.
 */
const FAR_VIEW_SWAP_MS = 280;

export {
	FLOW_CYCLE_CAP_MS,
	PICTURE_MS,
	PICTURE_TRANSITION_PHASES,
	PICTURE_ENTRY_PHASES,
	PRESENTATION_MS,
	FAR_VIEW_SWAP_MS,
};
