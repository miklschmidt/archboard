// The subtitle on screen right now.
//
// The voice model's transcript arrives a word at a time on the audio clock (see `rules/subtitles/recency.ts`),
// so the subtitle is the cue holding the latest word received, shown as it arrives. The only
// thing the clock decides is when a subtitle that has stopped growing goes, and one timer on the
// frame clock does that. Cue cutting and the recency rule are pure and live beside this; where
// the box breaks its lines is measured by its component and handed in.

import { useEffect, useMemo, useState } from "react";

import { SUBTITLE_MS } from "@archboard/timing";
import { frameClock } from "@archboard/ui-kit/frame-clock";
import { cuesOf, wordsOf, type LineCount, type SubtitleCue } from "#ui/rules/subtitles/cues.ts";
import {
	progressMark,
	subtitleShowing,
	type SubtitleProgress,
} from "#ui/rules/subtitles/recency.ts";

/** One transcript entry, as far as subtitles read it. */
interface SubtitleSource {
	readonly itemId: string;
	readonly speaker: "user" | "assistant";
	readonly text: string;
	readonly final: boolean;
}

/** A cue, and which utterance it is part of: a cue is told apart by both. */
type SpokenCue = SubtitleCue & { readonly item: string };

/** The voice model's latest utterance, cut into cues. */
interface Utterance extends SubtitleProgress {
	readonly cues: readonly SpokenCue[];
}

/** The voice model has said nothing. */
const NOTHING_SAID: Utterance = Object.freeze({ itemId: null, words: 0, cues: [] });

/**
 * What the voice model is saying, cut into cues. What the person says is never subtitled.
 * @param transcript The transcript, oldest first.
 * @param lines How many lines a text takes in the subtitle box, or null before it is measured.
 * @returns The latest assistant utterance and its cues, which are none before the box is measured.
 */
function latestUtterance(
	transcript: readonly SubtitleSource[],
	lines: LineCount | null,
): Utterance {
	const said = transcript.findLast((entry) => entry.speaker === "assistant");
	if (said === undefined) {
		return NOTHING_SAID;
	}
	const words = wordsOf(said.text);
	return {
		itemId: said.itemId,
		words: words.length,
		cues: lines === null ? [] : cuesOf(words, lines).map((cue) => ({ ...cue, item: said.itemId })),
	};
}

/**
 * The subtitle on screen right now. Mounted only while subtitles are wanted, so that turning
 * them on mid-utterance begins watching from there rather than replaying what was said.
 * @param transcript The voice session's transcript, oldest first.
 * @param lines How many lines a text takes in the subtitle box, or null before it is measured.
 * @returns The cue holding the latest word received, or null when nothing is shown.
 */
function useVoiceSubtitles(
	transcript: readonly SubtitleSource[],
	lines: LineCount | null,
): SpokenCue | null {
	const utterance = useMemo(() => latestUtterance(transcript, lines), [transcript, lines]);
	const mark = progressMark(utterance);
	const [from] = useState(mark);
	const [lapsed, setLapsed] = useState<string | null>(null);

	useEffect(() => {
		const clock = frameClock();
		const timer = clock.after(SUBTITLE_MS.linger, () => {
			setLapsed(mark);
		});
		return (): void => {
			clock.cancelAfter(timer);
		};
	}, [mark]);

	return subtitleShowing(utterance, { from, lapsed }) ? (utterance.cues.at(-1) ?? null) : null;
}

export { useVoiceSubtitles, type SpokenCue, type SubtitleSource };
