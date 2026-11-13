// How a model answers a hand: the motion a person feels while they poke at it,
// not the motion they wait out. What these pull against is the hand itself, so
// each is judged by how it feels under a wheel, a drag or a pointer at rest.

/** The durations of exploring a model, in milliseconds. */
const EXPLORING_MS = Object.freeze({
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
	/** The short ease of a keyed move or a fit, which the painter gives the camera. */
	cameraSettle: 100,
	/**
	 * The longest one frame of a zoom or an ease counts for. A frame that comes
	 * late, after the tab was hidden or the page stalled, moves the camera by no
	 * more than this much time.
	 *
	 * Pulls against a slow page. It is four frames at 60 Hz, so a page that drops
	 * a frame or two still moves at its own pace; a longer cap lets one stall
	 * throw the camera across the model.
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
	 * soft and a model the reader has let go of looks stalled.
	 */
	cameraRest: 400,
	/**
	 * How long the camera glides to the whole model when the fit key is pressed.
	 * Shorter than a walkthrough step (`PRESENTATION_MS.step`) because the reader
	 * asked for it and is waiting; long enough that the path, which pulls back to
	 * cross a long distance, can be followed.
	 */
	cameraFit: 520,
	/**
	 * How long the pointer rests on a part before the picture lights what it is
	 * wired to; once something is lit, the next part lights at once.
	 *
	 * Pulls against the pointer crossing the model: shorter than about 80 ms and
	 * the picture flashes at everything the pointer passes; longer than about
	 * 200 ms and resting on a part to ask what it touches feels ignored. It is
	 * well under a tip's delay (`subjectTip`), so the light comes
	 * first and the tip, when it opens, finds the connections already lit.
	 */
	lightingDwell: 110,
	/**
	 * How long the pointer rests on a card, a container's header or a label before
	 * the picture says more about it; once one tip is open, the next opens at once.
	 * Pulls against the pointer crossing the model: shorter and tips flash over
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
	 * leaves the reader to find where the model went.
	 */
	reveal: 480,
	/**
	 * How long the flight into a card's model, or back out of it, takes.
	 *
	 * Pulls against what the flight shows. The model has to grow from the size of
	 * a card to the size of the pane, often more than ten times, and the eye needs
	 * a few frames at each size to see that it is the same model; under about half
	 * a second that reads as a cut with a smear, and over a second the reader waits
	 * on a picture they already chose. A walkthrough step (`PRESENTATION_MS.step`)
	 * is longer because it also carries the reader across the model.
	 */
	dive: 720,
	/**
	 * How long the page waits for the picture of a model it is about to fly into
	 * before it opens the model the plain way. Every model's picture is drawn ahead
	 * and kept, so the wait is normally a read from storage.
	 *
	 * Pulls against the click: a reader who has chosen a card is waiting, so a
	 * picture that is not to hand within a moment is not worth a flight that
	 * starts late.
	 */
	divePrefetch: 140,
} satisfies Record<string, number>);

// How a picture of a model turns into the next one, arrives and leaves, and how a
// walkthrough is presented step by step. The painter receives these values from the page.

