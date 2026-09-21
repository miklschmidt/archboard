// Whether the step of a presented walkthrough has finished arriving, said to
// whoever is reporting the pane rather than only to the page.
//
// A glide and a picture flight are drawn a frame at a time outside React, and
// each marks the surface for as long as it runs (`data-camera-motion`,
// `data-picture-motion`). Those marks are what ADR 0023 means by the pane
// exposing whether a step has arrived, and a browser test reads them directly.
// Something driving the presentation from the server cannot: it hears only what
// the pane reports. So this watches the same marks, and says when the surface
// has come to rest on the thing it was asked to show.
//
// What it was asked to show is a key, not a step number. A step read through
// another view is on its way twice — once as a step, once as a picture — and a
// rest observed for the first must not stand for the second. Whoever holds the
// key compares it with the last one settled, so a new key is unsettled in the
// same render that made it, with no window where the old answer still reads true.

import { useEffect } from "react";

import { CAMERA_MOTION_ATTRIBUTE } from "@/ui/semantic-board-canvas/hooks/use-camera-glide";
import { PICTURE_MOTION_ATTRIBUTE } from "@/ui/semantic-board-canvas/hooks/use-picture-transition";

/**
 * Whether anything is still moving the surface.
 * @param surface The surface.
 * @returns True while a glide or a picture flight is running.
 */
function moving(surface: HTMLElement): boolean {
	return (
		surface.hasAttribute(CAMERA_MOTION_ATTRIBUTE) || surface.hasAttribute(PICTURE_MOTION_ATTRIBUTE)
	);
}

/**
 * Say when the surface has come to rest on what it was asked to show.
 * @param surface The surface, or null before it is mounted.
 * @param key What the surface was asked to show, or null while nothing is presented.
 * @param onSettled Told the key once the surface rests on it, and null when it moves again.
 */
function usePresentationArrival(
	surface: HTMLElement | null,
	key: string | null,
	onSettled: ((key: string | null) => void) | undefined,
): void {
	useEffect(() => {
		if (surface === null || key === null || onSettled === undefined) {
			return undefined;
		}
		/** Say whether the surface rests on the key right now. */
		const observe = (): void => {
			onSettled(moving(surface) ? null : key);
		};
		// A glide that starts with this key was started by a layout effect of the
		// same commit, so by now the surface already says whether it is moving.
		observe();
		if (typeof MutationObserver !== "function") {
			return undefined;
		}
		const observer = new MutationObserver(observe);
		observer.observe(surface, {
			attributes: true,
			attributeFilter: [CAMERA_MOTION_ATTRIBUTE, PICTURE_MOTION_ATTRIBUTE],
		});
		return (): void => {
			observer.disconnect();
		};
	}, [surface, key, onSettled]);
}

export { usePresentationArrival };
