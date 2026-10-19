// Keeping a presented step's subjects clear of the caption laid over the
// bottom of the picture: the caption's height is measured, and the camera is
// told to keep that much of the viewport's bottom out of its fits.

import { useLayoutEffect, useState } from "react";

/**
 * Tell the camera how tall the caption is, for as long as it is there.
 * @param reserve Keep this many pixels at the bottom of the viewport clear.
 * @returns The ref to attach to the caption.
 */
function useCaptionReserve(
	reserve: (bottom: number) => void,
): (element: HTMLElement | null) => void {
	const [caption, setCaption] = useState<HTMLElement | null>(null);
	useLayoutEffect(() => {
		if (caption === null) {
			return undefined;
		}
		const element = caption;
		/** Take the caption's height. */
		function measure(): void {
			reserve(element.getBoundingClientRect().height);
		}
		measure();
		const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
		observer?.observe(element);
		return (): void => {
			observer?.disconnect();
			reserve(0);
		};
	}, [caption, reserve]);
	return setCaption;
}

export { useCaptionReserve };
