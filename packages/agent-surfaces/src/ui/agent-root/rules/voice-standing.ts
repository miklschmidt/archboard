// Whether voice can be started at all, and whether it is live, as a page that paces a talk itself
// reads them (TASK-304): a recording starts only once the server's agent can start voice, and it
// waits on the voice's own word for whether it is live or failed.

import type { AgentSetupSnapshot } from "#ui/agent-setup/state/setup.ts";
import type { VoiceSessionStatus, VoiceSessionView } from "#ui/voice-session/state/contract.ts";

/** Whether voice can be started. */
type AgentReadiness =
	| { readonly kind: "ready" }
	/** Still connecting or starting: ask again. */
	| { readonly kind: "waiting" }
	/** It cannot be, for a reason nobody at this page can fix. */
	| { readonly kind: "refused"; readonly reason: string };

/** Where the voice stands. */
type VoiceStanding =
	| { readonly kind: "live" }
	| { readonly kind: "failed"; readonly reason: string }
	/** Not live and not failed: on its way, or not started. */
	| { readonly kind: "other" };

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
const READINESS: Readonly<
	Record<Exclude<AgentSetupSnapshot["phase"]["kind"], "unavailable">, AgentReadiness>
> = {
	ready: Object.freeze({ kind: "ready" }),
	connecting: Object.freeze({ kind: "waiting" }),
	starting: Object.freeze({ kind: "waiting" }),
	signed_out: NOT_SIGNED_IN,
	signing_in: NOT_SIGNED_IN,
};

/**
 * Whether the server's agent can start voice.
 * @param setup The agent setup's snapshot.
 * @returns Ready, waiting, or refused with what to do.
 */
function agentReadiness(setup: AgentSetupSnapshot): AgentReadiness {
	const { phase } = setup;
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
 * @param setup The agent setup's snapshot.
 * @param view The session's view, or null without a session.
 * @returns The standing.
 */
function voiceStanding(setup: AgentSetupSnapshot, view: VoiceSessionView | null): VoiceStanding {
	const { talkFailure } = setup;
	return talkFailure === null ? standingOf(view) : { kind: "failed", reason: talkFailure };
}

export { agentReadiness, voiceStanding, type AgentReadiness, type VoiceStanding };
