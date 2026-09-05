import { CodexSessionMutationError, type CodexSession } from "../../codex-session/index.js";
import type {
	CoordinatorCallbackMutationResult,
	CoordinatorCallbackRealtimeGeneration,
	CoordinatorCallbackRealtimePort,
	CoordinatorCallbackRealtimeRequest,
} from "./contract.js";

interface CoordinatorCallbackRealtimePortOptions {
	readonly session: Pick<CodexSession, "realtimeAppendText">;
	readonly currentGeneration: () => CoordinatorCallbackRealtimeGeneration | null;
}

function sameRealtimeGeneration(
	left: CoordinatorCallbackRealtimeGeneration | null,
	right: CoordinatorCallbackRealtimeGeneration | null,
): boolean {
	if (left === null || right === null) {
		return left === right;
	}
	return (
		left.childId === right.childId &&
		left.epoch === right.epoch &&
		left.coordinatorThreadId === right.coordinatorThreadId &&
		left.wireSessionId === right.wireSessionId &&
		left.browserSessionId === right.browserSessionId &&
		left.browserCorrelationId === right.browserCorrelationId
	);
}

function stale(): CoordinatorCallbackMutationResult {
	return { attempted: false, outcome: "not_delivered", reason: "stale_session" };
}

function failed(error: unknown): CoordinatorCallbackMutationResult {
	if (error instanceof CodexSessionMutationError && error.outcome === "not_delivered") {
		return { attempted: true, outcome: "not_delivered", reason: "session_rejected" };
	}
	return { attempted: true, outcome: "outcome_unknown", reason: "response_lost" };
}

function createCoordinatorCallbackRealtimePort(
	options: CoordinatorCallbackRealtimePortOptions,
): CoordinatorCallbackRealtimePort {
	return Object.freeze({
		appendDeveloper: async (
			request: CoordinatorCallbackRealtimeRequest,
		): Promise<CoordinatorCallbackMutationResult> => {
			if (!sameRealtimeGeneration(request.generation, options.currentGeneration())) {
				return stale();
			}
			if (
				request.params.threadId !== request.generation.coordinatorThreadId ||
				request.params.role !== "developer"
			) {
				return stale();
			}
			try {
				await options.session.realtimeAppendText(request.params);
			} catch (error) {
				return failed(error);
			}
			if (!sameRealtimeGeneration(request.generation, options.currentGeneration())) {
				return { attempted: true, outcome: "outcome_unknown", reason: "stale_session" };
			}
			return { attempted: true, outcome: "delivered", reason: null };
		},
	});
}

export {
	type CoordinatorCallbackRealtimePortOptions,
	sameRealtimeGeneration,
	createCoordinatorCallbackRealtimePort,
};
