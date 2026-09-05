import { expect } from "bun:test";

import { parseDynamicToolCallResponse } from "../../../../src/runtime/codex-thread-tools/index.ts";
import { reverseResponses } from "./codex-workbench-lifecycle.ts";

const operationPattern = /^archboard:operation:h[a-f0-9]{32}\.h[a-f0-9]{32}\.h[a-f0-9]{32}$/;

function expectGeneralQueryEnvelopes(logPath: string): void {
	const list = parseDynamicToolCallResponse(
		"list_threads",
		reverseResponses(logPath, "general-list")[0]?.frame?.result,
	).envelope;
	if (list.tag !== "ok") {
		throw new Error("The controlled thread list was not successful.");
	}
	expect(list.operationId).toMatch(operationPattern);
	expect(list).toEqual({
		tag: "ok",
		operationId: list.operationId,
		value: {
			threads: [
				{
					threadId: "thread-3",
					title: null,
					status: "idle",
					source: "vscode",
					epoch: "current",
					ownership: "created",
					loaded: true,
					canAcceptDirectInput: true,
				},
			],
			nextCursor: null,
		},
	});
	const read = parseDynamicToolCallResponse(
		"read_thread",
		reverseResponses(logPath, "general-read")[0]?.frame?.result,
	).envelope;
	if (read.tag !== "ok") {
		throw new Error("The controlled thread read was not successful.");
	}
	expect(read.operationId).toMatch(operationPattern);
	expect(read).toEqual({
		tag: "ok",
		operationId: read.operationId,
		value: {
			threadId: "thread-3",
			turns: [
				{
					turnId: "archboard:turn:s7475726e2d34",
					status: "completed",
					summary: "completed · user: none · assistant: none",
					outputsIncluded: true,
					outputsTruncated: false,
				},
			],
			nextCursor: null,
		},
	});
	const wait = parseDynamicToolCallResponse(
		"wait_threads",
		reverseResponses(logPath, "general-wait")[0]?.frame?.result,
	).envelope;
	if (wait.tag !== "ok") {
		throw new Error("The controlled thread wait was not successful.");
	}
	const waitValue = wait.value as {
		readonly event: string;
		readonly threadId: string | null;
		readonly cursor: string | null;
	};
	expect(wait.operationId).toMatch(operationPattern);
	expect(waitValue.cursor).toMatch(/^[A-Za-z0-9_-]+$/);
	expect(wait).toEqual({
		tag: "ok",
		operationId: wait.operationId,
		value: { event: "completed", threadId: "thread-3", cursor: waitValue.cursor },
	});
}

function expectGeneralMutationEnvelope(kind: "fork" | "send", result: unknown): void {
	if (kind === "fork") {
		const envelope = parseDynamicToolCallResponse("fork_thread", result).envelope;
		if (envelope.tag !== "ok") {
			throw new Error("The controlled fork was not successful.");
		}
		const value = envelope.value as {
			readonly initialTurn: { readonly operationId: string };
		};
		expect(envelope.operationId).toMatch(operationPattern);
		expect(value.initialTurn.operationId).toMatch(operationPattern);
		expect(envelope).toEqual({
			tag: "ok",
			operationId: envelope.operationId,
			value: {
				threadId: "archboard:thread:s7468726561642d34",
				state: "executable",
				initialTurn: {
					delivery: "delivered",
					turnId: "archboard:turn:s7475726e2d33",
					operationId: value.initialTurn.operationId,
					reason: null,
				},
			},
		});
		return;
	}
	const envelope = parseDynamicToolCallResponse("send_message_to_thread", result).envelope;
	if (envelope.tag !== "ok") {
		throw new Error("The controlled send was not successful.");
	}
	expect(envelope.operationId).toMatch(operationPattern);
	expect(envelope).toEqual({
		tag: "ok",
		operationId: envelope.operationId,
		value: { threadId: "thread-3", delivery: "delivered" },
	});
}

export { expectGeneralQueryEnvelopes, expectGeneralMutationEnvelope };
