import { CodexSessionMutationError, type CodexSession } from "@archboard/codex-app-server/session";
import type {
	CoordinatorCallbackContextPort,
	CoordinatorCallbackMutationResult,
	CoordinatorCallbackRealtimeGeneration,
	CoordinatorCallbackRealtimePort,
	CoordinatorCallbackRealtimeRequest,
} from "#runtime/protocol/coordinator-callbacks/contract.ts";

interface CoordinatorCallbackRealtimePortOptions {
	readonly session: Pick<CodexSession, "realtimeAppendText" | "realtimeAppendSpeech">;
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
 * Whether two voice generations are the same one, field by field. Anything is only appended to the exact generation it was written for; anything else would speak into a session the user has already left.
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
 * Send one append down the channel it names: quiet context as a developer message, or speech
 * the voice model answers now.
 * @param session - The session's append methods.
 * @param request - The append.
 * @returns Resolves once Codex answered.
 */
async function send(
	session: CoordinatorCallbackRealtimePortOptions["session"],
	request: CoordinatorCallbackRealtimeRequest,
): Promise<void> {
	if (request.channel === "speech") {
		await session.realtimeAppendSpeech(request.params);
	} else {
		await session.realtimeAppendText(request.params);
	}
}

/**
 * Whether an append is addressed the way its generation allows: to that generation's coordinator
 * thread, and as a developer message when it is quiet context.
 * @param request - The append.
 * @returns True when it may be sent.
 */
function addressed(request: CoordinatorCallbackRealtimeRequest): boolean {
	if (request.params.threadId !== request.generation.coordinatorThreadId) {
		return false;
	}
	return request.channel === "speech" || request.params.role === "developer";
}

/**
 * Build the port that appends to the coordinator's live voice session. It checks the generation
 * before the append and again afterwards, so a session that turned over mid-flight leaves the
 * outcome unknown rather than claiming delivery.
 * @param options - The session's append methods and the current generation accessor.
 * @returns The frozen realtime port.
 */
function createCoordinatorCallbackRealtimePort(
	options: CoordinatorCallbackRealtimePortOptions,
): CoordinatorCallbackRealtimePort {
	return Object.freeze({
		/**
		 * Append one sentence to the current voice session, quietly or as speech.
		 * @param request - The generation it was written for, its channel and its parameters.
		 * @returns How the append settled.
		 */
		append: async (
			request: CoordinatorCallbackRealtimeRequest,
		): Promise<CoordinatorCallbackMutationResult> => {
			if (!sameRealtimeGeneration(request.generation, options.currentGeneration())) {
				return stale();
			}
			if (!addressed(request)) {
				return stale();
			}
			try {
				await send(options.session, request);
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

/**
 * Build the port that puts one sentence into the coordinator thread's history without starting a
 * turn: one developer message through `thread/inject_items`, the way an announced context
 * reaches it. A lost answer is not retried: the next change says where things stand.
 * @param session - The session's inject method.
 * @returns The frozen port.
 */
function createCoordinatorCallbackContextPort(
	session: Pick<CodexSession, "threadInjectItems">,
): CoordinatorCallbackContextPort {
	const port: CoordinatorCallbackContextPort = {
		/**
		 * Put one sentence into one thread's history.
		 * @param request - The thread and the sentence.
		 * @param request.threadId - The coordinator thread.
		 * @param request.text - The sentence.
		 * @returns How the injection settled.
		 */
		inject: async ({ threadId, text }) => {
			try {
				await session.threadInjectItems({
					threadId,
					items: [{ type: "message", role: "developer", content: [{ type: "input_text", text }] }],
				});
			} catch (error) {
				return failed(error);
			}
			return { attempted: true, outcome: "delivered", reason: null };
		},
	};
	return Object.freeze(port);
}

export {
	createCoordinatorCallbackContextPort,
	type CoordinatorCallbackRealtimePortOptions,
	sameRealtimeGeneration,
	createCoordinatorCallbackRealtimePort,
};
