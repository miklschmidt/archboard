import type {
	AppendOutcome,
	RealtimeCorrelationId,
	RealtimeSessionId,
} from "@/shared/codex-realtime-host";
import { CodexSessionMutationError } from "@/runtime/codex-session";
import { realtimeErrorMessage } from "@/runtime/codex-realtime/lib/binding";

interface MutationRequest {
	readonly sessionId: RealtimeSessionId;
	readonly correlationId: RealtimeCorrelationId;
}

/**
 * Classify a failed app-server mutation: a pre-effect rejection is not delivered, anything else
 * left the outcome unknown because the request may have taken effect.
 * @param request - The browser request the outcome answers.
 * @param error - What the session threw.
 * @returns The outcome to report.
 */
function failureOutcome(request: Readonly<MutationRequest>, error: unknown): AppendOutcome {
	if (error instanceof CodexSessionMutationError && error.outcome === "not_delivered") {
		return { ...request, outcome: "not_delivered", reason: "rejected" };
	}
	return {
		...request,
		outcome: "outcome_unknown",
		reason: error instanceof CodexSessionMutationError ? "response_lost" : "transport_failure",
	};
}

/**
 * Run one app-server mutation on behalf of a browser request and map what happened to an
 * outcome, treating a session that stopped being current mid-flight as a lost response.
 * @param request - The browser request the outcome answers.
 * @param invoke - Performs the mutation.
 * @param isCurrent - Whether the request still targets the live session.
 * @param diagnose - Receives the failure text when the mutation throws.
 * @returns The outcome to report to the browser.
 */
async function runRealtimeMutation(
	request: Readonly<MutationRequest>,
	invoke: () => Promise<unknown>,
	isCurrent: () => boolean,
	diagnose: (message: string) => void,
): Promise<AppendOutcome> {
	if (!isCurrent()) {
		return { ...request, outcome: "not_delivered", reason: "stale_session" };
	}
	try {
		await invoke();
	} catch (error) {
		if (!isCurrent()) {
			return { ...request, outcome: "outcome_unknown", reason: "response_lost" };
		}
		diagnose(realtimeErrorMessage(error));
		return failureOutcome(request, error);
	}
	if (!isCurrent()) {
		return { ...request, outcome: "outcome_unknown", reason: "response_lost" };
	}
	return { ...request, outcome: "delivered" };
}

export { runRealtimeMutation };
