// The voice key of a fullscreen presentation's bar: Talk while voice is off, which sets up whatever
// is missing before it listens, and End voice while it is on. A presented pane has no dock, so the
// voice itself, with its orb, its words, mute and subtitles, is in the voice box over the picture or
// at the foot of the walkthrough's box (TASK-392), and the bar holds the one key that starts and
// ends it. It never disappears: when voice cannot start it says why beside the key that retries.
// It is one element in every stage, so the key that says Talk turns into the key that says End
// voice and back instead of being swapped for it, and keyboard focus stays on it.

import { RiErrorWarningLine, RiLoader4Line, RiMicLine, RiPhoneLine } from "@remixicon/react";
import type { JSX } from "react";

import { Button, cn } from "@archboard/ui-kit/components";
import type { AgentActions, AgentVoiceView, VoiceStage } from "#ui/state/surfaces/contracts.ts";
import { ENDABLE, voicePress } from "#ui/rules/dock/circle-state.ts";

/** Inputs for the Talk control. */
interface TalkControlProps {
	readonly voice: AgentVoiceView;
	readonly actions: AgentActions;
}

/** Where the element saying why voice cannot start is, for the button it describes. */
const TALK_PROBLEM_ID = "talk-problem";

/**
 * The voice key: Talk, or where getting voice going stands, and End voice once it connects, with
 * its edge gold then, as the dock's key is while the voice box carries the voice. A key that does
 * nothing is dimmed and stays focusable (aria-disabled), because a disabled button drops the
 * keyboard's place.
 * @param props The voice and the actions.
 * @returns The key, with why voice cannot start beside it.
 */
function TalkControl(props: TalkControlProps): JSX.Element {
	const { voice, actions } = props;
	const live = ENDABLE.has(voice.stage);
	const problem = live ? null : voice.problem;
	const press = voicePress(voice, actions);
	return (
		<span className="flex min-w-0 shrink items-center gap-2">
			{problem !== null && (
				<span
					id={TALK_PROBLEM_ID}
					title={problem}
					className="text-body text-destructive max-w-72 min-w-0 truncate"
				>
					{problem}
				</span>
			)}
			<Button
				variant="outline"
				size="sm"
				data-voice-key={live ? "live" : "talk"}
				disabled={press === undefined}
				focusableWhenDisabled
				onClick={press}
				aria-describedby={problem === null ? undefined : TALK_PROBLEM_ID}
				className={cn(
					"rounded-control h-7 shrink-0 gap-1.5 px-2.5 aria-disabled:opacity-50 aria-disabled:shadow-none",
					live && "border-primary-mark",
				)}
			>
				<KeyMark stage={voice.stage} problem={problem !== null} />
				{KEY_WORDS[voice.stage]}
			</Button>
		</span>
	);
}

/** What the key says: Talk at rest, where getting voice going stands, and End voice once it connects. */
const KEY_WORDS: Readonly<Record<VoiceStage, string>> = {
	idle: "Talk",
	preparing: "Starting",
	connecting: "End voice",
	listening: "End voice",
	speaking: "End voice",
	muted: "End voice",
	stopping: "Ending",
};

/**
 * What the key holds: the microphone at rest, a warning when voice cannot start, a spinner on the
 * way, and the hung-up handset once voice connects.
 * @param props The stage and whether something is wrong.
 * @param props.stage The stage.
 * @param props.problem Whether voice cannot start or failed.
 * @returns The mark.
 */
function KeyMark(props: { readonly stage: VoiceStage; readonly problem: boolean }): JSX.Element {
	if (ENDABLE.has(props.stage)) {
		return <RiPhoneLine aria-hidden="true" className="size-3.5 rotate-[135deg]" />;
	}
	if (props.stage !== "idle") {
		return <RiLoader4Line aria-hidden="true" className="size-3.5 motion-safe:animate-spin" />;
	}
	return props.problem ? (
		<RiErrorWarningLine aria-hidden="true" className="text-destructive size-3.5" />
	) : (
		<RiMicLine aria-hidden="true" className="size-3.5" />
	);
}

export { TalkControl, type TalkControlProps };
