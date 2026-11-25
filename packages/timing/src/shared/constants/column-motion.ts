// How the shell's columns come and go: motion a person watches for a moment and
// then reads on from, so each is judged by whether it explains where the column
// lives and is gone before the next thing is asked of it. Nothing here loops.

import { handed, motion } from "#shared/constants/uses.ts";

/** `column.agentPanelSlide`, named once so that a docked sidebar slides in the same time. */
const AGENT_PANEL_SLIDE_MS = 220;

/** `column.slideSettled`, named once so that a settled slide can be declared. */
const SLIDE_SETTLED_MS = 20;

/**
 * The conversation column and the model beside it, as either changes size.
 *
 * The conversation slides open beside the navigator and shut again. It is motion
 * a person watches, not waits out: long enough to read as a slide, short enough
 * that opening it to type is not slowed. The pane centre beside it changes size on
 * every frame of the slide, and the model is fitted to it once, at the end. A
 * pane's docked sidebar does the same beside the picture, and in the same time.
 */
const COLUMN = {
	/** How long the conversation takes to slide open or shut, and a docked sidebar with it. */
	"column.agentPanelSlide": motion(AGENT_PANEL_SLIDE_MS),
	/** The conversation's slide and the settling past it, after which a column calls the slide over. */
	"column.agentPanelSettled": handed(AGENT_PANEL_SLIDE_MS + SLIDE_SETTLED_MS),
	/**
	 * How long past its slide a column waits before it calls the slide over: the
	 * conversation or a pane's sidebar that has left is then unmounted, and the
	 * easing of one that has arrived is forgotten.
	 *
	 * Pulls against the stylesheet's transition of the same length, which ends on
	 * a frame of its own. A little over one frame at 60 Hz, so what leaves is not
	 * taken away on its last frame, and short enough that nothing waits on it.
	 */
	"column.slideSettled": handed(SLIDE_SETTLED_MS),
	/**
	 * How long a model's viewport keeps its size before the camera fits to it: longer than
	 * a slow frame, so a slide is fitted at its end, and short enough not to trail a resize.
	 */
	"column.pictureResizeSettle": handed(64),
	/**
	 * How long a select's or a menu's popover takes to arrive: it fades in and grows a
	 * little from the control that opened it, so a reader sees where it came from.
	 *
	 * Pulls against the click that asked for it. Past about 200 ms a reader waits on a
	 * list that they could already read, and under about 120 ms the popover reads as a
	 * flicker and not as something that opened.
	 */
	"column.popoverIn": motion(160),
	/**
	 * How long a popover takes to leave. Shorter than it took to arrive, because the
	 * choice is made and the reader looks at what it changed.
	 */
	"column.popoverOut": motion(110),
};

/** The durations of the pane sidebar's coming and going, in milliseconds. */
const SIDEBAR = {
	/**
	 * How long a docked sidebar takes to open or shut. Its column eases between
	 * no width and its own, the picture beside it gives way frame by frame, and
	 * the model is fitted once, at the end (`column.pictureResizeSettle`). The panel
	 * keeps its own width throughout, held to the pane's edge, so it slides in
	 * and never reflows.
	 *
	 * Pulls against the picture. It is the conversation's slide
	 * (`column.agentPanelSlide`), so the two columns of the shell move alike: past
	 * about 300 ms the model waits behind a moving column, and under about 150 ms
	 * the column reads as a jump.
	 */
	"sidebar.dock": motion(AGENT_PANEL_SLIDE_MS),
	/**
	 * How long a floating panel takes to arrive: it fades in while it moves a
	 * short way from the pane's edge. It is laid over the picture, so only its own
	 * layer moves and the picture under it is not painted again.
	 *
	 * Pulls against the click that asked for it. Past about 200 ms a pick seems
	 * to be answered late, and under about 120 ms the panel reads as a flicker
	 * and not as something that arrived.
	 */
	"sidebar.floatIn": motion(160),
	/**
	 * How long a floating panel takes to leave. Shorter than it took to arrive:
	 * it has been read, and the pointer is already on the picture again.
	 *
	 * Pulls against the next pick. Letting go of one part and picking another
	 * brings the panel back, and a panel that is still leaving then flickers; the
	 * shorter it takes, the less of that is seen.
	 */
	"sidebar.floatOut": motion(110),
	/**
	 * How long what the panel says about a new subject takes to fade in. Only its
	 * opacity moves, so a part picked out on the way along a path is read at once.
	 *
	 * Pulls against walking the model. Past about 160 ms a person who clicks from
	 * part to part waits on every one, and under about 80 ms the change is not
	 * seen, which is all it is for.
	 */
	"sidebar.subjectIn": motion(120),
};

export { COLUMN, SIDEBAR };
