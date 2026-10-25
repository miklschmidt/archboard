// What a subtitle keeps on screen while it fades.
//
// A subtitle that ends is not cut: its words stay while the paragraph fades out, and
// are gone once it has. A cue that gives way to the next is not cut either: its
// lines stay a moment under the new cue's first word, if they were being read. Words
// that had already begun to fade out do not come back under the next ones. Both are
// timers, and both run on the frame clock, because a recording renders its subtitles
// frame by frame.

import { useCallback, useEffect, useState } from "react";

import { SUBTITLE_MS } from "@archboard/timing";
import { frameClock } from "@archboard/ui-kit/frame-clock";
import type { SpokenCue } from "#ui/hooks/subtitles/use-voice-subtitles.ts";

/** What is drawn of the subtitle while it fades. */
interface SubtitleFade {
	/** The cue to draw: the one being said, or the last one while it fades out. */
	readonly shown: SpokenCue | null;
	/** The cue the shown one replaced, while its lines fade under it. */
	readonly replaced: SpokenCue | null;
}

/** What the hook keeps: what it draws, and whether that was being said when the cue last changed. */
interface Kept extends SubtitleFade {
	/** Whether the shown cue was the live one, and not fading out already. */
	readonly live: boolean;
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
 * The cue whose lines fade under a new one. A cue that gives way to another leaves its lines
 * under it only while it was being said: one that had begun to fade out does not come back.
 * @param kept What was kept.
 * @param cue The cue that arrives.
 * @returns The cue that is giving way, or the one that already was.
 */
function givingWayTo(kept: Kept, cue: SpokenCue): SpokenCue | null {
	return kept.live && replaces(cue, kept.shown) ? kept.shown : kept.replaced;
}

/**
 * What is kept once the cue is what it is.
 * @param kept What was kept.
 * @param cue The cue that holds the latest word, or null once the subtitle has lingered.
 * @returns What to keep, which is what was kept when nothing changed.
 */
function keptFor(kept: Kept, cue: SpokenCue | null): Kept {
	if (cue === null) return kept.live ? { ...kept, live: false } : kept;
	if (cue === kept.shown) return kept.live ? kept : { ...kept, live: true };
	return { shown: cue, replaced: givingWayTo(kept, cue), live: true };
}

/**
 * The cue to draw, and the one it replaced.
 * @param cue The cue that holds the latest word, or null once the subtitle has lingered.
 * @returns What to draw.
 */
function useSubtitleFade(cue: SpokenCue | null): SubtitleFade {
	const [kept, setKept] = useState<Kept>({ shown: cue, replaced: null, live: cue !== null });
	const next = keptFor(kept, cue);
	if (next !== kept) setKept(next);
	const clearShown = useCallback((): void => {
		setKept((current) => ({ ...current, shown: null }));
	}, []);
	const clearReplaced = useCallback((): void => {
		setKept((current) => ({ ...current, replaced: null }));
	}, []);
	useAfter(cue === null ? kept.shown : null, SUBTITLE_MS.out, clearShown);
	useAfter(kept.replaced, SUBTITLE_MS.swap, clearReplaced);
	return { shown: cue ?? kept.shown, replaced: kept.replaced };
}

export { useSubtitleFade, type SubtitleFade };
