// What a recording draws before it captures anything (TASK-378).
//
// The recording's browser composites on the GPU when it has one, and a GPU compiles the shaders
// of an effect the first time it is drawn: the subtitle box's blurred scrim took 60 to 85 ms, so
// the first words of a recording held the picture that long. The page therefore draws the box
// once before it captures its tab, and the compiled shaders are ready when the voice speaks.
// app.css shows the box while the root carries the rehearsal attribute.

/** The page rehearses while its root carries this attribute. */
const REHEARSAL_ATTRIBUTE = "data-recording-rehearsal";

/**
 * Wait for the browser to draw a frame.
 * @returns When the next frame has been drawn.
 */
function nextFrame(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => resolve());
	});
}

/**
 * Draw what the recording draws only later, for two frames, and take it away again.
 * @returns When it has been drawn and is gone.
 */
async function rehearse(): Promise<void> {
	const root = document.documentElement;
	root.setAttribute(REHEARSAL_ATTRIBUTE, "");
	try {
		await nextFrame();
		await nextFrame();
	} finally {
		root.removeAttribute(REHEARSAL_ATTRIBUTE);
	}
}

export { rehearse };
