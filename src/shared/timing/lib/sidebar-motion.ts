// How a pane's sidebar comes and goes: motion a person watches for a moment and
// then reads on from, so each is judged by whether it explains where the panel
// lives and is gone before the next thing is asked of it. Nothing here loops.

/** The durations of the pane sidebar's coming and going, in milliseconds. */
const SIDEBAR_MS = Object.freeze({
	/**
	 * How long a docked sidebar takes to open or shut. Its column eases between
	 * no width and its own, the picture beside it gives way frame by frame, and
	 * the board is fitted once, at the end (`BOARD_RESIZE_SETTLE_MS`). The panel
	 * keeps its own width throughout, held to the pane's edge, so it slides in
	 * and never reflows.
	 *
	 * Pulls against the picture. It is the conversation's slide
	 * (`AGENT_PANEL_SLIDE_MS`), so the two columns of the shell move alike: past
	 * about 300 ms the board waits behind a moving column, and under about 150 ms
	 * the column reads as a jump.
	 */
	dock: 220,
	/**
	 * How long a floating panel takes to arrive: it fades in while it moves a
	 * short way from the pane's edge. It is laid over the picture, so only its own
	 * layer moves and the picture under it is not painted again.
	 *
	 * Pulls against the click that asked for it. Past about 200 ms a pick seems
	 * to be answered late, and under about 120 ms the panel reads as a flicker
	 * and not as something that arrived.
	 */
	floatIn: 160,
	/**
	 * How long a floating panel takes to leave. Shorter than it took to arrive:
	 * it has been read, and the pointer is already on the picture again.
	 *
	 * Pulls against the next pick. Letting go of one part and picking another
	 * brings the panel back, and a panel that is still leaving then flickers; the
	 * shorter it takes, the less of that is seen.
	 */
	floatOut: 110,
	/**
	 * How long what the panel says about a new subject takes to fade in. Only its
	 * opacity moves, so a part picked out on the way along a path is read at once.
	 *
	 * Pulls against walking the board. Past about 160 ms a person who clicks from
	 * part to part waits on every one, and under about 80 ms the change is not
	 * seen, which is all it is for.
	 */
	subjectIn: 120,
});

export { SIDEBAR_MS };
