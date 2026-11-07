// Sending a picture on its way out while the next one is drawn, and bringing it
// back when the reader returns to it before anything else arrived.

import { useLayoutEffect } from "react";

import type { Departure } from "#ui/architecture-drawing/canvas/picture/transitions/clients/picture-departure.ts";
import { stageOf } from "#ui/architecture-drawing/canvas/picture/transitions/clients/picture-stage.ts";
import type { StagedPicture } from "#ui/architecture-drawing/canvas/picture/transitions/hooks/use-picture-transition.ts";

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
		const stage = picture === null ? null : stageOf(picture.surface);
		if (departure === null) stage?.stay();
		else stage?.leave(departure, reducedMotion);
	}, [picture, departure, reducedMotion]);
	return departure;
}

export { useLeaving };
