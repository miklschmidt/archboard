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

export {
	FLOW_CYCLE_CAP_MS,
	FLOW_PULSE_RAMP,
	FLOW_STEP_TRAVEL_MS,
	PICTURE_TRANSITION_MS,
	PICTURE_TRANSITION_PHASES,
};
