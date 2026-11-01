// Sending a picture on its way out while the next one is drawn, and bringing it
// back when the reader returns to it before anything else arrived.

import { useLayoutEffect } from "react";

import {
	leavePicture,
	stayPicture,
	type Departure,
} from "#ui/clients/semantic-board-canvas/picture/picture-departure.ts";
import type { StagedPicture } from "#ui/hooks/semantic-board-canvas/use-picture-transition.ts";

/**
 * Send the picture on its way out while the pane is leaving it.
 * @param picture The picture on the surface.
 * @param leaving Where the reader went, or null while they stay.
 * @param reducedMotion Whether the person asked for no motion.
 * @returns Where the reader went, or null.
 */
function useLeaving(
	picture: StagedPicture | null,
	leaving: Departure | null | undefined,
	reducedMotion: boolean,
): Departure | null {
	const departure = leaving ?? null;
	useLayoutEffect(() => {
		const root = picture?.root;
		if (!(root instanceof SVGElement)) {
			return;
		}
		if (departure === null) {
			stayPicture(root);
		} else {
			leavePicture(root, departure, reducedMotion);
		}
	}, [picture, departure, reducedMotion]);
	return departure;
}

export { useLeaving };
