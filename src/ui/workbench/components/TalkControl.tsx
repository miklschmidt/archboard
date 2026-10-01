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
import { useSyncExternalStore, type JSX } from "react";

import { Button } from "@/ui/components/button";
import { VOICE_OUTPUT_SPEAKING_LEVEL } from "@/ui/voice-output-level";
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

/** Where the element saying why voice cannot start is, for the button it describes. */
const TALK_PROBLEM_ID = "talk-problem";

/** What the voice is doing, in a word, while it is on or connecting. */
const LIVE_WORDS: Partial<Readonly<Record<VoiceStage, string>>> = {
	connecting: "Connecting",
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

/** The stages in which the model's measured output can make it audible. */
const LIVE_STAGES: ReadonlySet<VoiceStage> = new Set(["listening", "speaking", "muted"]);

/**
 * Whether the model is audible now, by its measured output. It is heard as a yes
 * or no, so the control is drawn again when that flips, not on every frame the
 * level moves.
 * @param voice The voice.
 * @returns True while a live voice's output is over the speaking level.
 */
function useAudible(voice: AgentVoiceView): boolean {
	const { level } = voice;
	/**
	 * Whether the output is over the speaking level now.
	 * @returns True when it is.
	 */
	const loud = (): boolean => level.read() >= VOICE_OUTPUT_SPEAKING_LEVEL;
	const overSpeaking = useSyncExternalStore(level.subscribe, loud, loud);
	return LIVE_STAGES.has(voice.stage) && overSpeaking;
}

/**
 * What the live voice is doing, in a word: muted says so first; otherwise the
 * model's measured output decides whether it is speaking.
 * @param voice The voice.
 * @param audible Whether the model is audible now.
 * @returns The word, or undefined while voice is not live.
 */
function liveWord(voice: AgentVoiceView, audible: boolean): string | undefined {
	const word = LIVE_WORDS[voice.stage];
	if (word === undefined || voice.stage === "muted") return word;
	return audible ? "Speaking" : word;
}

/**
 * Voice, in one place.
 * @param props The voice, the actions and the motion preference.
 * @returns The control.
 */
function TalkControl(props: TalkControlProps): JSX.Element {
	const audible = useAudible(props.voice);
	const word = liveWord(props.voice, audible);
	if (word === undefined) return <TalkButton voice={props.voice} actions={props.actions} />;
	return <LiveVoice {...props} word={word} audible={audible} />;
}

/**
 * Voice while it is on, or getting there: the output wave, what it is doing,
 * mute, subtitles and End — which is there from the moment voice connects, so
 * a session stuck connecting or recovering can always be ended.
 * @param props The voice, the actions, the motion preference and the word.
 * @param props.word What the voice is doing, in a word.
 * @param props.audible Whether the model is audible now.
 * @returns The live controls.
 */
function LiveVoice(
	props: TalkControlProps & { readonly word: string; readonly audible: boolean },
): JSX.Element {
	const { voice, actions } = props;
	const muted = voice.stage === "muted";
	return (
		<div data-voice-controls="live" className="flex shrink-0 items-center gap-1.5">
			<VoiceOutputWave
				state={props.audible ? "speaking" : WAVE_STATES[voice.stage]}
				level={voice.level.read}
				active
				size="icon"
				reducedMotion={props.reducedMotion}
				className="w-16 overflow-hidden"
			/>
			<output aria-live="polite" className="text-control w-[76px] font-medium">
				{props.word}
			</output>
			<IconAction
				label={muted ? "Unmute" : "Mute"}
				onClick={muted ? actions.unmute : actions.mute}
				disabled={voice.busy}
			>
				{muted ? <RiMicOffLine /> : <RiMicLine />}
			</IconAction>
			<SubtitlesToggle />
			<Button
				variant="outline"
				size="sm"
				className="h-7 gap-1.5 rounded-[3px] px-2.5"
				onClick={actions.endVoice}
				disabled={voice.busy}
			>
				<RiPhoneLine aria-hidden="true" className="size-3.5 rotate-[135deg]" />
				End
			</Button>
		</div>
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
				className="h-7 shrink-0 gap-1.5 rounded-[3px] px-2.5"
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
