// A picture's traffic runs on the picture's own clock, which starts again at
// nought for every new copy of the picture's markup: a picture put up again
// from its string, a ghost cloned to fade out. Carrying the clock from the
// picture a copy replaces keeps the comets running on instead of jumping back
// to where they rest. The frame clock reads and stands it, so a recording
// rendered frame by frame carries it the same way.

import { frameClock } from "@/ui/frame-clock";

/**
 * Where a picture's animation clock stands.
 * @param root The picture.
 * @returns Its time in seconds, or nothing when it runs no traffic.
 */
function clockOf(root: SVGSVGElement | null): number | undefined {
	return root === null ? undefined : frameClock().pictureTime(root);
}

/**
 * Stand a picture's animation clock where another's stood.
 * @param root The picture, once it is in the page.
 * @param seconds Where the clock it replaces stood, if anywhere.
 */
function setClock(root: SVGSVGElement | null, seconds: number | undefined): void {
	if (seconds !== undefined && root !== null) frameClock().setPictureTime(root, seconds);
}

export { clockOf, setClock };
