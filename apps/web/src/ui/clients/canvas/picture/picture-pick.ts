// What lies under an event in a picture. With a painter at work the painter says,
// and otherwise the event does.

import { stageOf } from "#ui/clients/canvas/picture/picture-stage.ts";

/** The picture's surface, inside a viewport. */
const SURFACE = "[data-slot='semantic-board-surface']";

/** A pointer event, as far as a pick reads it. */
interface PointerPlace {
	readonly target: EventTarget | null;
	readonly currentTarget: EventTarget | null;
	readonly clientX: number;
	readonly clientY: number;
}

/**
 * What an event lands on in the picture, the topmost first. With a painter at
 * work the surface takes no pointer, so the painter answers. An event that
 * reached a group of the picture all the same came from no pointer: assistive
 * technology clicks the group it found, and the event says which.
 * @param event The event.
 * @returns The painter's answer, or null while no painter works or the event names its group.
 */
function pickedElements(event: PointerPlace): readonly (Element | null)[] | null {
	const viewport = event.currentTarget;
	const surface = viewport instanceof Element ? viewport.querySelector(SURFACE) : null;
	if (surface === null || namesItsGroup(event, surface)) return null;
	return stageOf(surface)?.elementsAt(event.clientX, event.clientY) ?? null;
}

/**
 * Whether an event reached a group of the picture.
 * @param event The event.
 * @param surface The picture's surface.
 * @returns True when its target is inside the surface.
 */
function namesItsGroup(event: PointerPlace, surface: Element): boolean {
	return event.target instanceof Node && surface.contains(event.target);
}

/**
 * What an event lands on in the picture.
 * @param event The event.
 * @returns The element the painter found, or the event's own target while no painter works.
 */
function pickedTarget(event: PointerPlace): EventTarget | null {
	const picked = pickedElements(event);
	return picked === null ? event.target : (picked[0] ?? null);
}

export { pickedElements, pickedTarget };
