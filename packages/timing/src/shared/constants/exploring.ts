// How a board answers a hand: the motion a person feels while they poke at it,
// not the motion they wait out. What these pull against is the hand itself, so
// each is judged by how it feels under a wheel, a drag or a pointer at rest.

import { durations } from "#shared/constants/durations.ts";

/** The durations of exploring a board, in milliseconds. */
const EXPLORING_MS = durations({
	/**
	 * How long the camera takes to cover most of the way to where a wheel or a
	 * key asked it to go: it covers 63 percent of what is left in this time, and
	 * is within 5 percent of the end after three times it.
	 *
	 * Pulls against the hand. At 40 ms or less a wheel notch is a jump again; past
	 * about 120 ms the picture is seen to trail a pointer that has stopped moving.
	 * Because every input only moves where the camera is going, a hard flick of
	 * the wheel adds up and eases once, instead of stuttering notch by notch.
	 *
	 * A pinch has no ease (TASK-405). The picture follows the fingers at once, as
	 * it follows a drag.
	 */
	cameraEase: 80,
	/**
	 * The longest one frame of a zoom or an ease counts for. A frame that comes
	 * late, after the tab was hidden or the page stalled, moves the camera by no
	 * more than this much time.
	 *
	 * Pulls against a slow page. It is four frames at 60 Hz, so a page that drops
	 * a frame or two still moves at its own pace; a longer cap lets one stall
	 * throw the camera across the board.
	 *
	 * A released drag has no duration here. The camera stops where the hand lets
	 * go of it (TASK-403), because a picture that carries on alone moves the part
	 * the reader aimed at out from under them.
	 */
	cameraFrameLongest: 64,
	/**
	 * How long a hand must have left the camera alone before the camera is at
	 * rest. At rest the picture is drawn sharp at its new size, the far view
	 * follows the new zoom, and the traffic of the picture begins to move again.
	 * A drag does not wait for its traffic: traffic starts as the hand lets go.
	 *
	 * Pulls against the hand. A wheel or a pinch is a run of turns with no end of
	 * its own, so at 150 ms or less the picture is drawn again and its traffic
	 * wakes up between two turns of one zoom. Past about 600 ms the picture stays
	 * soft and a board the reader has let go of looks stalled.
	 */
	cameraRest: 400,
	/**
	 * How long traffic takes to come back to its full speed, from standing still.
	 *
	 * Pulls against the eye. At 500 ms or less the pulses lurch into motion, which
	 * reads as a switch; past about two seconds the lines look sluggish for as
	 * long as the reader has already looked at the board. It eases in and out, so
	 * the first moments are barely a creep.
	 */
	trafficStart: 1500,
	/**
	 * How long the camera glides to the whole board when the fit key is pressed.
	 * Shorter than a walkthrough step (`PRESENTATION_MS.step`) because the reader
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
	 * well under a tip's delay (`subjectTip`), so the light comes
	 * first and the tip, when it opens, finds the connections already lit.
	 */
	lightingDwell: 110,
	/**
	 * How long the pointer rests on a card, a container's header or a label before
	 * the picture says more about it; once one tip is open, the next opens at once.
	 * Pulls against the pointer crossing the board: shorter and tips flash over
	 * everything it passes on its way; longer and resting on a card to read it
	 * feels ignored.
	 */
	subjectTip: 450,
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
	 * step's veil (`PRESENTATION_MS.step`) because a poke is asked of the picture
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
	 * it, so it is shorter than a walkthrough step (`PRESENTATION_MS.step`); and
	 * long enough that the move reads as a glide to the part and not a cut that
	 * leaves the reader to find where the board went.
	 */
	reveal: 480,
	/**
	 * How long the flight into a card's board, or back out of it, takes.
	 *
	 * Pulls against what the flight shows. The board has to grow from the size of
	 * a card to the size of the pane, often more than ten times, and the eye needs
	 * a few frames at each size to see that it is the same board; under about half
	 * a second that reads as a cut with a smear, and over a second the reader waits
	 * on a picture they already chose. A walkthrough step (`PRESENTATION_MS.step`)
	 * is longer because it also carries the reader across the board.
	 */
	dive: 720,
	/**
	 * How long the page waits for the picture of a board it is about to fly into
	 * before it opens the board the plain way. Every board's picture is drawn ahead
	 * and kept, so the wait is normally a read from storage.
	 *
	 * Pulls against the click: a reader who has chosen a card is waiting, so a
	 * picture that is not to hand within a moment is not worth a flight that
	 * starts late.
	 */
	divePrefetch: 140,
});

export { EXPLORING_MS };
