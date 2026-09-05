import type {
	AppendOutcome,
	RealtimeCorrelationId,
	RealtimeSessionId,
} from "../../../shared/codex-realtime-host/index.js";
import { CodexSessionMutationError } from "../../codex-session/index.js";
import { realtimeErrorMessage } from "./binding.js";

interface MutationRequest {
	readonly sessionId: RealtimeSessionId;
	readonly correlationId: RealtimeCorrelationId;
}

async function runRealtimeMutation(
	// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- The request is structurally readonly and both identities are Zod-branded primitive strings; the rule cannot prove that primitive representation.
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
		if (!isCurrent()) {
			return { ...request, outcome: "outcome_unknown", reason: "response_lost" };
		}
		return { ...request, outcome: "delivered" };
	} catch (error) {
		if (!isCurrent()) {
			return { ...request, outcome: "outcome_unknown", reason: "response_lost" };
		}
		const outcome: AppendOutcome =
			error instanceof CodexSessionMutationError && error.outcome === "not_delivered"
				? { ...request, outcome: "not_delivered", reason: "rejected" }
				: {
						...request,
						outcome: "outcome_unknown",
						reason:
							error instanceof CodexSessionMutationError ? "response_lost" : "transport_failure",
					};
		diagnose(realtimeErrorMessage(error));
		return outcome;
	}
}

export { runRealtimeMutation };
