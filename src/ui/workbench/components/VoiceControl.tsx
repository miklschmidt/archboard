// The voice, seen and controlled in one place, by one button. While voice is
// off the button is a key that says Talk; pressing it starts voice, setting up
// whatever is missing first. Once voice is on, the same button is the voice
// circle at the head of the agent dock, and pressing it ends voice. It is one
// element in both layouts, so the key turns into the circle instead of being
// swapped for it, and keyboard focus stays on it. The dock's motion moves its
// plate between the two shapes (hooks/use-dock-motion.ts); the voice orb draws
// the circle's face (src/ui/voice-orb).
//
// The orb follows the model's measured output level while it speaks and breathes
// while it listens. Nothing here listens to the microphone.

import { RiErrorWarningLine, RiMicLine } from "@remixicon/react";
import type { JSX } from "react";

import { cn } from "@/ui/components/class-names";
import { VoiceOrb, type OrbMode } from "@/ui/voice-orb";
import { useAudible } from "@/ui/workbench/components/TalkControl";
import type { AgentActions, AgentVoiceView } from "@/ui/workbench/contracts";

/** What the circle shows, from the voice's stage. */
type CircleState = OrbMode;

/** What the circle shows for each stage of the voice, where the stage alone decides it. */
const STAGE_STATES: Partial<Readonly<Record<AgentVoiceView["stage"], CircleState>>> = {
	idle: "off",
	preparing: "starting",
	connecting: "starting",
	stopping: "ending",
	muted: "muted",
	speaking: "speaking",
};

/**
 * What the circle shows for a voice: its stage, else whether the model is
 * audible by its measured output, which is how a listening voice is heard to speak.
 * @param voice The voice.
 * @param audible Whether the model is audible now.
 * @returns The state.
 */
function circleState(voice: AgentVoiceView, audible: boolean): CircleState {
	return STAGE_STATES[voice.stage] ?? (audible ? "speaking" : "listening");
}

/** What pressing the control does, said as its name. */
const CIRCLE_NAMES: Readonly<Record<CircleState, string>> = {
	off: "Talk",
	starting: "End voice",
	listening: "End voice",
	speaking: "End voice",
	muted: "End voice",
	ending: "Ending voice",
};

/** What the voice is doing, in a word, for the dock's voice line. */
const VOICE_WORDS: Readonly<Record<CircleState, string>> = {
	off: "Voice is off",
	starting: "Starting",
	listening: "Listening",
	speaking: "Speaking",
	muted: "Muted",
	ending: "Ending",
};

/**
 * The plate as the key: an outline button's face. As the circle it is the same
 * raised plate without the edge (app.css), under the orb's ring.
 */
const PLATE = cn(
	"rounded-control border-border bg-card shadow-raised absolute inset-0 border",
	"dark:border-input dark:bg-input/30 transition-[border-color,background-color,box-shadow]",
	"group-hover/voice:border-primary-mark group-active/voice:shadow-pressed",
	"group-focus-visible/voice:ring-ring group-focus-visible/voice:ring-2 group-focus-visible/voice:ring-offset-2 group-focus-visible/voice:ring-offset-(--raised)",
	"group-disabled/voice:opacity-50",
);

/** Inputs for the voice control. */
interface VoiceControlProps {
	readonly voice: AgentVoiceView;
	readonly actions: AgentActions;
	/** Where the words saying why voice cannot start are, for the control they describe. */
	readonly problemId: string;
	/** Whether the person asked for no motion. */
	readonly reducedMotion: boolean;
}

/**
 * The voice control: Talk while voice is off, the circle that ends it while it is on.
 * @param props The voice, the actions, where its problem is said and the motion preference.
 * @returns The button.
 */
function VoiceControl(props: VoiceControlProps): JSX.Element {
	const { voice, actions } = props;
	const state = circleState(voice, useAudible(voice));
	const off = state === "off";
	return (
		<button
			type="button"
			data-slot="voice-circle"
			data-part="voice"
			data-voice-state={state}
			aria-label={CIRCLE_NAMES[state]}
			aria-describedby={voice.problem === null ? undefined : props.problemId}
			title={off ? undefined : CIRCLE_NAMES[state]}
			disabled={state === "ending" || voice.busy}
			onClick={off ? actions.talk : actions.endVoice}
			className="group/voice relative outline-none"
		>
			<span aria-hidden="true" data-part="plate" className={PLATE}>
				<span
					data-part="orb"
					className="pointer-events-none absolute top-1/2 left-1/2 -translate-1/2"
				>
					<VoiceOrb mode={state} level={voice.level.read} reducedMotion={props.reducedMotion} />
				</span>
			</span>
			<span
				data-part="label"
				className="text-control relative flex items-center justify-center gap-2 font-medium"
			>
				<OffMark problem={voice.problem !== null} />
				{CIRCLE_NAMES.off}
			</span>
		</button>
	);
}

/**
 * What the key holds while voice is off: the microphone, or a warning when
 * voice could not start.
 * @param props Whether something is wrong.
 * @param props.problem Whether voice cannot start or failed.
 * @returns The mark.
 */
function OffMark(props: { readonly problem: boolean }): JSX.Element {
	return props.problem ? (
		<RiErrorWarningLine aria-hidden="true" className="text-destructive size-4" />
	) : (
		<RiMicLine
			aria-hidden="true"
			className="text-muted-foreground group-hover/voice:text-primary-mark size-4 transition-colors"
		/>
	);
}

export { VOICE_WORDS, VoiceControl, circleState, type CircleState, type VoiceControlProps };
