// How wide a piece of diagram text is: the width the canvas of the place that
// draws it gives, in the face the SVG paints it in.
//
// A picture drawn in a browser is measured by that browser's own canvas, so
// the words fit exactly what that browser paints, whichever browser it is; a
// picture drawn under Bun is measured by an @napi-rs/canvas canvas with the
// same font files registered (TASK-247). Pretext breaks lines through the same
// global `OffscreenCanvas`, so a line and the words it is made of are measured
// by one engine. The host makes sure the canvas exists and the diagram faces
// are loaded before anything is measured (`lib/host.ts`).

import { fontAttributes, type DiagramFont } from "@/transformers/semantic-renderer/lib/fonts";

let context: OffscreenCanvasRenderingContext2D | undefined;

/**
 * The canvas context text is measured with, made once.
 * @returns The context.
 * @throws {Error} When the host's canvas gives no 2D context.
 */
function measuringContext(): OffscreenCanvasRenderingContext2D {
	if (context === undefined) {
		const made = new OffscreenCanvas(1, 1).getContext("2d");
		if (made === null) {
			throw new Error("The host's OffscreenCanvas gives no 2D context to measure text with");
		}
		context = made;
	}
	return context;
}

/**
 * The CSS font a piece of text is set in: the weight, the size and the family
 * stack the SVG writes on the element, so a measurement and the paint name the
 * same face.
 * @param font The family and weight.
 * @param fontSize The size.
 * @returns The CSS `font` shorthand.
 */
function cssFont(font: DiagramFont, fontSize: number): string {
	return `${font.weight} ${fontSize}px ${fontAttributes(font)["font-family"]}`;
}

/**
 * The width of one line of text as the host's canvas measures it.
 * @param text The line.
 * @param font The face it is set in.
 * @param fontSize The size it is set at.
 * @returns Its unrounded width.
 */
function canvasWidth(text: string, font: DiagramFont, fontSize: number): number {
	const measuring = measuringContext();
	measuring.font = cssFont(font, fontSize);
	return measuring.measureText(text).width;
}

export { canvasWidth, cssFont };
