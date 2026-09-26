// A picture's traffic runs on its own SVG animation clock, which starts again
// at nought for every new copy of the picture's markup: a picture put up again
// from its string, a ghost cloned to fade out. Carrying the clock from the
// picture a copy replaces keeps the comets running on instead of jumping back
// to where they rest.

/**
 * Where a picture's animation clock stands.
 * @param root The picture.
 * @returns Its time in seconds, or nothing on a page without SVG animation.
 */
function clockOf(root: SVGSVGElement | null): number | undefined {
	return root !== null && "getCurrentTime" in root ? root.getCurrentTime() : undefined;
}

/**
 * Stand a picture's animation clock where another's stood.
 * @param root The picture, once it is in the page.
 * @param seconds Where the clock it replaces stood, if anywhere.
 */
function setClock(root: SVGSVGElement | null, seconds: number | undefined): void {
	if (seconds !== undefined && root !== null && "setCurrentTime" in root)
		root.setCurrentTime(seconds);
}

export { clockOf, setClock };
