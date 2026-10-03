// Drawing on the relationships a poke lights, each time the lighting changes.

import { useLayoutEffect } from "react";

import type { StagedPicture } from "@/ui/semantic-board-canvas/hooks/use-picture-transition";
import { sweepLines } from "@/ui/semantic-board-canvas/lib/picture-sweep";

/**
 * Draw on the relationships among the subjects a picture lights, once, when
 * they light, and take the sweep away when the lighting changes or the picture
 * does. Before paint, so the first frame of the light is the first of the sweep.
 * @param picture The picture on the surface, or null while there is none.
 * @param lit The subjects the picture lights, or null for no lighting.
 * @param reducedMotion Whether the person asked for no motion, which lights at once.
 */
function useSweep(
	picture: StagedPicture | null,
	lit: ReadonlySet<string> | null,
	reducedMotion: boolean,
): void {
	useLayoutEffect(() => {
		if (
			picture === null ||
			lit === null ||
			reducedMotion ||
			!(picture.root instanceof SVGElement)
		) {
			return undefined;
		}
		return sweepLines(picture.root, lit);
	}, [picture, lit, reducedMotion]);
}

export { useSweep };
