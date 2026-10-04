// What the voice is saying, laid over the picture.
//
// A subtitle is read at a glance by somebody looking at a diagram, so it is one cue of two lines
// at most, low in the frame. Words arrive one at a time as they are spoken, so the cue is set the
// way live captions are: a box of fixed width and height with the text running from its left edge,
// where a word arriving never moves the ones before it. Each word fades in, slowly enough to be
// seen coming and quickly enough not to lag the voice; a cue gives way to the next with its lines
// fading under the new first word; and a subtitle that has stopped growing fades out. The
// box stays in place, empty and invisible, while nothing is said, because where it breaks its lines
// is measured from it (TASK-307). It takes no pointer input, because the canvas under it is what the
// person is working with, and it is hidden from assistive technology, because the same words are
// already being spoken and the transcript panel is the accessible record of them.
//
// `Captions` is the paragraph alone, which the voice box carries inside its own glass. `VoiceSubtitles`
// is the paragraph in glass of its own, for a presented pane and for the replay of a kept talk.

import { useCallback, useState, type CSSProperties, type JSX } from "react";

import { CAPTION_OUT_MS, CAPTION_SWAP_MS, CAPTION_WORD_MS } from "@/shared/timing/voice";
import { cn } from "@/ui/components/class-names";
import { useCaptionFade } from "@/ui/voice-subtitles/hooks/use-caption-fade";
import {
	useVoiceSubtitles,
	type SubtitleSource,
} from "@/ui/voice-subtitles/hooks/use-voice-subtitles";
import type { LineCount } from "@/ui/voice-subtitles/lib/cues";
import { faceLoading, lineCountOf } from "@/ui/voice-subtitles/lib/measured-lines";

/** The durations the stylesheet eases the words by (app.css, `voice-subtitles`). */
const CAPTION_STYLE: CSSProperties = {
	"--caption-word-ms": `${CAPTION_WORD_MS}ms`,
	"--caption-swap-ms": `${CAPTION_SWAP_MS}ms`,
	"--caption-out-ms": `${CAPTION_OUT_MS}ms`,
};

/** The glass a subtitle has when no voice box carries it. */
const GLASS =
	"bg-card/96 border-border rounded-panel pointer-events-none border px-5 py-2.5 shadow-float";

/** Inputs for the captions. */
interface CaptionsProps {
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
}

/**
 * The words on screen: the cue being said, or the last one while it fades. It is measured for
 * where it breaks its lines, in the face it is drawn in, once that face has loaded.
 * @param props The transcript, the motion preference and what places the paragraph.
 * @returns The paragraph.
 */
function Captions(props: CaptionsProps): JSX.Element {
	const [lines, setLines] = useState<LineCount | null>(null);
	const measure = useCallback((box: HTMLParagraphElement | null): void => {
		if (box === null) {
			return;
		}
		/** Measure the box in the face it is drawn in. */
		const measured = (): void => {
			setLines(() => lineCountOf(box));
		};
		const loading = faceLoading(box);
		if (loading === null) {
			measured();
		} else {
			void loading.then(measured, measured);
		}
	}, []);
	const cue = useVoiceSubtitles(props.transcript, lines);
	const { shown, replaced } = useCaptionFade(cue);
	const fades = !props.reducedMotion;
	return (
		<p
			ref={measure}
			data-slot="voice-subtitles"
			data-showing={cue !== null}
			data-still={fades ? undefined : ""}
			aria-hidden="true"
			style={CAPTION_STYLE}
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
 * The subtitle on screen, in glass of its own, or nothing.
 * @param props The transcript, whether subtitles are wanted, and motion.
 * @returns The subtitle, or null while they are off.
 */
function VoiceSubtitles(props: VoiceSubtitlesProps): JSX.Element | null {
	return props.enabled ? (
		<Captions transcript={props.transcript} reducedMotion={props.reducedMotion} className={GLASS} />
	) : null;
}

export { Captions, VoiceSubtitles, type CaptionsProps, type VoiceSubtitlesProps };
