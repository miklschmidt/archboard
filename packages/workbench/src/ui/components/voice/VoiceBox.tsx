// The voice, where it is read.
//
// While the person wants subtitles and a voice is live, the voice has no circle in the
// agent dock. It sits in a box over the picture of the pane it runs for, where the
// subtitles are, so whoever reads the words sees the voice that says them. The box
// is a capsule that hugs the orb: its left end is a half circle round the orb's socket,
// and at its right end are the two controls that belong with the words, one above the
// other, mute and the subtitles control, which puts the voice back in the dock. They are
// the dock's keys. They stand the margin in from the box's edge that the orb does, and the
// same margin from each other, as one stack as high as the orb. The stack is a half circle
// on its right, round the same middle as the box's own end, so each key is a quarter of it:
// straight on the side that looks into the box and where the two face each other, with the
// corner of a key at the two corners that look into the box (app.css, `voice-keys`).
// The box is click-through except for them, because the canvas under it is what the
// person is working with. It is as high as the plain subtitles were and wider by the
// orb and the keys, so it hides little that they did not, and in a pane too narrow for
// it the words give way and the orb and the keys stay.
//
// At the foot of a presented walkthrough's box (TASK-392) it has no skin of its own: the box's
// pill is its skin, and it is drawn in it, and it fades where it stands. The pill is as wide as the
// words above it, so the words take the width the orb and the keys leave, a little farther from the
// orb than they stand in the capsule. A fullscreen
// presentation has no dock to take the voice back, so the box carries it there whatever the
// person wants of subtitles, and the subtitles control then decides only whether there are words.
// A recording is drawn with this same box at the foot of the same walkthrough box
// (apps/web/src/ui/clients/walkthrough-replay): the orb follows the recorded voice, and the keys are drawn as here,
// with nobody to press them.
//
// The box comes with the voice and leaves with it. It stays mounted while it leaves,
// so it eases away with the orb's flight out of it, and it takes no input while it
// does: it is inert. The dock tells the stage that flies the orb where it goes
// (`state/orb/orb-stage.ts`), by the rule the box asks too (useVoiceBoxed), once the box has
// offered the stage its socket.

import type { CSSProperties, JSX } from "react";

import {
	SUBTITLE_BACK_MS,
	SUBTITLE_OUT_MS,
	VOICE_BOX_IN_MS,
	VOICE_BOX_OUT_MS,
	VOICE_WORD_IN_MS,
} from "@archboard/timing/voice";
import { cn } from "@archboard/ui-kit/components";
import { OrbSlot } from "#ui/components/orb/OrbStage.tsx";
import { SubtitleWords } from "#ui/components/subtitles/VoiceSubtitles.tsx";
import { SubtitlesToggle } from "#ui/components/subtitles/SubtitlesToggle.tsx";
import { type SubtitleSource } from "#ui/hooks/subtitles/use-voice-subtitles.ts";
import { MuteAction, type MuteActions } from "#ui/components/voice/MuteAction.tsx";
import type { AgentVoiceView } from "#ui/state/surfaces/contracts.ts";
import { useCircleState } from "#ui/hooks/dock/use-circle-state.ts";
import { useVoiceBoxPresence } from "#ui/hooks/voice/use-voice-box-presence.ts";
import { VOICE_WORDS, type CircleState } from "#ui/rules/dock/circle-state.ts";

/**
 * The durations the stylesheet eases the box by (app.css, `voice-box`), and the ones the voice's
 * word shares with the words: it waits for them to fade out before it fades in, and leaves as
 * fast as they come back.
 */
const BOX_STYLE: CSSProperties = {
	"--voice-box-in-ms": `${VOICE_BOX_IN_MS}ms`,
	"--voice-box-out-ms": `${VOICE_BOX_OUT_MS}ms`,
	"--voice-word-in-ms": `${VOICE_WORD_IN_MS}ms`,
	"--subtitle-out-ms": `${SUBTITLE_OUT_MS}ms`,
	"--subtitle-back-ms": `${SUBTITLE_BACK_MS}ms`,
};

/**
 * A key at the end of the box: the dock's key (outlined, raised, sunk while pressed), in the
 * share of the stack that is its own. Its glyph sits a little left of the middle, where the
 * quarter circle it is leaves the most room. Its hit area runs into the margin between it and
 * its neighbour as far as the middle of it, so there is no dead strip between them.
 */
