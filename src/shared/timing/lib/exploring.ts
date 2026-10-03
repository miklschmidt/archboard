// How a board answers a hand: the motion a person feels while they poke at it,
// not the motion they wait out. What these pull against is the hand itself, so
// each is judged by how it feels under a wheel, a drag or a pointer at rest.

/** The durations of exploring a board, in milliseconds. */
const EXPLORING_MS = Object.freeze({
	/**
	 * How long the camera takes to cover most of the way to where a wheel, a
	 * pinch or a key asked it to go: it covers 63 percent of what is left in this
	 * time, and is within 5 percent of the end after three times it.
	 *
	 * Pulls against the hand. At 40 ms or less a wheel notch is a jump again; past
	 * about 120 ms the picture is seen to trail a pointer that has stopped moving.
	 * Because every input only moves where the camera is going, a hard flick of
	 * the wheel adds up and eases once, instead of stuttering notch by notch.
	 */
	cameraEase: 80,
	/**
	 * How long a thrown drag keeps its speed: it loses 63 percent of it in this
	 * time, so it travels about its release speed times this far in all.
	 *
	 * Pulls against precision. Past about half a second a flick overshoots the
	 * part the reader aimed at; at 150 ms or less a release looks like the
	 * picture stopped dead, which is the roughness this removes.
	 */
	cameraFling: 320,
	/**
	 * How long the camera glides to the whole board when the fit key is pressed.
	 * Shorter than a walkthrough step (`PRESENTATION_STEP_MS`) because the reader
	 * asked for it and is waiting; long enough that the path, which pulls back to
	 * cross a long distance, can be followed.
	 */
	cameraFit: 520,
});

export { EXPLORING_MS };
