// What a recording reads of the agent and the voice (TASK-304): whether voice
// can be started at all, whether it is live, how loud it is, and what it has
// said. Everything is read from the agent the page already has; nothing here
// holds state of its own.

import type { AgentVoice } from "@archboard/agent-surfaces";

import type { PaceObservation } from "#ui/walkthroughs/recording/rules/pacing.ts";

/** The agent's voice, and the recorded pane it is started for. */
interface RecordingSources {
	readonly voice: AgentVoice;
	/** The pane the page records. */
	readonly paneId: string;
}

/** What the voice is doing, as a recording's pacing reads it. */
type VoiceReading = Pick<PaceObservation, "voice" | "audible" | "transcript">;

/**
 * What the voice is doing now.
 * @param sources The agent's voice.
 * @returns Its standing, whether it is audible, and its transcript.
 */
function readVoice(sources: RecordingSources): VoiceReading {
	const { voice } = sources;
	return {
		voice: voice.standing(),
		audible: voice.audible(),
		transcript: voice.transcript.read(),
	};
}

export { readVoice, type RecordingSources };
