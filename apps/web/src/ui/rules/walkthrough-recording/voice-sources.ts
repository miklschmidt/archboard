// What a recording reads of the agent and the voice (TASK-304): whether voice
// can be started at all, whether it is live, how loud it is, and what it has
// said. Everything is read from the owners the server already has; nothing
// here holds state of its own.

import type { AgentPhase, AgentSetup } from "@archboard/workbench/agent";
import type {
	VoiceSession,
	VoiceSessionStatus,
	VoiceSessionView,
} from "@archboard/workbench/voice";
import {
	type BrowserWorkbenchTransport,
	VOICE_OUTPUT_SPEAKING_LEVEL,
} from "@archboard/codex-realtime-voice/controllers";

import type { SpokenLine, VoiceStanding } from "#ui/rules/walkthrough-recording/pacing.ts";

/** The recorded pane's transport, as far as a recording reads the voice's transcript from it. */
type RecordingTransport = Pick<BrowserWorkbenchTransport, "state" | "subscribe">;

/** The server's agent and the voice running for the recorded pane. */
interface RecordingSources {
	readonly setup: Pick<AgentSetup, "snapshot" | "talk">;
	/** The voice session and its pane's transport, or null while the pane has no transport. */
	readonly voice: {
		readonly session: Pick<VoiceSession, "view" | "level" | "stop">;
		readonly transport: RecordingTransport;
	} | null;
}

/** Whether voice can be started for a recording. */
type AgentReadiness =
	| { readonly kind: "ready" }
	/** Still connecting or starting: ask again. */
	| { readonly kind: "waiting" }
	/** It cannot be, for a reason nobody at this page can fix. */
	| { readonly kind: "refused"; readonly reason: string };

/** What the voice is doing, as a recording's pacing reads it. */
interface VoiceReading {
	readonly voice: VoiceStanding;
	readonly audible: boolean;
	readonly transcript: readonly SpokenLine[];
}

/** The statuses in which the voice session is live. */
const LIVE: ReadonlySet<VoiceSessionStatus> = new Set([
	"listening",
	"processing",
	"agent_speaking",
	"muted",
]);

const LIVE_VOICE: VoiceStanding = Object.freeze({ kind: "live" });
const OTHER_VOICE: VoiceStanding = Object.freeze({ kind: "other" });

const NOT_SIGNED_IN: AgentReadiness = Object.freeze({
	kind: "refused",
	reason:
		"Codex is not signed in on this Archboard server. Sign in from the agent dock, then record again.",
});

/** Whether voice can be started, for every phase but the one that says why it cannot. */
const READINESS: Readonly<Record<Exclude<AgentPhase["kind"], "unavailable">, AgentReadiness>> = {
	ready: Object.freeze({ kind: "ready" }),
	connecting: Object.freeze({ kind: "waiting" }),
	starting: Object.freeze({ kind: "waiting" }),
	signed_out: NOT_SIGNED_IN,
	signing_in: NOT_SIGNED_IN,
};

/**
 * Whether the server's agent can start voice for a recording.
 * @param setup The agent setup.
 * @returns Ready, waiting, or refused with what to do.
 */
function agentReadiness(setup: RecordingSources["setup"]): AgentReadiness {
	const { phase } = setup.snapshot();
	return phase.kind === "unavailable"
		? { kind: "refused", reason: `Codex is unavailable on this Archboard server: ${phase.reason}` }
		: READINESS[phase.kind];
}

/**
 * Where a voice session stands by its own view.
 * @param view The session's view, or null without a session.
 * @returns Live, failed in the session's words, or neither.
 */
function standingOf(view: VoiceSessionView | null): VoiceStanding {
	if (view === null) return OTHER_VOICE;
	if (view.status === "failed") {
		return { kind: "failed", reason: view.failure?.message ?? view.detail };
	}
	return LIVE.has(view.status) ? LIVE_VOICE : OTHER_VOICE;
}

/**
 * Where the voice stands: a Talk that could not start voice has failed in the setup's words,
 * and otherwise the session says.
 * @param setup The agent setup.
 * @param view The session's view, or null without a session.
 * @returns The standing.
 */
function voiceStanding(
	setup: RecordingSources["setup"],
	view: VoiceSessionView | null,
): VoiceStanding {
	const { talkFailure } = setup.snapshot();
	return talkFailure === null ? standingOf(view) : { kind: "failed", reason: talkFailure };
}

/** Nothing said. */
const SILENT: readonly SpokenLine[] = Object.freeze([]);

/**
 * What the voice is doing now.
 * @param sources The agent and the voice.
 * @returns Its standing, whether it is audible, and its transcript.
 */
function readVoice(sources: RecordingSources): VoiceReading {
	const { setup, voice } = sources;
	if (voice === null) {
		return { voice: voiceStanding(setup, null), audible: false, transcript: SILENT };
	}
	const { snapshot } = voice.transport.state();
	return {
		voice: voiceStanding(setup, voice.session.view()),
		audible: voice.session.level() >= VOICE_OUTPUT_SPEAKING_LEVEL,
		transcript: snapshot === null ? SILENT : snapshot.voice.transcript,
	};
}

export {
	agentReadiness,
	readVoice,
	type AgentReadiness,
	type RecordingSources,
	type RecordingTransport,
};
