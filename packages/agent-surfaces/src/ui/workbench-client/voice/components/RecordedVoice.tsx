// The voice of a recorded talk, as the page that renders the talk draws it (TASK-400): the same
// voice box low over the same picture as the shell draws for a live voice in a presented
// walkthrough, with the orb in its socket, the words, mute and the subtitles control. The voice of
// a talk is live from its first frame to its last, and on each frame it is as loud as the talk's
// voice was then. A recording has no dock, so the page hosts the one orb itself, in the box. Nobody
// presses a key in a video, so the keys are drawn and do nothing. A recording cuts every move of
// the voice box (app.css), so the orb is never flown either: it is in its socket from the first
// frame the box is shown.

import { createContext, useContext, useMemo, type JSX, type ReactNode } from "react";

import { OrbStageProvider } from "#ui/workbench-client/orb/components/OrbStage.tsx";
import { RecordedOrb } from "#ui/workbench-client/orb/components/RecordedOrb.tsx";
import type { SubtitleSource } from "#ui/workbench-client/subtitles/hooks/use-voice-subtitles.ts";
import type { AgentVoiceView, VoiceLevel } from "#ui/workbench-client/surfaces/state/contracts.ts";
import { VoiceBox, type VoiceBoxProps } from "#ui/workbench-client/voice/components/VoiceBox.tsx";

/** The recorded voice, for the box drawn inside. */
const RecordedVoiceContext = createContext<AgentVoiceView | null>(null);

/** Nobody presses a key in a rendered talk. */
function ignore(): void {
	// A recording is watched, not handled.
}

/** The voice box's keys, as a video has them: drawn, and doing nothing. */
const WATCHED: VoiceBoxProps["actions"] = { mute: ignore, unmute: ignore };

/**
 * The voice of a talk: live from its first frame to its last.
 * @param level How loud it is on the frame played to.
 * @returns The voice, as the voice box and the orb read it.
 */
function talkVoice(level: VoiceLevel): AgentVoiceView {
	return { stage: "listening", problem: null, busy: false, level };
}

/**
 * A recorded voice for the page drawn inside, with the page's one orb lit in the voice box.
 * @param props How loud the voice is on the frame played to, and the page.
 * @param props.level The level.
 * @param props.children The page, which places the voice box.
 * @returns The page, with the voice and its orb.
 */
function RecordedVoice(props: {
	readonly level: VoiceLevel;
	readonly children: ReactNode;
}): JSX.Element {
	const voice = useMemo(() => talkVoice(props.level), [props.level]);
	return (
		<OrbStageProvider>
			<RecordedVoiceContext value={voice}>
				{props.children}
				<RecordedOrb voice={voice} />
			</RecordedVoiceContext>
		</OrbStageProvider>
	);
}

/**
 * The voice box of a recorded voice, where the page lays it, low over the picture: shown once the
 * walkthrough is presented.
 * @param props What the voice has said so far, which a recording always subtitles, and whether the
 *   talk has reached its first step.
 * @param props.transcript What it has said.
 * @param props.presented Whether the walkthrough is presented.
 * @returns The box.
 * @throws {Error} Outside a `RecordedVoice`.
 */
function RecordedVoiceBox(props: {
	readonly transcript: readonly SubtitleSource[];
	readonly presented: boolean;
}): JSX.Element {
	const voice = useContext(RecordedVoiceContext);
	if (voice === null) {
		throw new Error("RecordedVoiceBox draws a recorded voice: place it inside a RecordedVoice.");
	}
	return (
		<VoiceBox
			voice={voice}
			actions={WATCHED}
			transcript={props.transcript}
			reducedMotion={false}
			shown={props.presented}
		/>
	);
}

export { RecordedVoice, RecordedVoiceBox };
