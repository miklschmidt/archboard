// Applied appearance is read from the renderer's picture, so inspection never
// explains a newer policy than the picture the person actually selected. The
// renderer core reads every subject's appearance and the whole picture's key
// off the picture it draws, and they arrive with it (`appearances`, `key`);
// this reads one subject from the picture on screen, for its tip, from the
// facts the core writes on the group that draws the subject.

import type { AppliedAppearance } from "@archboard/board/render-reply";

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
	/**
	 * One fact the group carries.
	 * @param name The attribute that carries it.
	 * @param neutral Its value when the group carries none.
	 * @returns The fact.
	 */
	const read = (name: string, neutral: string): string => group.getAttribute(name) ?? neutral;
	return {
		id,
		iconSvg: icon?.outerHTML ?? "",
		typeName: read("data-type-name", ""),
		typeKind: read("data-type-kind", ""),
		depiction: read("data-depiction", ""),
		typeColor: read("data-type-color", "neutral"),
		lineColor: read("data-line-color", "neutral"),
		dash: read("data-line-dash", "solid"),
		arrowhead: read("data-arrowhead", "filled"),
	};
}

export { drawnAppearance };
