// What one picture and the next have in common, and writing a picture into the
// surface.
//
// The renderer draws each picture whole and the pane edits no model content
// (ADR 0023). The stage moves one picture into the next on the canvas
// (ADR 0071). What stays here is the page's side of that: whether two pictures
// are one model carried on, how far the cards they share moved, and the markup
// that holds the words and the marks under the canvas.

import { stageOf } from "#ui/clients/canvas/picture/picture-stage.ts";
import type { SemanticDrawing } from "#ui/clients/canvas/reads/drawings.ts";

/**
 * What moving one picture into the next reads of a picture. A legacy board's
 * drawing is one, and so is a canonical reading's scene: `board` names what the
 * picture is of, and `view` how that is read.
 */
type MovingPicture = Pick<SemanticDrawing, "svg" | "painting" | "atlas" | "width" | "height"> & {
	readonly model: string;
	readonly view: { readonly id: string } | null;
};

/** How far the page moved under the cards two pictures share, in picture units. */
interface Shift {
	readonly x: number;
	readonly y: number;
}

const NO_SHIFT: Shift = { x: 0, y: 0 };

/**
 * How far the cards two pictures share moved, taken together: the old centre of
 * the shared cards less their new centre.
 *
 * Another variant of a model is often laid out on a page of another size, with
 * a lane or a card added along one edge, and every card that stayed the same
 * then sits somewhere else on the page. A camera that stayed put would carry
 * the whole model across the pane; a camera moved by this keeps what the two
 * pictures share where the reader was looking at it, and only what changed
 * moves.
 * @param before The last picture.
 * @param after The next.
 * @returns The shift, or none when the pictures share no card.
 */
function sharedShift(before: MovingPicture, after: MovingPicture): Shift {
	let x = 0;
	let y = 0;
	let shared = 0;
	for (const [id, old] of Object.entries(before.atlas.nodes)) {
		const next = after.atlas.nodes[id];
		if (next === undefined) continue;
		x += old.x + old.width / 2 - (next.x + next.width / 2);
		y += old.y + old.height / 2 - (next.y + next.height / 2);
		shared += 1;
	}
	return shared === 0 ? NO_SHIFT : { x: x / shared, y: y / shared };
}

/**
 * Which view a picture was read through, or null for the whole variant.
 * @param drawing The picture.
 * @returns The view's id, or null.
 */
function viewOf(drawing: MovingPicture): string | null {
	return drawing.view?.id ?? null;
}

/**
 * Whether the next picture is one this pane can move to from the last.
 *
 * Only a picture of the same model, read the same way: another variant of it,
 * or the same variant after an edit. Another model or another view of this one
 * is a different picture with nothing to carry across, and is shown at once.
 * A theme is never a different picture: one picture takes the page's theme.
 * @param before The picture on the surface.
 * @param after The picture that arrived.
 * @returns True when the subjects of one are the subjects of the other.
 */
function continuousPictures(before: MovingPicture, after: MovingPicture): boolean {
	return before.model === after.model && viewOf(before) === viewOf(after);
}

/**
 * Put a picture on the surface, replacing whatever was there.
 *
 * The picture is a string of SVG from `/api/architecture/render`, which is
 * this repository's own renderer: script-free, self-contained, and built from
 * the model's own content rather than from anything a person typed into the
 * browser. It is inserted rather than shown through an `<img>` because the
 * pane has to find its groups, mark them, and keep its words in the page.
 * Nothing else is ever put through this property. It is made away from the
 * page and its traffic taken out there, because the stage draws the traffic and
 * none of its SMIL must start in the page. A painter draws a picture that has a
 * painting, so what only the eye needs stays out of the page too.
 * @param surface The element the picture is put into.
 * @param picture The picture.
 */
function stagePicture(surface: HTMLElement, picture: MovingPicture): void {
	const made = surface.ownerDocument.createElement("div");
	made.innerHTML = picture.svg;
	for (const pulse of made.querySelectorAll(".ab-pulse")) pulse.remove();
	const stage = stageOf(surface);
	if (picture.painting !== undefined) stage?.thin(made);
	surface.replaceChildren(...made.childNodes);
	stage?.learnGroups(surface);
}

export { NO_SHIFT, continuousPictures, sharedShift, stagePicture, type MovingPicture, type Shift };
