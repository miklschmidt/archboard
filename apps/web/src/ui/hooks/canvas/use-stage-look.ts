// How the picture on the stage is seen: lit, from near or far, and with or
// without its traffic.

import { useLayoutEffect, useMemo } from "react";

import { FAR_VIEW_SWAP_MS, PICTURE_MS } from "@archboard/timing";
import { stageOf } from "#ui/clients/canvas/picture/picture-stage.ts";
import { FAR_SCALE } from "#ui/rules/canvas/camera/camera.ts";
import type { StagedPicture } from "#ui/hooks/canvas/use-picture-transition.ts";
import { pictureLight, type LightState } from "#ui/rules/canvas/picture/picture-light.ts";

/**
 * Tell the stage how its picture stands in the light, and where its far view begins.
 * @param picture The picture on the surface, or null while there is none.
 * @param state What lights the picture.
 * @param farView Whether the picture has a far view.
 * @param awaited Whether the next picture is on its way.
 */
function useStageLook(
	picture: StagedPicture | null,
	state: LightState,
	farView: boolean,
	awaited: boolean,
): void {
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
			const line = farView ? FAR_SCALE : 0;
			stageOf(picture.surface)?.setFarLine(line, reducedMotion ? 0 : FAR_VIEW_SWAP_MS);
		}
	}, [picture, farView, reducedMotion]);
	useLayoutEffect(() => {
		if (picture !== null) {
			const ms = awaited ? PICTURE_MS.awaitIn : PICTURE_MS.awaitOut;
			stageOf(picture.surface)?.setAwaited(awaited && !reducedMotion, reducedMotion ? 0 : ms);
		}
	}, [picture, awaited, reducedMotion]);
	useLayoutEffect(() => {
		if (picture !== null) stageOf(picture.surface)?.setTrafficShown(!reducedMotion);
	}, [picture, reducedMotion]);
}

export { useStageLook };
