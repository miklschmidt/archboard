import type { GeneralThreadToolName } from "../index.js";

export const OK_OPERATION_ID = "operation-1";

export const VALID_ARGUMENTS: readonly { name: GeneralThreadToolName; value: unknown }[] = [
	{ name: "create_thread", value: { prompt: "Inspect the selected architecture." } },
	{
		name: "fork_thread",
		value: { threadId: "thread-1", beforeTurnId: "turn-1", prompt: "Try the alternative." },
	},
	{ name: "list_threads", value: { cursor: "cursor-1", limit: 100 } },
	{
		name: "read_thread",
		value: { threadId: "thread-1", cursor: "cursor-1", turnLimit: 20, includeOutputs: true },
	},
	{ name: "send_message_to_thread", value: { threadId: "thread-1", prompt: "Continue." } },
	{ name: "wait_threads", value: { threadIds: ["thread-1", "thread-2"], timeoutMs: 120_000 } },
];

export const VALID_OK_VALUES: Record<GeneralThreadToolName, unknown> = {
	create_thread: {
		threadId: "thread-1",
		state: "executable",
		initialTurn: {
			delivery: "delivered",
			turnId: "turn-1",
			operationId: "operation-2",
			reason: null,
		},
	},
	fork_thread: {
		threadId: "thread-2",
		state: "executable",
		initialTurn: {
			delivery: "not_requested",
			turnId: null,
			operationId: null,
			reason: null,
		},
	},
	list_threads: {
		threads: [
			{
				threadId: "thread-1",
				title: "Architecture review",
				status: "idle",
				source: "appServer",
				epoch: "current",
				ownership: "created",
				loaded: true,
				canAcceptDirectInput: true,
			},
		],
		nextCursor: null,
	},
	read_thread: {
		threadId: "thread-1",
		turns: [
			{
				turnId: "turn-1",
				status: "completed",
				summary: "completed · user: Inspect the board · assistant: Done",
				outputsIncluded: false,
				outputsTruncated: false,
			},
		],
		nextCursor: "cursor-2",
	},
	send_message_to_thread: { threadId: "thread-1", delivery: "delivered" },
	wait_threads: { event: "timeout", threadId: null, cursor: "cursor-3" },
};

export function okEnvelope(name: GeneralThreadToolName): string {
	return JSON.stringify({
		tag: "ok",
		operationId: OK_OPERATION_ID,
		value: VALID_OK_VALUES[name],
	});
}

export const REFUSED_ENVELOPE = JSON.stringify({
	tag: "refused",
	reason: "not_controllable",
	message: "The target is not controllable; inspect the current thread state before retrying.",
});

export const APPROVAL_REQUIRED_ENVELOPE = JSON.stringify({
	tag: "approval_required",
	operationId: "approval-1",
	summary: "Send one message to thread-1.",
});

export const OUTCOME_UNKNOWN_ENVELOPE = JSON.stringify({
	tag: "outcome_unknown",
	operationId: "operation-3",
	message:
		"The request may have taken effect. Inspect authoritative state before another mutation.",
});

export function dynamicResponse(text: string, success = true): unknown {
	return { contentItems: [{ type: "inputText", text }], success };
}
