// What the voice is saying, laid over the picture.
//
// A subtitle is read at a glance by somebody looking at a diagram, so it is one cue of two lines
// at most, low in the frame, on a scrim that keeps it legible over any picture. Words arrive one
// at a time as they are spoken, so the cue is set the way live captions are: a box of fixed
// width and height with the text running from its left edge, where a word arriving never moves
// the ones before it. The box stays in place, empty and invisible, while nothing is said, because
// where it breaks its lines is measured from it (TASK-307). It takes no pointer input, because the canvas under it is what the person
// is working with, and it is hidden from assistive technology, because the same words are
// already being spoken and the transcript panel is the accessible record of them.

import { useCallback, useState, type JSX } from "react";

import { cn } from "@/ui/components/class-names";
import {
	useVoiceSubtitles,
	type SubtitleSource,
} from "@/ui/voice-subtitles/hooks/use-voice-subtitles";
import type { LineCount } from "@/ui/voice-subtitles/lib/cues";
import { faceLoading, lineCountOf } from "@/ui/voice-subtitles/lib/measured-lines";

/** Inputs for the subtitles. */
interface VoiceSubtitlesProps {
	/** The voice session's transcript, oldest first. */
	readonly transcript: readonly SubtitleSource[];
	/** Whether subtitles are wanted at all. */
	readonly enabled: boolean;
	/** Whether the person asked for reduced motion, which cuts the newest word's fade. */
	readonly reducedMotion: boolean;
}

/**
 * The subtitle box while subtitles are wanted: the cue on screen, or nothing visible.
 * @param props The transcript and motion.
 * @returns The box.
 */
function LiveSubtitles(props: Omit<VoiceSubtitlesProps, "enabled">): JSX.Element {
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
	const arriving = props.reducedMotion ? undefined : "animate-in fade-in duration-150";
	return (
		<p
			ref={measure}
			data-slot="voice-subtitles"
			aria-hidden="true"
			className={cn(
				"bg-background/85 text-foreground text-subtitle border-border pointer-events-none box-content h-[56px] w-[46ch] overflow-hidden rounded-md border px-5 py-2.5 text-left shadow-sm backdrop-blur-sm",
				cue === null && "invisible",
			)}
		>
			{cue?.words.map((word, index) => (
				<span
					// A cue's words never reorder, and a cue is replaced whole.
					// oxlint-disable-next-line react/no-array-index-key
					key={`${cue.start}:${index}`}
					className={arriving}
				>
					{index === 0 ? word : ` ${word}`}
				</span>
			))}
		</p>
	);
}

/**
 * The subtitle on screen, or nothing.
 * @param props The transcript, whether subtitles are wanted, and motion.
 * @returns The subtitle, or null while they are off or the voice is saying nothing.
 */
function VoiceSubtitles(props: VoiceSubtitlesProps): JSX.Element | null {
	return props.enabled ? (
		<LiveSubtitles transcript={props.transcript} reducedMotion={props.reducedMotion} />
	) : null;
}

export { VoiceSubtitles, type VoiceSubtitlesProps };
