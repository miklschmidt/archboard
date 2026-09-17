// How long a drawn diagram takes to say a line carries traffic.
//
// The only durations here a person watches rather than waits out, so what they
// pull against is attention: too fast reads as agitation and pulls the eye off
// what somebody was reading, too slow reads as a picture that has stopped.
// They come from the renderer this repository forked.

/**
 * How long one message of an exchange holds the shared cycle.
 *
 * Every message takes its turn on one clock, so the cycle is this times the
 * number of turns. Pulls against the cap below: a long exchange would otherwise
 * take a minute to come round.
 */
const FLOW_STEP_TRAVEL_MS = 1400;

/**
 * The longest a whole exchange's cycle may take before it stops growing.
 *
 * Past this the relay reads as stalled rather than slow, so a long flow
 * compresses: every message still gets a turn, and the turns get shorter.
 * Pulls against the legibility of one crossing.
 */
const FLOW_CYCLE_CAP_MS = 16_000;

/**
 * How much of a message's own turn is spent fading its dot in and out.
 *
 * A dot that appeared and vanished at full opacity would flash. Pulls against
 * the travel itself, which is what says where the message goes, so it is a
 * fraction of the turn rather than a fixed number of milliseconds.
 */
const FLOW_PULSE_RAMP = 0.08;

// ── One picture of a board turning into the next ─────────────────────────

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
const PICTURE_TRANSITION_MS = 640;

/**
 * When, as fractions of `PICTURE_TRANSITION_MS`, each part of the change
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
});

// ── A picture arriving with nothing to carry it from ──────────────────────

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
const PICTURE_ENTRY_MS = 760;

/** When, as fractions of `PICTURE_ENTRY_MS`, each part of a picture arrives. */
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
});

/**
 * How long the picture a pane is leaving takes to go, when it goes to another
 * board or view rather than turning into the next picture.
 *
 * Short on purpose: it is only there so the old picture is not snatched away,
 * and it runs underneath the next picture's entrance.
 */
const PICTURE_EXIT_MS = 280;

// ── A walkthrough, presented ──────────────────────────────────────────────

/**
 * How long the camera takes to glide from one step of a presented walkthrough
 * to the next, and the veil over what the step is not about takes to follow it.
 *
 * A step is a new sentence in a talk, not a jump cut, so the camera travels far
 * enough to be followed: it pulls back, crosses, and settles on the step. Pulls
 * against the talk itself: a glide much past a second is dead air between two
 * sentences, and one shorter than half a second reads as a cut with a blur. A
 * step that also changes the view the board is read through moves with the
 * picture instead, on `PICTURE_TRANSITION_MS`, so the cards and the camera
 * arrive together.
 */
const PRESENTATION_STEP_MS = 900;

export {
	FLOW_CYCLE_CAP_MS,
	FLOW_PULSE_RAMP,
	FLOW_STEP_TRAVEL_MS,
	PICTURE_ENTRY_MS,
	PICTURE_ENTRY_PHASES,
	PICTURE_EXIT_MS,
	PICTURE_TRANSITION_MS,
	PICTURE_TRANSITION_PHASES,
	PRESENTATION_STEP_MS,
};