/** One picture of a model turning into the next, arriving, and leaving. */
const PICTURE_MS = Object.freeze({
	/**
	 * How long a pane takes to turn one picture of a model into the next one of
	 * the same model — another variant, or the same variant after an edit.
	 *
	 * Shared subjects glide from where they were to where they are; that is what
	 * lets a reader keep hold of which card became which. Pulls against attention
	 * two ways: shorter than about half a second and a move across a wide model
	 * reads as a jump with a smear on it; longer than about three quarters and the
	 * model feels like it is waiting for the animation rather than the reader.
	 * Everything below is a fraction of this one number, so the whole choreography
	 * shortens or lengthens together. Sparks that redraw lines run on past it, up to
	 * `drawEnd` of it, once the rest of the move has landed.
	 */
	transition: 640,
	/**
	 * How long the shutter samples a sideways passage, in milliseconds.
	 * A longer sample smears words too far to read during travel.
	 */
	shutter: 8,
	/**
	 * How long the picture on the stage takes to step back once the next one is on
	 * its way. A large model takes a moment to lay out, and this answers the click
	 * at once. A flight then goes on from where this stands.
	 */
	awaitIn: 160,
	/** How long a picture takes to step forward again, as a flight starts or the wait ends. */
	awaitOut: 300,
	/**
	 * How long a pane takes to bring in a picture it has nothing to carry from:
	 * the first picture of a page, another model, another view of this one.
	 *
	 * A first picture or another view blooms out of its middle: frames, then cards
	 * in a wave, then the lines between them drawn on with light at their heads, and
	 * each label as its line reaches it. A card the last picture also drew flies from
	 * where it stood. Another model comes in on a passage over the same time, which
	 * takes the reader sideways, in or out along the module tree.
	 * Pulls against the wait itself: somebody who asked for a model wants to read
	 * it, so the cards land in this time and a card is readable well before the
	 * last line is drawn. The sparks that draw the lines run on up to `drawEnd` of it.
	 */
	entry: 760,
	/**
	 * How long the picture a pane is leaving takes to go, when it goes to another
	 * model or view rather than turning into the next picture. On a passage, this
	 * is the time of the first step that answers the click.
	 *
	 * Short on purpose: it is only there so the old picture is not snatched away,
	 * and it runs underneath the next picture's entrance.
	 */
	exit: 280,
	/**
	 * How long a reader waits for the next reading before the pane names it.
	 *
	 * Most pictures arrive within a few hundred milliseconds, and a message flashed
	 * in front of them would be the only thing on screen that jumps. Pulls against
	 * doubt: a comparison can take many seconds, and past about a second a reader
	 * with only the old picture cannot tell that the pane heard them.
	 */
	waitNotice: 800,
	/**
	 * How long a picture waits for this browser's picture store before it draws anyway.
	 *
	 * A kept picture only saves a redraw, and the store usually answers within 50 ms. Pulls against
	 * a store that never answers: a page that reloads during the first open of the store leaves
	 * every later open waiting, and no error says so.
	 */
	storeWait: 400,
	/**
	 * The longest step the painter's clock takes in one frame.
	 *
	 * A busy GPU or a long task holds a frame back, and a flight that runs on through the stall
	 * reaches the reader finished. Past this, the stage's time waits for the frames that show it.
	 * Pulls against a slow painter: a machine whose frames all take longer sees every motion
	 * stretched, so this stays above the 33 ms of a recording's slowest frame. A test of
	 * the web app checks it.
	 */
	longestStep: 50,
	/**
	 * How long a first picture's ink waits for its painter before the SVG shows.
	 *
	 * A painter that arrives in time brings the picture in, and otherwise the page has no entrance
	 * at all. Pulls against a blank model: a painter usually starts within 150 ms of its picture,
	 * but a browser can take a second to give a GPU, or never give one, and a reader must see
	 * a correct model.
	 */
	painterGrace: 400,
	/**
	 * How soon after one GPU failure a second one leaves the model on the CPU painter.
	 *
	 * A stopped device can come back: a GPU process that restarted gives a new one, so the stage
	 * starts a GPU painter again without a reload. Pulls against a failure that repeats, which
	 * must not rebuild the painter over and over.
	 */
	gpuRetry: 30_000,
} satisfies Record<string, number>);

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
	/**
	 * The parts inside a door that opens show between these two, riding inside the
	 * door as it grows, so that no frame travels empty.
	 */
	insideStart: 0.08,
	insideEnd: 0.46,
	/**
	 * A line whose route changes shape does not swing across the model: a model of
	 * lines swinging at once is a tangle. It fades out with what leaves, and a spark
	 * redraws it from here, once the cards are nearly in place.
	 */
	drawStart: 0.42,
	/**
	 * The last spark lands by here. This is past 1, because the lines go on after the
	 * rest of the move has landed. Pulls against a reader who waits for the last line:
	 * shorter than about a second and a half and a model of lines reads as a flicker;
	 * the cards are in place long before it, so a longer run costs little, but past
	 * about two seconds it stops being a gesture.
	 */
	drawEnd: 3.0,
});

/** When, as fractions of `PICTURE_MS.entry`, each part of a picture arrives. */
const PICTURE_ENTRY_PHASES = Object.freeze({
	/** The page's furniture fades in over the first part. */
	framesEnd: 0.3,
	/**
	 * How long the front that opens the containers takes to leave the middle and pass the last
	 * of them. Pulls against the wave of cards, which must land on a floor: the front runs ahead
	 * of `cardsStartBy`. Much shorter than this and a well as large as the model reads as a pop.
	 */
	regionSpan: 0.6,
	/** The card nearest the middle begins here, and the farthest begins by `cardsStartBy`. */
	cardsStart: 0.06,
	cardsStartBy: 0.36,
	/** How long each card takes to arrive. */
	cardSpan: 0.48,
	/** Sparks start to run along the lines here, from the cards that nothing feeds. */
	linesStart: 0.32,
	/**
	 * The last spark lands by here. This is past 1, because the lines go on after the
	 * rest of the entrance has landed. A model of a hundred lines drawn in less than a
	 * second is a flash, and sparks that run for much over two seconds hold up a reader
	 * who is already reading the cards.
	 */
	drawEnd: 2.8,
	/** How long a line's pulses take to come in once the line is drawn. */
	pulseSpan: 0.12,
	/**
	 * What stands on the lines and belongs to none of them, the marks where routes
	 * join, arrives from here to the end. A label that names a line arrives as the
	 * spark reaches it.
	 */
	labelsStart: 0.66,
});

/** A walkthrough presented step by step. */
const PRESENTATION_MS = Object.freeze({
	/**
	 * How long the camera takes to glide from one step of a presented walkthrough
	 * to the next, and the veil over what the step is not about takes to follow it.
	 *
	 * A step is a new sentence in a talk, not a jump cut, so the camera travels far
	 * enough to be followed: it pulls back, crosses, and settles on the step. Pulls
	 * against the talk itself: a glide much past a second is dead air between two
	 * sentences, and one shorter than half a second reads as a cut with a blur. A
	 * step that also changes the view the model is read through moves with the
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
	 * press. A test of the web app checks that it is shorter than the orb's flight.
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
} satisfies Record<string, number>);

export {
	EXPLORING_MS,
	PICTURE_ENTRY_PHASES,
	PICTURE_MS,
	PICTURE_TRANSITION_PHASES,
	PRESENTATION_MS,
};
