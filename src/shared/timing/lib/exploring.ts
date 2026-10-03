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
	/**
	 * How long the pointer rests on a part before the picture lights what it is
	 * wired to; once something is lit, the next part lights at once.
	 *
	 * Pulls against the pointer crossing the board: shorter than about 80 ms and
	 * the picture flashes at everything the pointer passes; longer than about
	 * 200 ms and resting on a part to ask what it touches feels ignored. It is
	 * well under a tip's delay (`SUBJECT_TIP_DELAY_MS`), so the light comes
	 * first and the tip, when it opens, finds the connections already lit.
	 */
	lightingDwell: 110,
	/**
	 * How long the light stays after the pointer leaves a part for the empty
	 * picture, so crossing the gap between two cards, or a line's thin width, does
	 * not put it out and light it again.
	 *
	 * Pulls against the pointer leaving for good: longer than about 300 ms and
	 * the picture seems to hold on to a part it was never asked about.
	 */
	lightingGrace: 160,
	/**
	 * How long what the picture does not light takes to recede, and to come back.
	 *
	 * Pulls against the pointer: shorter than about 100 ms and the picture
	 * flickers as the pointer crosses parts, longer than about 250 ms and a part
	 * seems to be lit after the pointer has moved on. Shorter than a presented
	 * step's veil (`PRESENTATION_STEP_MS`) because a poke is asked of the picture
	 * by a hand that is waiting for the answer.
	 */
	lightingFade: 160,
	/**
	 * The shortest and the longest a relationship takes to be drawn on when it
	 * lights; between them a line takes as long as its length asks for.
	 *
	 * Pulls against the line it rides: a short line drawn in less than about
	 * 180 ms is a flash, not a direction, and a long one drawn in more than
	 * about half a second makes the answer to a poke wait for its slowest line.
	 */
	sweepShortest: 180,
	sweepLongest: 520,
	/**
	 * How long each further hop of a trace waits for the one before it, so that
	 * what a part reaches lights outward from it, nearest first.
	 *
	 * Pulls against the trace: shorter than about 60 ms and the hops land as one
	 * flash and say nothing of how far each is; longer than about 160 ms and a
	 * trace of five hops makes the reader wait most of a second for its answer.
	 */
	reachHop: 110,
	/**
	 * How long the camera takes to bring into view a part picked out from
	 * somewhere other than the picture.
	 *
	 * Pulls against the pick: the reader chose the part and is waiting to see
	 * it, so it is shorter than a walkthrough step (`PRESENTATION_STEP_MS`); and
	 * long enough that the move reads as a glide to the part and not a cut that
	 * leaves the reader to find where the board went.
	 */
	reveal: 480,
});

export { EXPLORING_MS };
