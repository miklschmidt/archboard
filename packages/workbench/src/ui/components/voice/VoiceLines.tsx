// What was said aloud, at the foot of the conversation: the person's words
// and the voice's, as the realtime session transcribed them, one line each,
// with where the session stands. The subtitles show the voice while it
// speaks; this is the record that stays. The latest lines show, and the
// earlier ones open on request.

import { RiMicLine } from "@remixicon/react";
import { useCallback, useState, type JSX } from "react";

import type { BrowserSnapshot } from "@archboard/agent-workbench/contract";

type BrowserVoice = BrowserSnapshot["voice"];

/** How many of the latest lines show before the rest are asked for. */
const LATEST_LINES = 8;

/** Where the session stands, in a word or two. */
const STATE_WORDS: Readonly<Record<BrowserVoice["state"], string>> = {
	unavailable: "ended",
	ready: "ended",
	starting: "starting",
	active: "live",
	recovering: "reconnecting",
	stopping: "ending",
	failed: "failed",
};

/** Inputs for the voice lines. */
interface VoiceLinesProps {
	/** The published snapshot, or null before one arrives. */
	readonly snapshot: BrowserSnapshot | null;
}

/**
 * What was said aloud.
 * @param props The snapshot.
 * @returns The lines, or nothing before anybody spoke.
 */
function VoiceLines(props: VoiceLinesProps): JSX.Element | null {
	const voice = props.snapshot?.voice;
	const [all, setAll] = useState(false);
	const showAll = useCallback(() => setAll(true), []);
	if (voice === undefined || voice.transcript.length === 0) return null;
	const earlier = all ? 0 : Math.max(0, voice.transcript.length - LATEST_LINES);
	return (
		<section
			data-slot="voice-lines"
			aria-label="Said aloud"
			className="border-status/70 flex flex-col gap-1.5 border-l-2 pl-3"
		>
			<VoiceHeading voice={voice} />
			{earlier > 0 && (
				<button
					type="button"
					onClick={showAll}
					className="text-body text-primary-text decoration-primary-mark -mx-1 min-h-6 self-start px-1 font-medium underline underline-offset-2 hover:decoration-2"
				>
					Show {earlier} earlier
				</button>
			)}
			<ol aria-live="polite" className="flex flex-col gap-1">
				{voice.transcript.slice(earlier).map((line) => (
					<li
						key={`${line.itemId}:${line.sequence}`}
						data-speaker={line.speaker}
						aria-busy={!line.final}
						className="flex gap-2"
					>
						<span className="text-body text-muted-foreground w-10 shrink-0 pt-px">
							{line.speaker === "user" ? "You" : "Voice"}
						</span>
						<span
							className={`min-w-0 wrap-break-word ${line.final ? "" : "text-muted-foreground"}`}
						>
							{line.text}
							{line.final ? "" : "…"}
						</span>
					</li>
				))}
			</ol>
		</section>
	);
}

/**
 * The lines' heading: that this is voice, and where the session stands.
 * @param props The voice.
 * @param props.voice The published voice state.
 * @returns The heading.
 */
function VoiceHeading(props: { readonly voice: BrowserVoice }): JSX.Element {
	const { state, reason } = props.voice;
	return (
		<h3 className="text-body text-muted-foreground flex items-center gap-1.5">
			<RiMicLine aria-hidden="true" className="size-3.5" />
			<span className="text-foreground font-semibold">Voice</span>
			<span>· {STATE_WORDS[state]}</span>
			{state === "failed" && reason != null && (
				<span className="text-destructive min-w-0 truncate">{reason}</span>
			)}
		</h3>
	);
}

export { VoiceLines, type VoiceLinesProps };