const CAP_KEY = cn(
	"text-muted-foreground relative size-auto min-h-0 flex-1 px-0 pr-1.5",
	"hover:text-foreground after:inset-x-0 after:-inset-y-[3px]",
	"[&_svg:not([class*='size-'])]:size-4",
);

/** A key that is on, and so is down: the voice is muted. */
const CAP_KEY_ON = "bg-muted text-foreground shadow-pressed";

/**
 * Where the box is drawn: free over the picture, in a skin of its own, or in the pill at the foot of a
 * presented walkthrough's box, in that pill's.
 */
type VoiceBoxPlace = "free" | "foot";

/** How each place draws the box's own surface. */
const SKINS: Readonly<Record<VoiceBoxPlace, string>> = {
	free: "bg-card border-border shadow-float relative max-w-full rounded-full border",
	foot: "relative h-full min-w-0 flex-1 rounded-full",
};

/** Inputs for the voice box. */
interface VoiceBoxProps {
	readonly voice: AgentVoiceView;
	/** What its keys do to the voice. */
	readonly actions: MuteActions;
	/** What the voice has said, for the subtitles inside. */
	readonly transcript: readonly SubtitleSource[];
	/** Whether the person asked for no motion: the box then comes and goes at once. */
	readonly reducedMotion: boolean;
	/** Whether the box is wanted. It stays on the page for as long as it takes to leave. */
	readonly shown: boolean;
	/** Where it is drawn. */
	readonly place: VoiceBoxPlace;
}

/**
 * The voice box, while it is wanted and while it leaves.
 * @param props The voice, the actions, what was said, the motion preference, whether it is wanted and where.
 * @returns The box, or null when it is not on the page.
 */
function VoiceBox(props: VoiceBoxProps): JSX.Element | null {
	const mounted = useVoiceBoxPresence(props.shown, props.reducedMotion ? 0 : VOICE_BOX_OUT_MS);
	return mounted ? <Box {...props} /> : null;
}

/**
 * The box itself.
 * @param props The voice, the actions, what was said, the motion preference, whether it is wanted and where.
 * @returns The box.
 */
function Box(props: VoiceBoxProps): JSX.Element {
	const state = useCircleState(props.voice);
	return (
		<section
			aria-label="Voice"
			data-slot="voice-box"
			data-place={props.place}
			data-lit-by-orb=""
			data-voice-state={state}
			data-leaving={props.shown ? undefined : ""}
			data-still={props.reducedMotion ? "" : undefined}
			inert={!props.shown}
			style={BOX_STYLE}
			className={cn("pointer-events-none isolate flex items-stretch", SKINS[props.place])}
		>
			<OrbSlot home="box" className="relative m-1.5 size-16 shrink-0 self-center" />
			<div
				data-slot="voice-words"
				className={cn(
					"mr-3 grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] items-center self-center",
					props.place === "foot" ? "ml-3" : "ml-1.5",
				)}
			>
				<SubtitleWords
					transcript={props.transcript}
					reducedMotion={props.reducedMotion}
					className={cn("col-start-1 row-start-1 max-w-full", props.place === "foot" && "w-full")}
				/>
				<VoiceWord state={state} />
			</div>
			<Cap voice={props.voice} actions={props.actions} muted={state === "muted"} />
		</section>
	);
}

/**
 * The two keys at the box's right end: mute above, the subtitles control below, a margin in from
 * the box's edge and from each other, and as high together as the orb.
 * @param props The voice, the actions and whether the voice is muted.
 * @param props.voice The voice.
 * @param props.actions The actions.
 * @param props.muted Whether the voice is muted, which sinks the mute key.
 * @returns The end of the box.
 */
function Cap(props: {
	readonly voice: AgentVoiceView;
	readonly actions: MuteActions;
	readonly muted: boolean;
}): JSX.Element {
	return (
		<div
			data-slot="voice-keys"
			className="pointer-events-auto m-1.5 ml-0 flex h-16 w-11 shrink-0 flex-col gap-1.5 self-center"
		>
			<MuteAction
				keyed
				voice={props.voice}
				actions={props.actions}
				tipSide="left"
				className={cn(CAP_KEY, props.muted && CAP_KEY_ON)}
			/>
			<SubtitlesToggle keyed tipSide="left" className={CAP_KEY} />
		</div>
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
				data-slot="voice-word"
				className={cn(
					"text-control col-start-1 row-start-1 px-1 font-medium",
					lit ? "text-primary-text" : "text-muted-foreground",
				)}
			>
				{word}
			</span>
		</>
	);
}

export { VoiceBox, type VoiceBoxPlace, type VoiceBoxProps };
