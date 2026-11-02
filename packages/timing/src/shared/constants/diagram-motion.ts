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

/** One picture of a model turning into the next, arriving, and leaving. */
const PICTURE_MS = durations({
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
	 * stretched, so this stays above the 33 ms of a recording's slowest frame.
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
const PRESENTATION_MS = durations({
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
 * words never fade out together. On a painted model the swap starts the moment the
 * camera crosses the line, so it runs with a zoom or a flight (TASK-562).
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
