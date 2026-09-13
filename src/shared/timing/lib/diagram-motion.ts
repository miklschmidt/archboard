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

export { FLOW_CYCLE_CAP_MS, FLOW_PULSE_RAMP, FLOW_STEP_TRAVEL_MS };
