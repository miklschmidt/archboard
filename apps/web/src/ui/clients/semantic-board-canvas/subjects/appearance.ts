// Applied appearance is read from the renderer's picture, so inspection never
// explains a newer policy than the picture the person actually selected. What
// the whole picture's key lists is read by the renderer core
// (`pictureAppearances`, `keyOf`), which an exported legend reads too; this
// reads one subject from the picture on screen, for its tip.

import { appearanceFrom, type AppliedAppearance } from "@archboard/renderer/picture";

/** Where the renderer draws a kind's icon inside a subject's group. */
const ICON = "[data-type-icon] svg";

/**
 * How the picture draws one subject, read from the picture it is drawn in.
 * @param picture The picture, or any element inside it.
 * @param id The subject.
 * @returns Its appearance, or undefined when the picture names no type for it.
 */
function drawnAppearance(picture: Element, id: string): AppliedAppearance | undefined {
	const root = picture.closest("svg") ?? picture;
	const group = root.querySelector(`[data-semantic-id="${id}"][data-type-name]`);
	if (group === null) return undefined;
	// A container draws its kind's icon in its header, a group of its own
	// apart from the frame that carries its type.
	const icon =
		group.querySelector(ICON) ?? root.querySelector(`[data-semantic-id="${id}"] ${ICON}`);
	return appearanceFrom(id, (name) => group.getAttribute(name), icon?.outerHTML ?? "");
}

export { drawnAppearance };
