import { useLayoutEffect } from "react";

/** Where a hidden picture keeps the id of a gradient. */
const KEPT_ID = "data-kept-id";

/**
 * A picture gives up the ids of its gradients while it is hidden. Every picture on a page defines
 * the same ids, the first in the document wins, and a definition under `display: none` paints
 * nothing, so a reading hidden behind a walkthrough would empty the fills of the picture on show.
 * Activity hides a picture by running this cleanup.
 * @param surface The picture's surface.
 */
function useGradientsWhileShown(surface: HTMLElement | null): void {
	useLayoutEffect(() => {
		for (const gradient of surface?.querySelectorAll(`[${KEPT_ID}]`) ?? []) {
			gradient.id = gradient.getAttribute(KEPT_ID) ?? "";
			gradient.removeAttribute(KEPT_ID);
		}
		return (): void => {
			for (const gradient of surface?.querySelectorAll("linearGradient, radialGradient") ?? []) {
				gradient.setAttribute(KEPT_ID, gradient.id);
				gradient.removeAttribute("id");
			}
		};
	}, [surface]);
}

export { useGradientsWhileShown };
