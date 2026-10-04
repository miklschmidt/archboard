// The voice key of a fullscreen presentation's bar: Talk while voice is off, which sets up whatever
// is missing before it listens, and End voice while it is on. A presented pane has no dock, so the
// voice itself, with its orb, its words, mute and subtitles, is in the voice box over the picture or
// at the foot of the walkthrough's box (TASK-392), and the bar holds the one key that starts and
// ends it. It never disappears: when voice cannot start it says why beside the key that retries.

import { RiErrorWarningLine, RiLoader4Line, RiMicLine, RiPhoneLine } from "@remixicon/react";
import type { JSX } from "react";

import { Button } from "@/ui/components/button";
import type { AgentActions, AgentVoiceView, VoiceStage } from "@/ui/workbench/contracts";

/** Inputs for the Talk control. */
interface TalkControlProps {
	readonly voice: AgentVoiceView;
	readonly actions: AgentActions;
}

/** Where the element saying why voice cannot start is, for the button it describes. */
const TALK_PROBLEM_ID = "talk-problem";

/**
 * The stages in which the key ends voice: from the moment voice connects, so a session stuck
 * connecting or recovering can always be ended.
 */
const ENDABLE: ReadonlySet<VoiceStage> = new Set(["connecting", "listening", "speaking", "muted"]);

/**
 * The voice key.
 * @param props The voice and the actions.
 * @returns The key.
 */
function TalkControl(props: TalkControlProps): JSX.Element {
	const { voice, actions } = props;
	return ENDABLE.has(voice.stage) ? (
		<EndButton voice={voice} actions={actions} />
	) : (
		<TalkButton voice={voice} actions={actions} />
	);
}

/**
 * End voice, while it is on or getting there. The edge is gold, as the dock's key is while the voice
 * box carries the voice.
 * @param props The voice and the actions.
 * @param props.voice The voice.
 * @param props.actions The actions.
 * @returns The key.
 */
function EndButton(props: {
	readonly voice: AgentVoiceView;
	readonly actions: AgentActions;
}): JSX.Element {
	return (
		<Button
			variant="outline"
			size="sm"
			data-voice-controls="live"
			className="rounded-control border-primary-mark h-7 gap-1.5 px-2.5"
			onClick={props.actions.endVoice}
			disabled={props.voice.busy}
		>
			<RiPhoneLine aria-hidden="true" className="size-3.5 rotate-[135deg]" />
			End voice
		</Button>
	);
}

/**
 * Talk, or where getting voice going stands.
 * @param props The voice and the actions.
 * @param props.voice The voice.
 * @param props.actions The actions.
 * @returns The button.
 */
function TalkButton(props: {
	readonly voice: AgentVoiceView;
	readonly actions: AgentActions;
}): JSX.Element {
	const { voice, actions } = props;
	const waiting = voice.stage !== "idle";
	return (
		<span className="flex min-w-0 shrink items-center gap-2">
			{voice.problem !== null && (
				<span
					id={TALK_PROBLEM_ID}
					title={voice.problem}
					className="text-body text-destructive max-w-72 min-w-0 truncate"
				>
					{voice.problem}
				</span>
			)}
			<Button
				variant="outline"
				size="sm"
				data-voice-controls="talk"
				disabled={waiting}
				onClick={actions.talk}
				aria-describedby={voice.problem === null ? undefined : TALK_PROBLEM_ID}
				className="rounded-control h-7 shrink-0 gap-1.5 px-2.5"
			>
				<TalkIcon stage={voice.stage} problem={voice.problem !== null} />
				{waiting ? STAGE_WORDS[voice.stage] : "Talk"}
			</Button>
		</span>
	);
}

/** What the button says while voice is on its way. */
const STAGE_WORDS: Readonly<Record<VoiceStage, string>> = {
	idle: "Talk",
	preparing: "Starting",
	connecting: "Connecting",
	listening: "Listening",
	speaking: "Speaking",
	muted: "Muted",
	stopping: "Ending",
};

/**
 * The Talk button's icon: the microphone, a spinner on the way, a warning when it failed.
 * @param props The stage and whether something is wrong.
 * @param props.stage The stage.
 * @param props.problem Whether voice cannot start or failed.
 * @returns The icon.
 */
function TalkIcon(props: { readonly stage: VoiceStage; readonly problem: boolean }): JSX.Element {
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
