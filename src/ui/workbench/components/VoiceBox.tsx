// The voice, where it is read.
//
// While the person wants subtitles and a voice is live, the voice has no circle in the
// agent dock. It sits in a box over the picture of the pane it runs for, where the
// subtitles are, so whoever reads the words sees the voice that says them. The box
// holds the orb in a socket, the voice's state in a word while there are no words, the
// words themselves, and the two controls that belong with them: mute, and the
// subtitles control, which puts the voice back in the dock. It is click-through
// except for those two controls, because the canvas under it is what the person is
// working with, and it takes no more room than the subtitles did, so it hides
// nothing they did not.
//
// The box comes with the voice and leaves with it. It stays mounted while it leaves,
// so it eases away with the orb's flight out of it, and the stage that flies the orb
// is told where it goes by the preference alone (src/ui/voice-orb).

import type { CSSProperties, JSX } from "react";

import { CAPTION_OUT_MS, VOICE_BOX_IN_MS, VOICE_BOX_OUT_MS } from "@/shared/timing/voice";
import { cn } from "@/ui/components/class-names";
import { OrbSlot } from "@/ui/voice-orb";
import { Captions, SubtitlesToggle, type SubtitleSource } from "@/ui/voice-subtitles";
import { MuteAction } from "@/ui/workbench/components/MuteAction";
import type { AgentActions, AgentVoiceView } from "@/ui/workbench/contracts";
import { useCircleState } from "@/ui/workbench/hooks/use-circle-state";
import { useVoiceBoxPresence } from "@/ui/workbench/hooks/use-voice-box-presence";
import { VOICE_WORDS, type CircleState } from "@/ui/workbench/lib/circle-state";

/**
 * The durations the stylesheet eases the box by (app.css, `voice-box`), and how long the words
 * take to fade out, which the voice's word waits for before it fades in.
 */
const BOX_STYLE: CSSProperties = {
	"--voice-box-in-ms": `${VOICE_BOX_IN_MS}ms`,
	"--voice-box-out-ms": `${VOICE_BOX_OUT_MS}ms`,
	"--caption-out-ms": `${CAPTION_OUT_MS}ms`,
};

/** Inputs for the voice box. */
interface VoiceBoxProps {
	readonly voice: AgentVoiceView;
	readonly actions: AgentActions;
	/** What the voice has said, for the subtitles inside. */
	readonly transcript: readonly SubtitleSource[];
	/** Whether the person asked for no motion: the box then comes and goes at once. */
	readonly reducedMotion: boolean;
	/** Whether the box is wanted. It stays on the page for as long as it takes to leave. */
	readonly shown: boolean;
}

/**
 * The voice box, while it is wanted and while it leaves.
 * @param props The voice, the actions, what was said, the motion preference and whether it is wanted.
 * @returns The box, or null when it is not on the page.
 */
function VoiceBox(props: VoiceBoxProps): JSX.Element | null {
	const mounted = useVoiceBoxPresence(props.shown, props.reducedMotion ? 0 : VOICE_BOX_OUT_MS);
	return mounted ? <Box {...props} /> : null;
}

/**
 * The box itself.
 * @param props The voice, the actions, what was said, the motion preference and whether it is wanted.
 * @returns The box.
 */
function Box(props: VoiceBoxProps): JSX.Element {
	const { voice, actions } = props;
	const state = useCircleState(voice);
	return (
		<section
			aria-label="Voice"
			data-slot="voice-box"
			data-lit-by-orb=""
			data-voice-state={state}
			data-leaving={props.shown ? undefined : ""}
			data-still={props.reducedMotion ? "" : undefined}
			style={BOX_STYLE}
			className="group/box bg-card/96 border-border rounded-panel shadow-float pointer-events-none relative isolate flex items-center gap-3 border py-1.5 pr-2 pl-1.5"
		>
			<OrbSlot
				home="caption"
				className="border-primary-mark bg-card shadow-raised group-data-[voice-state=muted]/box:border-border relative size-16 shrink-0 rounded-full border"
			/>
			<div className="group/words grid min-w-0 items-center">
				<Captions
					transcript={props.transcript}
					reducedMotion={props.reducedMotion}
					className="col-start-1 row-start-1"
				/>
				<VoiceWord state={state} />
			</div>
			<div className="pointer-events-auto flex flex-col items-center gap-1">
				<MuteAction voice={voice} actions={actions} />
				<SubtitlesToggle />
			</div>
		</section>
	);
}

/**
 * What the voice is doing, in a word, while there are no words to read, and always to
 * a screen reader. The words take its place as they arrive.
 * @param props The voice's state.
 * @param props.state The state.
 * @returns The word, seen and heard.
 */
function VoiceWord(props: { readonly state: CircleState }): JSX.Element {
	const word = VOICE_WORDS[props.state];
	const lit = props.state !== "muted" && props.state !== "ending";
	return (
		<>
			<output aria-live="polite" className="sr-only">
				{word}
			</output>
			<span
				aria-hidden="true"
				className={cn(
					// The word waits for the words to fade out before it fades in, and leaves at once when they return.
					"text-control col-start-1 row-start-1 px-1 font-medium transition-opacity [transition-delay:var(--caption-out-ms)] duration-300",
					"group-has-[[data-showing=true]]/words:opacity-0 group-has-[[data-showing=true]]/words:[transition-delay:0ms] group-has-[[data-showing=true]]/words:duration-100",
					lit ? "text-primary-text" : "text-muted-foreground",
				)}
			>
				{word}
			</span>
		</>
	);
}

export { VoiceBox, type VoiceBoxProps };
