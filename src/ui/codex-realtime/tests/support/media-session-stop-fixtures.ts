import {
	type CommandOutcome,
	type RealtimeCorrelation,
	type RealtimeCorrelationId,
	type RealtimeSessionId,
} from "../../index.js";

export type StopMode = "delivered" | "rejected" | "not_delivered" | "outcome_unknown" | "paused";

export type StopIdentityMode =
	| "exact"
	| "missing"
	| "swapped"
	| "stale"
	| "future"
	| "session_mismatch"
	| "correlation_mismatch";

export const STOP_IDENTITIES: StopIdentityMode[] = [
	"exact",
	"missing",
	"swapped",
	"stale",
	"future",
	"session_mismatch",
	"correlation_mismatch",
];

function correlation(index: number): RealtimeCorrelation {
	return {
		sessionId: `session-${index}` as RealtimeSessionId,
		correlationId: `correlation-${index}` as RealtimeCorrelationId,
	};
}

export function createStopOutcome(
	mode: Exclude<StopMode, "paused" | "rejected">,
	request: RealtimeCorrelation,
	identity: StopIdentityMode,
): CommandOutcome {
	if (mode === "not_delivered") return { outcome: mode, reason: "rejected", ...request };
	if (mode === "outcome_unknown") return { outcome: mode, reason: "response_lost", ...request };
	if (identity === "missing") return { outcome: "delivered" } as CommandOutcome;
	if (identity === "swapped")
		return {
			outcome: "delivered",
			sessionId: request.correlationId as unknown as RealtimeSessionId,
			correlationId: request.sessionId as unknown as RealtimeCorrelationId,
		};
	if (identity === "stale") return { outcome: "delivered", ...correlation(0) };
	if (identity === "future") return { outcome: "delivered", ...correlation(99) };
	if (identity === "session_mismatch")
		return { outcome: "delivered", ...request, sessionId: correlation(9).sessionId };
	if (identity === "correlation_mismatch")
		return { outcome: "delivered", ...request, correlationId: correlation(9).correlationId };
	return { outcome: "delivered", ...request };
}
