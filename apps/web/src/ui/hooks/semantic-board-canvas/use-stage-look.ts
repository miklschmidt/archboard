// How the picture on the stage is seen: lit, from near or far, and with or
// without its traffic.

import { useLayoutEffect, useMemo } from "react";

import { FAR_VIEW_SWAP_MS } from "@archboard/timing";
import { stageOf } from "#ui/clients/semantic-board-canvas/picture/picture-stage.ts";
import type { StagedPicture } from "#ui/hooks/semantic-board-canvas/use-picture-transition.ts";
import {
	pictureLight,
	type LightState,
} from "#ui/rules/semantic-board-canvas/picture/picture-light.ts";

/**
 * Tell the stage how its picture stands in the light, and which view it shows.
 * @param picture The picture on the surface, or null while there is none.
 * @param state What lights the picture.
 * @param far Whether the picture is seen from far.
 */
function useStageLook(picture: StagedPicture | null, state: LightState, far: boolean): void {
	const { probing, veiled, presenting, standing, reach, reducedMotion } = state;
	const light = useMemo(
		() => pictureLight({ probing, veiled, presenting, standing, reach, reducedMotion }),
		[probing, veiled, presenting, standing, reach, reducedMotion],
	);
	useLayoutEffect(() => {
		if (picture !== null) stageOf(picture.surface)?.setLight(light);
	}, [picture, light]);
	useLayoutEffect(() => {
		if (picture !== null) {
			stageOf(picture.surface)?.setFar(far, reducedMotion ? 0 : FAR_VIEW_SWAP_MS);
		}
	}, [picture, far, reducedMotion]);
	useLayoutEffect(() => {
		if (picture !== null) stageOf(picture.surface)?.setTrafficShown(!reducedMotion);
	}, [picture, reducedMotion]);
}

export { useStageLook };
