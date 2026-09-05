// How a fake host answers a stop: delivered with an exact, missing, swapped,
// stale, future or mismatched identity, or a refusal or a lost response.

import { parseRealtimeCorrelationId, parseRealtimeSessionId } from "@/shared/codex-realtime-host";
import type { CommandOutcome, RealtimeCorrelation } from "@/ui/codex-realtime";

type StopMode = "delivered" | "rejected" | "not_delivered" | "outcome_unknown" | "paused";

type StopIdentityMode =
	| "exact"
	| "missing"
	| "swapped"
	| "stale"
	| "future"
	| "session_mismatch"
	| "correlation_mismatch";

const STOP_IDENTITIES: readonly StopIdentityMode[] = [
	"exact",
	"missing",
	"swapped",
	"stale",
	"future",
	"session_mismatch",
	"correlation_mismatch",
];

/**
 * A correlation for one numbered fixture session.
 * @param index The session number.
 * @returns The correlation.
 */
function correlation(index = 1): RealtimeCorrelation {
	return Object.freeze({
		sessionId: parseRealtimeSessionId(`session-${index}`),
		correlationId: parseRealtimeCorrelationId(`correlation-${index}`),
	});
}

/**
 * A delivered outcome carrying whatever identity the mode names.
 * @param request The stop request.
 * @param identity The identity mode.
 * @returns The outcome.
 */
function deliveredOutcome(
	request: RealtimeCorrelation,
	identity: StopIdentityMode,
): CommandOutcome {
	const identities: Record<StopIdentityMode, RealtimeCorrelation> = {
		exact: request,
		// A delivered outcome with no identity at all: the fields are empty strings on the wire.
		missing: {
			sessionId: parseRealtimeSessionId(""),
			correlationId: parseRealtimeCorrelationId(""),
		},
		swapped: {
			sessionId: parseRealtimeSessionId(String(request.correlationId)),
			correlationId: parseRealtimeCorrelationId(String(request.sessionId)),
		},
		stale: correlation(0),
		future: correlation(99),
		session_mismatch: { ...request, sessionId: correlation(9).sessionId },
		correlation_mismatch: { ...request, correlationId: correlation(9).correlationId },
	};
	return { outcome: "delivered", ...identities[identity] };
}

/**
 * The host's answer to one stop.
 * @param mode How the host answers.
 * @param request The stop request.
 * @param identity Which identity a delivered answer carries.
 * @returns The outcome.
 */
function createStopOutcome(
	mode: Exclude<StopMode, "paused" | "rejected">,
	request: RealtimeCorrelation,
	identity: StopIdentityMode,
): CommandOutcome {
	if (mode === "not_delivered") {
		return { outcome: mode, reason: "rejected", ...request };
	}
	if (mode === "outcome_unknown") {
		return { outcome: mode, reason: "response_lost", ...request };
	}
	return deliveredOutcome(request, identity);
}

export { STOP_IDENTITIES, correlation, createStopOutcome, type StopIdentityMode, type StopMode };
