// Voice, in one place: Talk while voice is off, which sets up whatever is
// missing before it listens; the live meter, what the voice is doing, mute,
// subtitles and end while it is on. It never disappears: when voice cannot
// start it says why beside the control that retries.

import {
	RiErrorWarningLine,
	RiLoader4Line,
	RiMicLine,
	RiMicOffLine,
	RiPhoneLine,
} from "@remixicon/react";
import type { JSX } from "react";

import { Button } from "@/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/components/tooltip";
import { SubtitlesToggle } from "@/ui/voice-subtitles";
import { VoiceOutputWave, type VoiceWaveState } from "@/ui/voice-wave";
import type { AgentActions, AgentVoiceView, VoiceStage } from "@/ui/workbench/contracts";
import { IconAction } from "@/ui/workbench/components/IconAction";

/** Inputs for the Talk control. */
interface TalkControlProps {
	readonly voice: AgentVoiceView;
	readonly actions: AgentActions;
	readonly reducedMotion: boolean;
}

/** What the voice is doing, in a word, while it is on. */
const LIVE_WORDS: Partial<Readonly<Record<VoiceStage, string>>> = {
	listening: "Listening",
	speaking: "Speaking",
	muted: "Muted",
};

/** The wave's state for each live stage. */
const WAVE_STATES: Readonly<Record<VoiceStage, VoiceWaveState>> = {
	idle: "inactive",
	preparing: "connecting",
	connecting: "connecting",
	listening: "listening",
	speaking: "speaking",
	muted: "listening",
	stopping: "inactive",
};

/**
 * Voice, in one place.
 * @param props The voice, the actions and the motion preference.
 * @returns The control.
 */
function TalkControl(props: TalkControlProps): JSX.Element {
	const { voice, actions } = props;
	const word = LIVE_WORDS[voice.stage];
	if (word !== undefined) {
		return (
			<div data-voice-controls="live" className="flex shrink-0 items-center gap-1.5">
				<VoiceOutputWave
					state={WAVE_STATES[voice.stage]}
					level={voice.level}
					active
					size="icon"
					reducedMotion={props.reducedMotion}
					className="w-16 overflow-hidden"
				/>
				<output aria-live="polite" className="text-control w-[70px] font-medium">
					{word}
				</output>
				<IconAction label={voice.stage === "muted" ? "Unmute" : "Mute"} onClick={voice.stage === "muted" ? actions.unmute : actions.mute}>
					{voice.stage === "muted" ? <RiMicOffLine /> : <RiMicLine />}
				</IconAction>
				<SubtitlesToggle />
				<Button variant="outline" size="sm" className="h-7 gap-1.5 rounded-[3px] px-2.5" onClick={actions.endVoice}>
					<RiPhoneLine aria-hidden="true" className="size-3.5 rotate-[135deg]" />
					End
				</Button>
			</div>
		);
	}
	return <TalkButton voice={voice} actions={actions} />;
}

/**
 * Talk, or where getting voice going stands.
 * @param props The voice and the actions.
 * @param props.voice The voice.
 * @param props.actions The actions.
 * @returns The button.
 */
function TalkButton(props: { readonly voice: AgentVoiceView; readonly actions: AgentActions }): JSX.Element {
	const { voice, actions } = props;
	const waiting = voice.stage !== "idle";
	const button = (
		<Button
			variant="outline"
			size="sm"
			data-voice-controls="talk"
			disabled={waiting}
			onClick={actions.talk}
			className="h-7 shrink-0 gap-1.5 rounded-[3px] px-2.5"
		>
			<TalkIcon stage={voice.stage} problem={voice.problem !== null} />
			{waiting ? STAGE_WORDS[voice.stage] : "Talk"}
		</Button>
	);
	if (voice.problem === null) return button;
	return (
		<Tooltip>
			<TooltipTrigger render={button} />
			<TooltipContent side="top" className="max-w-72">
				{voice.problem}
			</TooltipContent>
		</Tooltip>
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
