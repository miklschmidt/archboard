import { CodexSessionMutationError, type CodexSession } from "@/runtime/codex-session";
import type {
	CoordinatorCallbackMutationResult,
	CoordinatorCallbackRealtimeGeneration,
	CoordinatorCallbackRealtimePort,
	CoordinatorCallbackRealtimeRequest,
} from "@/runtime/codex-coordinator-callbacks/lib/contract";

interface CoordinatorCallbackRealtimePortOptions {
	readonly session: Pick<CodexSession, "realtimeAppendText">;
	readonly currentGeneration: () => CoordinatorCallbackRealtimeGeneration | null;
}

/** Every field that identifies one voice generation; all of them must match. */
const REALTIME_GENERATION_FIELDS: readonly (keyof CoordinatorCallbackRealtimeGeneration)[] = [
	"childId",
	"epoch",
	"coordinatorThreadId",
	"wireSessionId",
	"browserSessionId",
	"browserCorrelationId",
];

/**
 * Whether two voice generations are the same one, field by field. A developer message is only appended to the exact generation it was written for; anything else would speak into a session the person has already left.
 * @param left - One generation, or null when voice is off.
 * @param right - The other generation, or null.
 * @returns True when both are absent or every field matches.
 */
function sameRealtimeGeneration(
	left: CoordinatorCallbackRealtimeGeneration | null,
	right: CoordinatorCallbackRealtimeGeneration | null,
): boolean {
	if (left === null || right === null) {
		return left === right;
	}
	return REALTIME_GENERATION_FIELDS.every((field) => left[field] === right[field]);
}

/**
 * The result for an append that was never attempted because the generation had moved on.
 * @returns The not-delivered result.
 */
function stale(): CoordinatorCallbackMutationResult {
	return { attempted: false, outcome: "not_delivered", reason: "stale_session" };
}

/**
 * Classify a failed append: the session proves a rejection before delivery, and anything else leaves the outcome unknown because the text may already have been spoken.
 * @param error - The thrown value from the session.
 * @returns The mutation result.
 */
function failed(error: unknown): CoordinatorCallbackMutationResult {
	if (error instanceof CodexSessionMutationError && error.outcome === "not_delivered") {
		return { attempted: true, outcome: "not_delivered", reason: "session_rejected" };
	}
	return { attempted: true, outcome: "outcome_unknown", reason: "response_lost" };
}

/**
 * Build the port that appends a developer message to the coordinator's live voice session. It
 * checks the generation before the append and again afterwards, so a session that turned over
 * mid-flight leaves the outcome unknown rather than claiming delivery.
 * @param options - The session's append method and the current generation accessor.
 * @returns The frozen realtime port.
 */
function createCoordinatorCallbackRealtimePort(
	options: CoordinatorCallbackRealtimePortOptions,
): CoordinatorCallbackRealtimePort {
	return Object.freeze({
		/**
		 * Append one developer message to the current voice session.
		 * @param request - The generation the message was written for and its append parameters.
		 * @returns How the append settled.
		 */
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
