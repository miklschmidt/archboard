// What a subtitle keeps on screen while it fades.
//
// A subtitle that ends is not cut: its words stay while the paragraph fades out, and
// are gone once it has. A cue that gives way to the next is not cut either: its
// lines stay a moment under the new cue's first word. Both are timers, and both run
// on the frame clock, because a recording renders its subtitles frame by frame.

import { useCallback, useEffect, useState } from "react";

import { CAPTION_OUT_MS, CAPTION_SWAP_MS } from "@/shared/timing/voice";
import { frameClock } from "@/ui/frame-clock";
import type { SpokenCue } from "@/ui/voice-subtitles/hooks/use-voice-subtitles";

/** What is drawn of the subtitle while it fades. */
interface CaptionFade {
	/** The cue to draw: the one being said, or the last one while it fades out. */
	readonly shown: SpokenCue | null;
	/** The cue the shown one replaced, while its lines fade under it. */
	readonly replaced: SpokenCue | null;
}

/**
 * Whether a cue is another one and not the one being said, grown. A cue is told by its
 * utterance and by where it begins.
 * @param cue The cue.
 * @param kept The cue that was on screen, or null.
 * @returns True when the cue replaces it.
 */
function replaces(cue: SpokenCue, kept: SpokenCue | null): boolean {
	return kept !== null && (cue.item !== kept.item || cue.start !== kept.start);
}

/**
 * Run something once a while has passed, from when a token appears.
 * @param token What the wait is for: nothing while null, and a new wait for each new one.
 * @param ms How long to wait.
 * @param then What to run.
 */
function useAfter(token: SpokenCue | null, ms: number, then: () => void): void {
	useEffect(() => {
		if (token === null) return undefined;
		const clock = frameClock();
		const timer = clock.after(ms, then);
		return (): void => {
			clock.cancelAfter(timer);
		};
	}, [token, ms, then]);
}

/**
 * The cue to draw, and the one it replaced.
 * @param cue The cue that holds the latest word, or null once the subtitle has lingered.
 * @returns What to draw.
 */
function useCaptionFade(cue: SpokenCue | null): CaptionFade {
	const [kept, setKept] = useState<SpokenCue | null>(cue);
	const [replaced, setReplaced] = useState<SpokenCue | null>(null);
	if (cue !== null && cue !== kept) {
		setKept(cue);
		if (replaces(cue, kept)) setReplaced(kept);
	}
	const clearKept = useCallback((): void => {
		setKept(null);
	}, []);
	const clearReplaced = useCallback((): void => {
		setReplaced(null);
	}, []);
	useAfter(cue === null ? kept : null, CAPTION_OUT_MS, clearKept);
	useAfter(replaced, CAPTION_SWAP_MS, clearReplaced);
	return { shown: cue ?? kept, replaced };
}

export { useCaptionFade, type CaptionFade };
