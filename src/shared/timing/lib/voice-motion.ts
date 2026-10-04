// How long the voice in the agent dock takes to move: the Talk key turning into
// the voice circle, the circle lighting, and the light following the model's
// speech. And how long the voice takes to move between the dock and the voice
// box over a pane's picture, and what the words in that box do as they come and
// go.
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

/**
 * How long the orb takes to fly between the dock's circle and the voice box over
 * a pane's picture, in either direction. It is the key's own morph and a little
 * more, so the orb lands in a circle that has just formed (or leaves one that is
 * about to become the key) and is the last thing to arrive, never the first.
 *
 * Pulls against the press that started it. The orb crosses up to a thousand
 * pixels, so a flight under about half a second is a jump and one over about
 * three quarters of a second is a wait. The easing is soft at both ends, because
 * the orb is the one lit thing on the page and a stop that is abrupt reads as a
 * collision.
 */
const VOICE_FLIGHT_MS = 680;

/**
 * How long the dock's circle takes to let go of its seat once the orb is not in it: the
 * seat is drawn only while the orb is there, and the orb has gone or is yet to come.
 * Pulls against the flight: it must be gone in a blink, or an empty circle is seen
 * waiting for an orb that is already in the air.
 */
const VOICE_SEAT_OUT_MS = 90;

/**
 * How long the voice box takes to arrive over the picture: its glass rises and
 * fades in while the orb is still on its way, so the socket is there to receive
 * it. Pulls against the flight: the box must be seen before the orb lands in it,
 * and it must not hide the picture for longer than the flight takes.
 */
const VOICE_BOX_IN_MS = 360;

/**
 * How long the voice box takes to leave. Shorter than arriving, as a menu is,
 * because it is going away from what the person is reading, and the orb that
 * left it is already on its way to the dock.
 */
const VOICE_BOX_OUT_MS = 240;

/**
 * How long each word of a subtitle takes to fade in. Words arrive about every
 * third of a second in speech, so a word that takes this long is still arriving
 * when the next one starts, and the end of the line is a soft edge, not a
 * blink. Its ease is slow to start and slow to arrive, so a word is half seen
 * about a third of the way through and fully seen near the end. Pulls against
 * the voice: much slower and the words lag what is said, much faster and they
 * are on screen before the eye has seen them come.
 */
const SUBTITLE_WORD_MS = 640;

/**
 * How long the lines of one cue take to fade out under the cue that replaces
 * them, so a full box is not cut to its first new word. Short, because the
 * words it holds have been read.
 */
const SUBTITLE_SWAP_MS = 260;

/**
 * How long a subtitle that has stopped growing takes to fade out once it has
 * lingered. Pulls against the linger before it: the words are going, and they
 * should leave as they came, quietly.
 */
const SUBTITLE_OUT_MS = 560;

/**
 * How long a subtitle that is fading out takes to come back to full, and the
 * voice's word to leave, when words arrive again. Pulls against the fade out
 * above: it must be much faster, or the words of a voice that has started to
 * speak again are dim, and the voice's word is still on screen under them.
 */
const SUBTITLE_BACK_MS = 120;

/**
 * How often a demonstration of the voice (`?voiceDemo`) is read, by the dock and by the voice box
 * alike, so that the two never disagree about the voice's stage. Often enough that a word arrives
 * when it is due, and no slower than a word of speech is long.
 */
const VOICE_DEMO_TICK_MS = 100;

/**
 * How long the voice's word ("Listening", "Muted") takes to fade in once the
 * words have gone from the box. It follows the words' own fade out, so the two
 * are never on screen together. Pulls against that wait: the box should not be
 * empty of both for longer than the fade itself.
 */
const VOICE_WORD_IN_MS = 300;

export {
	SUBTITLE_BACK_MS,
	SUBTITLE_OUT_MS,
	SUBTITLE_SWAP_MS,
	SUBTITLE_WORD_MS,
	VOICE_ATTACK_MS,
	VOICE_BOX_IN_MS,
	VOICE_BOX_OUT_MS,
	VOICE_BREATH_MS,
	VOICE_COMET_MS,
	VOICE_DEMO_TICK_MS,
	VOICE_EXTINGUISH_MS,
	VOICE_FLIGHT_MS,
	VOICE_HUSH_MS,
	VOICE_IGNITE_MS,
	VOICE_MORPH_MS,
	VOICE_PULSE_MS,
	VOICE_PULSE_REST_MS,
	VOICE_RELEASE_MS,
	VOICE_RING_TURN_MS,
	VOICE_ROW_STEP_MS,
	VOICE_SEAT_OUT_MS,
	VOICE_SPARK_MS,
	VOICE_SWELL_MS,
	VOICE_SYLLABLE_MS,
	VOICE_TRACE_MS,
	VOICE_TRACE_STEP_MS,
	VOICE_WORD_IN_MS,
};
