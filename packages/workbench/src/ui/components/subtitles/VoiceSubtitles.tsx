// What the voice is saying, laid over the picture.
//
// A subtitle is read at a glance by somebody looking at a diagram, so it is one cue of two lines
// at most, low in the frame. Words arrive one at a time as they are spoken, so the cue is set the
// way live subtitles are: a box of fixed width and height with the text running from its left edge,
// where a word arriving never moves the ones before it. Each word fades in, slowly enough to be
// seen coming and quickly enough not to lag the voice; a cue gives way to the next with its lines
// fading under the new first word; and a subtitle that has stopped growing fades out. The
// box stays in place, empty and invisible, while nothing is said, because where it breaks its lines
// is measured from it (TASK-307). It takes no pointer input, because the canvas under it is what the
// person is working with, and it is hidden from assistive technology, because the same words are
// already being spoken and the transcript panel is the accessible record of them.
//
// `SubtitleWords` is the paragraph alone, which the voice box carries inside its own glass, in the
// shell and in the replay of a kept talk. `VoiceSubtitles` is the paragraph in glass of its own, or
// bare in the pill of a presented walkthrough's box, for the page that records a talk, which nobody
// sees.

import type { CSSProperties, JSX } from "react";

import {
	SUBTITLE_BACK_MS,
	SUBTITLE_OUT_MS,
	SUBTITLE_SWAP_MS,
	SUBTITLE_WORD_MS,
} from "@archboard/timing/voice";
import { cn } from "@archboard/ui-kit/components";
import { useMeasuredLines } from "#ui/hooks/subtitles/use-measured-lines.ts";
import { useSubtitleFade } from "#ui/hooks/subtitles/use-subtitle-fade.ts";
import { useVoiceSubtitles, type SubtitleSource } from "#ui/hooks/subtitles/use-voice-subtitles.ts";

/** The durations the stylesheet eases the words by (app.css, `voice-subtitles`). */
const SUBTITLE_STYLE: CSSProperties = {
	"--subtitle-word-ms": `${SUBTITLE_WORD_MS}ms`,
	"--subtitle-swap-ms": `${SUBTITLE_SWAP_MS}ms`,
	"--subtitle-out-ms": `${SUBTITLE_OUT_MS}ms`,
	"--subtitle-back-ms": `${SUBTITLE_BACK_MS}ms`,
};

/** The glass a subtitle has when no voice box carries it. */
const GLASS =
	"bg-card/96 border-border rounded-panel pointer-events-none border px-5 py-2.5 shadow-float";

/** What sets the words in the pill of a presented walkthrough's box, which is their glass. */
const BARE = "pointer-events-none mx-6 self-center";

/** Inputs for the words. */
interface SubtitleWordsProps {
	/** The voice session's transcript, oldest first. */
	readonly transcript: readonly SubtitleSource[];
	/** Whether the person asked for reduced motion, which cuts the fades. */
	readonly reducedMotion: boolean;
	/** What sets the paragraph in its surroundings, and gives it glass when it has none. */
	readonly className?: string;
}

/** Inputs for the subtitles. */
interface VoiceSubtitlesProps {
	/** The voice session's transcript, oldest first. */
	readonly transcript: readonly SubtitleSource[];
	/** Whether subtitles are wanted at all. */
	readonly enabled: boolean;
	/** Whether the person asked for reduced motion, which cuts the fades. */
	readonly reducedMotion: boolean;
	/** Whether the words are drawn without glass, in a pill that is theirs, at the foot of a presented walkthrough's box. */
	readonly bare?: boolean;
}

/**
 * The words on screen: the cue being said, or the last one while it fades. It is measured for
 * where it breaks its lines, in the face it is drawn in, once that face has loaded and again
 * whenever its width changes.
 * @param props The transcript, the motion preference and what places the paragraph.
 * @returns The paragraph.
 */
function SubtitleWords(props: SubtitleWordsProps): JSX.Element {
	const { ref, lines } = useMeasuredLines();
	const cue = useVoiceSubtitles(props.transcript, lines);
	const { shown, replaced } = useSubtitleFade(cue);
	const fades = !props.reducedMotion;
	return (
		<p
			ref={ref}
			data-slot="voice-subtitles"
			data-showing={cue !== null}
			data-still={fades ? undefined : ""}
			aria-hidden="true"
			style={SUBTITLE_STYLE}
			className={cn(
				"text-subtitle text-foreground box-content h-[56px] w-[46ch] overflow-hidden text-left",
				props.className,
			)}
		>
			<span className="relative block">
				{replaced !== null && fades && (
					<span data-fade-out="" className="absolute top-0 left-0 w-full">
						{replaced.words.join(" ")}
					</span>
				)}
				{shown?.words.map((word, index) => (
					<span
						// A cue's words never reorder, and a cue is replaced whole.
						// oxlint-disable-next-line react/no-array-index-key
						key={`${shown.item}:${shown.start}:${index}`}
						data-fade={fades ? "" : undefined}
					>
						{index === 0 ? word : ` ${word}`}
					</span>
				))}
			</span>
		</p>
	);
}

/**
 * The subtitle on screen, in glass of its own or bare in a pill that gives it one, or nothing.
 * @param props The transcript, whether subtitles are wanted, motion, and whether it is drawn bare.
 * @returns The subtitle, or null while they are off.
 */
function VoiceSubtitles(props: VoiceSubtitlesProps): JSX.Element | null {
	return props.enabled ? (
		<SubtitleWords
			transcript={props.transcript}
			reducedMotion={props.reducedMotion}
			className={props.bare === true ? BARE : GLASS}
		/>
	) : null;
}

export { SubtitleWords, VoiceSubtitles, type SubtitleWordsProps, type VoiceSubtitlesProps };
