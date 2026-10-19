// Where a mounted stage's parts are in the page: its state, its slots, the
// surface the camera moves, its tab stop, and an element of its picture.

/**
 * What state the stage is in.
 * @returns The `data-state` of the stage, or null when nothing is mounted.
 */
function stageState(): string | null {
	return (
		document.querySelector("[data-slot='semantic-board-stage']")?.getAttribute("data-state") ?? null
	);
}

/**
 * One element of the mounted stage.
 * @param slot The `data-slot` wanted.
 * @returns The element.
 */
function part(slot: string): HTMLElement {
	const element = document.querySelector<HTMLElement>(`[data-slot='${slot}']`);
	if (element === null) {
		throw new Error(`The stage drew no ${slot}.`);
	}
	return element;
}

/**
 * The element the camera moves.
 * @returns The surface.
 */
function surface(): HTMLElement {
	return part("semantic-board-surface");
}

/**
 * The stage's tab stop: the element that hears the keys and the wheel.
 * @returns The viewport.
 */
function viewport(): HTMLElement {
	return part("semantic-board-viewport");
}

/**
 * The element inside the picture with this id.
 * @param id The id in the fake drawing's markup.
 * @returns The element.
 */
function inPicture(id: string): Element {
	const element = surface().querySelector(`#${id}`);
	if (element === null) {
		throw new Error(`The picture has no ${id}.`);
	}
	return element;
}

export { inPicture, part, stageState, surface, viewport };
