// The subtitle on screen right now.
//
// The voice model's transcript arrives a word at a time on the audio clock (see `lib/recency`),
// so the subtitle is the cue holding the latest word received, shown as it arrives. The only
// thing the clock decides is when a subtitle that has stopped growing goes, and one timer does
// that. Cue cutting and the recency rule are pure and live beside this.

import { useEffect, useMemo, useState } from "react";

import { SUBTITLE_LINGER_MS } from "@/shared/timing/timing";
import { cuesOf, wordsOf, type SubtitleCue } from "@/ui/voice-subtitles/lib/cues";
import {
	progressMark,
	subtitleShowing,
	type SubtitleProgress,
} from "@/ui/voice-subtitles/lib/recency";

/** One transcript entry, as far as subtitles read it. */
interface SubtitleSource {
	readonly itemId: string;
	readonly speaker: "user" | "assistant";
	readonly text: string;
	readonly final: boolean;
}

/** The voice model's latest utterance, cut into cues. */
interface Utterance extends SubtitleProgress {
	readonly cues: readonly SubtitleCue[];
}

/** The voice model has said nothing. */
const NOTHING_SAID: Utterance = Object.freeze({ itemId: null, words: 0, cues: [] });

/**
 * What the voice model is saying, cut into cues. What the person says is never subtitled.
 * @param transcript The transcript, oldest first.
 * @returns The latest assistant utterance and its cues.
 */
function latestUtterance(transcript: readonly SubtitleSource[]): Utterance {
	const said = transcript.findLast((entry) => entry.speaker === "assistant");
	if (said === undefined) {
		return NOTHING_SAID;
	}
	const words = wordsOf(said.text);
	return { itemId: said.itemId, words: words.length, cues: cuesOf(words) };
}

/**
 * The subtitle on screen right now. Mounted only while subtitles are wanted, so that turning
 * them on mid-utterance begins watching from there rather than replaying what was said.
 * @param transcript The voice session's transcript, oldest first.
 * @returns The cue holding the latest word received, or null when nothing is shown.
 */
function useVoiceSubtitles(transcript: readonly SubtitleSource[]): SubtitleCue | null {
	const utterance = useMemo(() => latestUtterance(transcript), [transcript]);
	const mark = progressMark(utterance);
	const [from] = useState(mark);
	const [lapsed, setLapsed] = useState<string | null>(null);

	useEffect(() => {
		const timer = setTimeout(() => {
			setLapsed(mark);
		}, SUBTITLE_LINGER_MS);
		return (): void => {
			clearTimeout(timer);
		};
	}, [mark]);

	return subtitleShowing(utterance, { from, lapsed }) ? (utterance.cues.at(-1) ?? null) : null;
}

export { useVoiceSubtitles, type SubtitleSource };
