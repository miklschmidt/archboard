// The voice, seen and controlled in one place, by one button. While voice is
// off the button is a key that says Talk; pressing it starts voice, setting up
// whatever is missing first. Once voice is on, the same button ends it, and it has
// one of two forms. With the orb at home in the dock it is the voice circle at the
// head of the agent dock. While the voice box over a pane's picture carries the voice
// it is a key again, that says End voice, and the orb is drawn in the box. It is one
// element in every form, so the key turns into the circle instead of being swapped
// for it, and keyboard focus stays on it. The dock's motion moves its plate between
// the shapes (hooks/dock/use-dock-motion.ts); the voice orb draws the circle's face
// (components/orb), and the one orb is drawn here, into a holder that flies it
// between the dock's circle and the box, where the dock says it is wanted.
//
// The orb follows the model's measured output level while it speaks and breathes
// while it listens. Nothing here listens to the microphone.

import { RiErrorWarningLine, RiMicLine, RiPhoneLine } from "@remixicon/react";
import type { JSX } from "react";

import { cn } from "@archboard/ui-kit/components";
import { OrbHost, OrbSlot } from "#ui/components/orb/OrbStage.tsx";
import type { AgentActions, AgentVoiceView } from "#ui/state/surfaces/contracts.ts";
import { useCircleState } from "#ui/hooks/dock/use-circle-state.ts";
import { CIRCLE_NAMES, voicePress, type CircleState } from "#ui/rules/dock/circle-state.ts";

/**
 * The plate as the key: an outline button's face. As the circle it is the same
 * raised plate without the edge (app.css), under the orb's ring.
 */
const PLATE = cn(
	"rounded-control border-border bg-card shadow-raised absolute inset-0 border",
	"dark:border-input dark:bg-input/30 transition-[border-color,background-color,box-shadow]",
	"group-hover/voice:border-primary-mark group-active/voice:shadow-pressed",
	"group-focus-visible/voice:ring-ring group-focus-visible/voice:ring-2 group-focus-visible/voice:ring-offset-2 group-focus-visible/voice:ring-offset-(--raised)",
	"group-aria-disabled/voice:opacity-50",
);

/** Inputs for the voice control. */
interface VoiceControlProps {
	readonly voice: AgentVoiceView;
	readonly actions: AgentActions;
	/** Where the words saying why voice cannot start are, for the control they describe. */
	readonly problemId: string;
	/** Whether the person asked for no motion. */
	readonly reducedMotion: boolean;
	/** Whether the voice box over a pane's picture carries the voice, so the orb is not drawn here. */
	readonly boxed: boolean;
}

/**
 * Which shape the button has: the key, while voice is off and while the voice box has the orb,
 * and the circle while the orb is at home in the dock.
 * @param state What the circle shows.
 * @param boxed Whether the voice box has the voice.
 * @returns The form.
 */
function formOf(state: CircleState, boxed: boolean): "key" | "circle" {
	return state === "off" || boxed ? "key" : "circle";
}

/**
 * The voice control: Talk while voice is off, the circle that ends it while the orb
 * is at home, and the End voice key while the voice box has the orb.
 * @param props The voice, the actions, where its problem is said, the motion preference and where the voice is.
 * @returns The button.
 */
function VoiceControl(props: VoiceControlProps): JSX.Element {
	const { voice, actions, boxed } = props;
	const state = useCircleState(voice);
	const off = state === "off";
	const press = voicePress(voice, actions);
	return (
		<button
			type="button"
			data-slot="voice-circle"
			data-part="voice"
			data-voice-state={state}
			data-form={formOf(state, boxed)}
			aria-label={CIRCLE_NAMES[state]}
			aria-describedby={voice.problem === null ? undefined : props.problemId}
			title={off ? undefined : CIRCLE_NAMES[state]}
			aria-disabled={press === undefined}
			onClick={press}
			className="group/voice relative outline-none"
		>
			<span aria-hidden="true" data-part="plate" className={PLATE}>
				<OrbSlot
					home="dock"
					data-part="orb"
					className="pointer-events-none absolute top-1/2 left-1/2 size-16 -translate-1/2"
				/>
			</span>
			<span
				data-part="label"
				className="text-control relative flex items-center justify-center gap-2 font-medium whitespace-nowrap"
			>
				<KeyMark off={off} problem={voice.problem !== null} />
				{CIRCLE_NAMES[state]}
			</span>
			<OrbHost mode={state} level={voice.level.read} reducedMotion={props.reducedMotion} />
		</button>
	);
}

/**
 * What the key holds: the microphone while voice is off, or a warning when voice
 * could not start, and the hung-up handset while the key ends a voice that is on.
 * @param props Whether voice is off, and whether something is wrong.
 * @param props.off Whether voice is off.
 * @param props.problem Whether voice cannot start or failed.
 * @returns The mark.
 */
function KeyMark(props: { readonly off: boolean; readonly problem: boolean }): JSX.Element {
	if (!props.off) {
		return <RiPhoneLine aria-hidden="true" className="size-4 rotate-[135deg]" />;
	}
	return props.problem ? (
		<RiErrorWarningLine aria-hidden="true" className="text-destructive size-4" />
	) : (
		<RiMicLine
			aria-hidden="true"
			className="text-muted-foreground group-hover/voice:text-primary-mark size-4 transition-colors"
		/>
	);
}

export { VoiceControl, type VoiceControlProps };
