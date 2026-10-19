// Where the subtitle box breaks its lines, measured the way the browser draws it (TASK-307).
//
// Pretext breaks the text as the browser would, measuring its words with the browser's own canvas
// in the box's own font, against the box's content width; nothing lays the box out to find out.
// A measurement taken before the face has loaded would be of a fallback face, and pretext keeps
// what it measured, so a box is measured only once its face is there.

import { measureLineStats, prepareWithSegments } from "@chenglou/pretext";

import type { LineCount } from "#ui/rules/subtitles/cues.ts";

/**
 * The CSS font a box's text is set in.
 * @param box The box.
 * @returns The `font` shorthand, without a line height.
 */
function fontOf(box: HTMLElement): string {
	const style = getComputedStyle(box);
	return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

/**
 * How many lines a text takes in a box, as it is styled now.
 * @param box The subtitle box. Its width is its content's: the box is `box-content`.
 * @returns The line count.
 */
function lineCountOf(box: HTMLElement): LineCount {
	const font = fontOf(box);
	const width = Number.parseFloat(getComputedStyle(box).width);
	return (text) => measureLineStats(prepareWithSegments(text, font), width).lineCount;
}

/**
 * The face a box is set in, while it is still loading.
 * @param box The subtitle box.
 * @returns A promise settled once the face has loaded or failed to (and is drawn as its fallback),
 * or null when there is nothing to wait for.
 */
function faceLoading(box: HTMLElement): Promise<unknown> | null {
	const font = fontOf(box);
	// A document without a font set has no web face to wait for.
	const faces = "fonts" in document ? document.fonts : undefined;
	return faces === undefined || faces.check(font) ? null : faces.load(font);
}

export { faceLoading, lineCountOf };
