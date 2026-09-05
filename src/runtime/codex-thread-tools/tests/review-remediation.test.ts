import { expect, test } from "bun:test";

import {
	ARCHBOARD_APP_TOOL_NAMES,
	DynamicToolCallResponseSchema,
	parseDynamicToolCallResponse,
	parseToolResultEnvelope,
} from "../index.js";
import { dynamicResponse, okEnvelope, VALID_OK_VALUES } from "./fixtures.js";

function expectRejected(action: () => unknown): void {
	expect(action).toThrow(TypeError);
}

function reverseJsonObjects(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(reverseJsonObjects);
	}
	if (typeof value !== "object" || value === null) {
		return value;
	}
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.toReversed()
			.map(([key, child]) => [key, reverseJsonObjects(child)]),
	);
}

function resultText(value: unknown): string {
	return JSON.stringify({ tag: "ok", operationId: "operation-1", value });
}

test("rejects reordered keys at every result envelope and nested value depth", () => {
	for (const name of ARCHBOARD_APP_TOOL_NAMES) {
		const reordered = JSON.stringify(reverseJsonObjects(JSON.parse(okEnvelope(name))));
		expectRejected(() => parseToolResultEnvelope(name, reordered));
	}

	const sharedEnvelopes = [
		{
			tag: "refused",
			reason: "not_ready",
			message: "The target is not ready; inspect authoritative state before retrying.",
		},
		{ tag: "approval_required", operationId: "approval-1", summary: "Send one message." },
		{
			tag: "outcome_unknown",
			operationId: "operation-3",
			message:
				"The request may have taken effect. Inspect authoritative state before another mutation.",
		},
	];
	for (const envelope of sharedEnvelopes) {
		const reordered = JSON.stringify(reverseJsonObjects(envelope));
		expectRejected(() => parseToolResultEnvelope("send_message_to_thread", reordered));
	}
});

test("keeps refusal envelopes successful except for boundary failures", () => {
	const reasons = [
		"invalid_call",
		"not_ready",
		"not_loaded",
		"not_controllable",
		"system_error",
		"stale_child",
		"prior_epoch",
		"unknown_provenance",
		"approval_declined",
		"cycle",
		"busy",
		"expired",
		"unsupported",
	] as const;
	for (const reason of reasons) {
		const text = JSON.stringify({
			tag: "refused",
			reason,
			message: "Inspect authoritative state and follow the recovery path.",
		});
		expect(parseDynamicToolCallResponse("list_threads", dynamicResponse(text, true)).success).toBe(
			true,
		);
		const parseBoundaryFailure = () =>
			parseDynamicToolCallResponse("list_threads", dynamicResponse(text, false));
		if (reason === "invalid_call" || reason === "unsupported") {
			expect(parseBoundaryFailure().success).toBe(false);
		} else {
			expectRejected(parseBoundaryFailure);
		}
	}
});

test("enforces list, read, and inputText cardinality boundaries", () => {
	const listValue = VALID_OK_VALUES.list_threads as {
		threads: readonly Record<string, unknown>[];
		nextCursor: string | null;
	};
	const row = listValue.threads[0]!;
	for (const count of [100, 101]) {
		const value = {
			threads: Array.from({ length: count }, (_, index) => ({ ...row, threadId: `t-${index}` })),
			nextCursor: null,
		};
		const parse = () => parseToolResultEnvelope("list_threads", resultText(value));
		if (count === 100) {
			expect(parse()).toBeTruthy();
		} else {
			expectRejected(parse);
		}
	}

	const readValue = VALID_OK_VALUES.read_thread as {
		threadId: string;
		turns: readonly Record<string, unknown>[];
		nextCursor: string | null;
	};
	const turn = readValue.turns[0]!;
	for (const count of [20, 21]) {
		const value = {
			threadId: readValue.threadId,
			turns: Array.from({ length: count }, (_, index) => ({ ...turn, turnId: `turn-${index}` })),
			nextCursor: readValue.nextCursor,
		};
		const parse = () => parseToolResultEnvelope("read_thread", resultText(value));
		if (count === 20) {
			expect(parse()).toBeTruthy();
		} else {
			expectRejected(parse);
		}
	}

	const exactText = "😀".repeat(16_384);
	expect(DynamicToolCallResponseSchema.safeParse(dynamicResponse(exactText)).success).toBe(true);
	expect(DynamicToolCallResponseSchema.safeParse(dynamicResponse(`${exactText}😀`)).success).toBe(
		false,
	);

	const exactAscii = "a".repeat(16_384);
	expect(DynamicToolCallResponseSchema.safeParse(dynamicResponse(exactAscii)).success).toBe(true);
	expect(DynamicToolCallResponseSchema.safeParse(dynamicResponse(`${exactAscii}a`)).success).toBe(
		false,
	);
});

test("rejects every mismatched initial-turn identity and state combination", () => {
	const base = {
		threadId: "thread-1",
		state: "executable",
		initialTurn: {
			delivery: "delivered",
			turnId: "turn-1",
			operationId: "operation-2",
			reason: null,
		},
	};
	const mutations = [
		{ ...base, initialTurn: { ...base.initialTurn, turnId: null } },
		{ ...base, initialTurn: { ...base.initialTurn, operationId: null } },
		{
			...base,
			initialTurn: { ...base.initialTurn, delivery: "not_delivered", turnId: "turn-1" },
		},
		{
			...base,
			initialTurn: {
				...base.initialTurn,
				delivery: "not_delivered",
				operationId: null,
				turnId: null,
			},
		},
		{
			...base,
			state: "inspect_only",
			initialTurn: { ...base.initialTurn, delivery: "outcome_unknown", turnId: "turn-1" },
		},
		{
			...base,
			state: "inspect_only",
			initialTurn: { ...base.initialTurn, delivery: "outcome_unknown", operationId: null },
		},
		{
			...base,
			state: "inspect_only",
			initialTurn: { delivery: "not_requested", turnId: null, operationId: null, reason: null },
		},
	];
	for (const value of mutations) {
		expectRejected(() => parseToolResultEnvelope("create_thread", resultText(value)));
	}

	const notRequested = {
		threadId: "thread-2",
		state: "executable",
		initialTurn: { delivery: "not_requested", turnId: null, operationId: null, reason: null },
	};
	for (const field of ["turnId", "operationId", "reason"] as const) {
		const initialTurn = { ...notRequested.initialTurn, [field]: "unexpected" };
		expectRejected(() =>
			parseToolResultEnvelope("fork_thread", resultText({ ...notRequested, initialTurn })),
		);
	}
});
