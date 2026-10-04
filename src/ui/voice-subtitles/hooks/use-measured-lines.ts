// Where a subtitle box breaks its lines, kept true as the box is sized (TASK-307).
//
// The box is measured once the face it is drawn in has loaded, and again whenever its width
// changes: a pane that is narrower than the box shrinks it, and a sidebar that opens beside the
// picture does the same, so the cues must be cut again for the lines it now has.

import { useEffect, useRef, useState, type RefObject } from "react";

import type { LineCount } from "@/ui/voice-subtitles/lib/cues";
import { faceLoading, lineCountOf } from "@/ui/voice-subtitles/lib/measured-lines";

/** What the hook gives the box. */
interface MeasuredLines {
	/** To put on the box. */
	readonly ref: RefObject<HTMLParagraphElement | null>;
	/** How many lines a text takes in the box as it is now, or null before it is measured. */
	readonly lines: LineCount | null;
}

/**
 * The line counter of a subtitle box, as the box is now.
 * @returns The ref for the box and its counter.
 */
function useMeasuredLines(): MeasuredLines {
	const ref = useRef<HTMLParagraphElement>(null);
	const [lines, setLines] = useState<LineCount | null>(null);
	useEffect(() => {
		const box = ref.current;
		if (box === null) return undefined;
		let measuredAt = Number.NaN;
		let gone = false;
		/** Measure the box as it is, unless it is as wide as when it was last measured. */
		const measured = (): void => {
			if (gone) return;
			const width = Number.parseFloat(getComputedStyle(box).width);
			if (width === measuredAt) return;
			measuredAt = width;
			setLines(() => lineCountOf(box));
		};
		/** Measure the box once its face is there, which may be at once. */
		const measure = (): void => {
			const loading = faceLoading(box);
			if (loading === null) measured();
			else void loading.then(measured, measured);
		};
		measure();
		const watching = new ResizeObserver(measure);
		watching.observe(box);
		return (): void => {
			gone = true;
			watching.disconnect();
		};
	}, []);
	return { ref, lines };
}

export { useMeasuredLines, type MeasuredLines };
