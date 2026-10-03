// How long the voice in the agent dock takes to move: the Talk key turning into
// the voice circle, the circle lighting, and the light following the model's
// speech.
//
// A person watches every one of these and nobody waits one out, so what they
// pull against is attention and the ear. Too slow and the circle lags what the
// model says. Too fast and the light flickers on every breath. The follow times
// are the ones a ridge of light needs to read as a voice, not as a meter.

/**
 * How long the Talk key takes to become the voice circle, and the circle to
 * become the key again.
 *
 * The dock grows or shrinks with it, and so does the list above it, on every
 * frame. Pulls against the press that started it: past about half a second a
 * person waits for the circle instead of watching it arrive. The circle's own
 * lighting starts while the key is still moving, so this is not also the time
 * until the voice is lit.
 */
const VOICE_MORPH_MS = 520;

/**
 * How long the circle takes to light once voice starts: the ring draws itself
 * and then the lines rise. It is the time a critically damped spring takes to
 * settle, so it starts and ends without a kink.
 *
 * Pulls against how long connecting takes. The circle should be lit about when
 * the voice is, and should not still be rising a second after the model speaks.
 */
const VOICE_IGNITE_MS = 1100;

/**
 * How long the circle takes to go dark when voice ends. Shorter than lighting it
 * because the dock is already giving the room back, and a light that outlives
 * its key reads as stuck.
 */
const VOICE_EXTINGUISH_MS = 420;

/**
 * How long the circle takes to dim for a mute, and to swap the ring's steady
 * light for the travelling spark of connecting. Pulls against a click: a mute
 * must read as an answer to it, so it cannot be slower than the press that
 * caused it.
 */
const VOICE_HUSH_MS = 360;

/**
 * How fast the light rises when the model's output does: the time constant of
 * the level's follower, going up. Short, so that the first syllable shows in
 * the same moment it is heard. Pulls against flicker: shorter than a frame or
 * two follows noise in the level, not speech.
 */
const VOICE_ATTACK_MS = 38;

/**
 * How fast the light falls when the output does: the follower's time constant,
 * going down. Long enough to bridge the gaps between syllables, so a word is one
 * swell and not a row of flashes. Pulls against the next word: much longer and
 * the lines are still up when the model has stopped.
 */
const VOICE_RELEASE_MS = 230;

/**
 * The time constant of the slow swell that follows the light: the long, rolling
 * shape of a sentence under the quick shape of its syllables.
 */
const VOICE_SWELL_MS = 380;

/**
 * How long the bite of a hard onset (a consonant, a word that starts loud) stays
 * in the lines before it dies away. It makes the lines sharper while it lasts.
 */
const VOICE_SPARK_MS = 150;

/**
 * How much older each line of the sheet reads than the line in front of it, so
 * a loud moment rolls back through the sheet. Eleven lines read about 0.64 s of
 * the past between the front one and the back one. Pulls against the syllables
 * themselves: a step much longer than a syllable makes the lines separate
 * pictures, and one much shorter makes them copies of each other.
 */
const VOICE_ROW_STEP_MS = 64;

/**
 * How far back one line reads, from its middle to its edge. The middle of a line
 * is now and its edges are the past, so a syllable spreads out from the middle as
 * it ages. About a second holds a few syllables across the width of the circle.
 * Pulls against what the eye can follow at 64px: shorter and a line shows one
 * bump, longer and it shows a texture.
 */
const VOICE_TRACE_MS = 1000;

/**
 * How often the level is taken for the lines to read back. Fine enough that a
 * syllable of about a tenth of a second has several samples, and coarse enough
 * that a second of the past fits in a few dozen numbers.
 */
const VOICE_TRACE_STEP_MS = 24;

/**
 * How fast the level the lines are drawn from falls after a syllable. Much
 * shorter than the release of the light above, so that the gap between two
 * syllables shows in a line as a dip and a word does not run into one swell.
 */
const VOICE_SYLLABLE_MS = 110;

/**
 * How long a ring of light takes to leave the circle and fade, once the voice
 * speaks a loud onset. Pulls against the dock's other text: the ring ends before
 * it has crossed the room the circle is given.
 */
const VOICE_PULSE_MS = 1000;

/**
 * How long a ring of light waits before another may leave. Without it a loud,
 * ragged level would throw a ring every frame and the dock would shimmer.
 */
const VOICE_PULSE_REST_MS = 340;

/**
 * How long the ring's gold sheen takes to turn once around at rest. Slow enough
 * to read as metal catching the light and not as a spinner. The voice speeds it
 * up, but never to the pace of the spark below.
 */
const VOICE_RING_TURN_MS = 24_000;

/**
 * How long the spark that circles the ring while the voice is connecting takes
 * for one lap. Pulls against the sheen above: the spark must read as waiting,
 * which the sheen must not.
 */
const VOICE_COMET_MS = 1300;

/**
 * How long one breath of the lines takes while the voice listens. The lines lift
 * and settle a hair, so the circle reads as awake and not as a still picture.
 */
const VOICE_BREATH_MS = 3800;

export {
	VOICE_ATTACK_MS,
	VOICE_BREATH_MS,
	VOICE_COMET_MS,
	VOICE_EXTINGUISH_MS,
	VOICE_HUSH_MS,
	VOICE_IGNITE_MS,
	VOICE_MORPH_MS,
	VOICE_PULSE_MS,
	VOICE_PULSE_REST_MS,
	VOICE_RELEASE_MS,
	VOICE_RING_TURN_MS,
	VOICE_ROW_STEP_MS,
	VOICE_SPARK_MS,
	VOICE_SWELL_MS,
	VOICE_SYLLABLE_MS,
	VOICE_TRACE_MS,
	VOICE_TRACE_STEP_MS,
};
