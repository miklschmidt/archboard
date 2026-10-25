import { expect, test } from "bun:test";

import { decodeServerNotification } from "@archboard/codex-app-server/protocol";
import type {
	CodexSession,
	SessionThreadItem,
	SessionThreadTurnPageResult,
} from "@archboard/codex-app-server/session";
import type { TransportServerNotification } from "@archboard/codex-app-server/transport";
import {
	createIdentityAuthorities,
	type IdentityAuthorities,
} from "@archboard/codex-app-server/identity";
import { createServerTimelineOwner } from "#server/projections/timeline/timeline.ts";
import {
	agentMessageItem,
	commandExecutionItem,
	contextCompactionItem,
	dynamicToolCallItem,
	executableLink,
	fileChangeItem,
	flush,
	mcpToolCallItem,
	planItem,
	reasoningItem,
	turnFixture,
	userMessageItem,
	webSearchItem,
} from "#tests/server/support/timeline/timeline-fixture.ts";

function notification(threadId: string): TransportServerNotification["notification"] {
	return decodeServerNotification({
		method: "turn/completed",
		params: {
			threadId,
			turn: {
				id: "notification-turn",
				items: [],
				itemsView: "full",
				status: "completed",
				error: null,
				startedAt: 1,
				completedAt: 2,
				durationMs: 1,
			},
		},
	});
}

function event(
	authorities: IdentityAuthorities,
	notifiedThreadId: string,
	child = authorities.identity.validator.childId,
	epoch = authorities.identity.validator.epoch,
): TransportServerNotification {
	return {
		correlation: { child, epoch, requestId: null },
		notification: notification(notifiedThreadId),
	};
}

test("timeline owner loads typed pages and projects every arm with its evidence", async () => {
	const authorities = createIdentityAuthorities();
	const decoder = authorities.identity.decoder;
	const threadId = decoder.adoptThreadId("timeline-thread");
	const turnId = decoder.adoptTurnId("timeline-turn");
	const commandItemId = decoder.adoptItemId("timeline-command");
	const approvalId = decoder.adoptApprovalId("timeline-approval");
	const items: readonly SessionThreadItem[] = [
		userMessageItem(authorities, "timeline-user", {
			type: "userMessage",
			clientId: null,
			content: [
				{ type: "text", text: "hello", text_elements: [] },
				{ type: "image", url: "https://example.invalid/diagram.png" },
			],
		}),
		agentMessageItem(authorities, "timeline-agent", {
			type: "agentMessage",
			text: "assistant answer",
			phase: null,
			memoryCitation: null,
			delivery: null,
			questions: null,
		}),
		mcpToolCallItem(authorities, "timeline-mcp", {
			type: "mcpToolCall",
			server: "example",
			tool: "inspect",
			status: "failed",
			arguments: { item: "payments" },
			appContext: null,
			mcpAppUi: null,
			pluginId: null,
			readOnlyHint: null,
			result: null,
			error: { message: "item not found" },
			durationMs: 12,
		}),
		dynamicToolCallItem(authorities, "timeline-dynamic", {
			type: "dynamicToolCall",
			namespace: "example_app",
			tool: "inspect",
			arguments: {},
			status: "failed",
			contentItems: null,
			success: false,
			durationMs: 3,
		}),
		userMessageItem(authorities, "timeline-steer", {
			type: "userMessage",
			clientId: null,
			content: [{ type: "text", text: "also check the renderer", text_elements: [] }],
		}),
		commandExecutionItem(authorities, "timeline-command", {
			type: "commandExecution",
			pluginId: null,
			scriptPath: null,
			command: "bun test",
			cwd: "/repo",
			processId: null,
			source: "agent",
			status: "completed",
			commandActions: [],
			aggregatedOutput: "1 pass\n",
			exitCode: 0,
			durationMs: 950,
		}),
		fileChangeItem(authorities, "timeline-file", {
			type: "fileChange",
			changes: [
				{
					path: "/repo/src/old.ts",
					kind: { type: "update", move_path: "/repo/src/new.ts" },
					diff: "--- a/src/old.ts\n+++ b/src/old.ts\n@@ -1,3 +1,4 @@\n keep\n-gone\n+added one\n+added two\n--- a removed line that looks like a header\n",
				},
				{ path: "/repo/src/created.ts", kind: { type: "add" }, diff: "one\ntwo\nthree" },
				{ path: "/repo/src/deleted.ts", kind: { type: "delete" }, diff: "one\ntwo\n" },
			],
			status: "completed",
		}),
		reasoningItem(authorities, "timeline-reasoning", {
			type: "reasoning",
			summary: ["first", "second"],
			content: [],
		}),
		planItem(authorities, "timeline-plan", {
			type: "plan",
			text: `${"p".repeat(16_500)}\0`,
		}),
		webSearchItem(authorities, "timeline-search", {
			type: "webSearch",
			query: "elk layered options",
			action: null,
			results: null,
		}),
		contextCompactionItem(authorities, "timeline-compaction"),
	];
	const turn = turnFixture(authorities, "timeline-turn", items, "failed", {
		startedAt: 1_700_000_000,
		completedAt: 1_700_000_004,
		durationMs: 4_200,
		error: {
			message: "stream disconnected",
			codexErrorInfo: null,
			additionalDetails: "retry the turn",
			misalignment: null,
		},
	});
	const turnRequests: Parameters<CodexSession["threadTurnsListPage"]>[0][] = [];
	const timelineRequests: Parameters<CodexSession["timelineListPage"]>[0][] = [];
	const session = {
		threadTurnsListPage: async (
			params: Parameters<CodexSession["threadTurnsListPage"]>[0],
		): Promise<SessionThreadTurnPageResult> => {
			turnRequests.push(params);
			return turnRequests.length === 1
				? { data: [turn], nextCursor: "turn-next", backwardsCursor: null }
				: { data: [], nextCursor: null, backwardsCursor: null };
		},
		timelineListPage: async (params: Parameters<CodexSession["timelineListPage"]>[0]) => {
			timelineRequests.push(params);
			return { data: [], nextCursor: "timeline-next", activeRealtimeSessionAtPageStart: null };
		},
	};
	let changes = 0;
	const owner = createServerTimelineOwner({
		session,
		identity: decoder,
		approvals: {
			inspectViews: () => [
				{
					snapshot: {
						threadId,
						turnId,
						itemId: commandItemId,
						approvalId,
						state: "pending",
					},
				},
			],
		},
		onChange: () => {
			changes += 1;
		},
	});

	const link = executableLink(authorities, threadId);
	const connection = {};
	expect(owner.read("chat-timeline", 1, link, true, connection)).toBeNull();
	await flush();
	const projection = owner.read("chat-timeline", 1, link, true, connection);
	if (projection === null) {
		throw new Error("timeline projection was not loaded");
	}

	expect(turnRequests).toEqual([
		{
			threadId,
			cursor: null,
			limit: 100,
			sortDirection: "desc",
			itemsView: "full",
		},
		{
			threadId,
			cursor: "turn-next",
			limit: 100,
			sortDirection: "desc",
			itemsView: "full",
		},
	]);
	expect(timelineRequests).toEqual([{ threadId, cursor: null, limit: 100 }]);
	expect(changes).toBe(1);
	expect(projection).toMatchObject({
		kind: "codex_timeline",
		threadId,
		cursor: "timeline-next",
		usage: null,
	});
	expect(projection.turns).toHaveLength(1);
	const projected = projection.turns[0];
	if (projected === undefined) {
		throw new Error("the turn was not projected");
	}
	expect(projected.turn).toEqual({
		id: turnId,
		status: "failed",
		startedAt: 1_700_000_000,
		completedAt: 1_700_000_004,
		durationMs: 4_200,
	});
	expect(projected.error).toEqual({ message: "stream disconnected", details: "retry the turn" });
	expect(projected.plan).toBeNull();
	// The person's prompt and their mid-turn steer keep their place in the turn.
	expect(projected.items.map((entry) => entry.kind)).toEqual([
		"user_message",
		"agent_message",
		"tool_call",
		"tool_call",
		"user_message",
		"command_execution",
		"approval_request",
		"file_change",
		"reasoning_summary",
		"plan",
		"web_search",
		"context_compaction",
	]);
	const [prompt, , mcp, dynamic, steer, command, approval, fileChange, , plan, search] =
		projected.items;
	expect(prompt).toMatchObject({ kind: "user_message", text: "hello\n[image]" });
	expect(steer).toMatchObject({ kind: "user_message", text: "also check the renderer" });
	expect(mcp).toMatchObject({
		kind: "tool_call",
		item: { tool: "inspect", status: "failed", durationMs: 12 },
		server: "example",
		arguments: '{"item":"payments"}',
		error: "item not found",
	});
	if (dynamic?.kind !== "tool_call") {
		throw new Error("the dynamic tool call was not projected");
	}
	expect(dynamic.server).toBe("example_app");
	expect(dynamic.item.durationMs).toBe(3);
	expect(dynamic.error).not.toBeNull();
	expect(command).toMatchObject({
		kind: "command_execution",
		item: { command: "bun test", status: "completed", exitCode: 0, durationMs: 950 },
		cwd: "/repo",
		output: { tail: "1 pass\n", truncated: false },
	});
	expect(approval).toEqual({
		kind: "approval_request",
		identity: { kind: "item", threadId, turnId, itemId: commandItemId, approvalId },
		state: "pending",
	});
	expect(fileChange).toMatchObject({
		kind: "file_change",
		changes: [
			{
				path: "/repo/src/old.ts",
				kind: "update",
				movePath: "/repo/src/new.ts",
				added: 2,
				removed: 2,
			},
			{ path: "/repo/src/created.ts", kind: "add", movePath: null, added: 3, removed: 0 },
			{ path: "/repo/src/deleted.ts", kind: "delete", movePath: null, added: 0, removed: 2 },
		],
		changesTruncated: false,
	});
	expect(JSON.stringify(fileChange)).not.toContain("added one");
	if (plan?.kind !== "plan") {
		throw new Error("plan item was not projected");
	}
	expect(plan.item.text.endsWith("…")).toBe(true);
	expect(plan.item.text.includes("\0")).toBe(false);
	expect(new TextEncoder().encode(plan.item.text).byteLength).toBeLessThanOrEqual(16_384);
	expect(search).toMatchObject({ kind: "web_search", query: "elk layered options" });
	expect(projected.presentation).toEqual({
		summary: "failed · user: hello · assistant: assistant answer",
		outputs: { included: true, truncated: true },
	});
	owner.dispose();
});

test("timeline owner ignores stale link loads and recovers after a refresh failure", async () => {
	const authorities = createIdentityAuthorities();
	const firstThreadId = authorities.identity.decoder.adoptThreadId("timeline-first-thread");
	const secondThreadId = authorities.identity.decoder.adoptThreadId("timeline-second-thread");
	const firstPage = Promise.withResolvers<SessionThreadTurnPageResult>();
	const secondPage = Promise.withResolvers<SessionThreadTurnPageResult>();
	const pending = new Map<string, Promise<SessionThreadTurnPageResult>>([
		[firstThreadId, firstPage.promise],
		[secondThreadId, secondPage.promise],
	]);
	const session = {
		threadTurnsListPage: async (
			params: Parameters<CodexSession["threadTurnsListPage"]>[0],
		): Promise<SessionThreadTurnPageResult> => {
			const page = pending.get(params.threadId);
			if (page === undefined) {
				throw new Error(`unexpected thread ${params.threadId}`);
			}
			return page;
		},
		timelineListPage: async (_params: Parameters<CodexSession["timelineListPage"]>[0]) => ({
			data: [],
			nextCursor: null,
			activeRealtimeSessionAtPageStart: null,
		}),
	};
	let changes = 0;
	const owner = createServerTimelineOwner({
		session,
		identity: authorities.identity.decoder,
		approvals: { inspectViews: () => [] },
		onChange: () => {
			changes += 1;
		},
	});
	const firstLink = executableLink(authorities, firstThreadId);
	const secondLink = executableLink(authorities, secondThreadId);
	const connection = {};
	owner.read("chat-timeline", 1, firstLink, true, connection);
	owner.read("chat-timeline", 2, secondLink, true, connection);
	firstPage.resolve({
		data: [turnFixture(authorities, "first-turn", [])],
		nextCursor: null,
		backwardsCursor: null,
	});
	await flush();
	expect(changes).toBe(0);
	expect(owner.read("chat-timeline", 2, secondLink, true, connection)).toBeNull();
	secondPage.resolve({
		data: [turnFixture(authorities, "second-turn", [])],
		nextCursor: null,
		backwardsCursor: null,
	});
	await flush();
	const projection = owner.read("chat-timeline", 2, secondLink, true, connection);
	if (projection === null) {
		throw new Error("replacement timeline projection was not loaded");
	}
	expect(changes).toBe(1);
	expect(projection.threadId).toBe(secondThreadId);
	expect(projection.turns[0]?.turn.id).toBe(
		authorities.identity.decoder.adoptTurnId("second-turn"),
	);
	owner.dispose();
});

test("timeline owner waits for thread capability and refreshes only the current correlated thread", async () => {
	const authorities = createIdentityAuthorities();
	const foreign = createIdentityAuthorities();
	const threadId = authorities.identity.decoder.adoptThreadId("timeline-refresh-thread");
	let calls = 0;
	let fail = true;
	const session = {
		threadTurnsListPage: async (
			_params: Parameters<CodexSession["threadTurnsListPage"]>[0],
		): Promise<SessionThreadTurnPageResult> => {
			calls += 1;
			if (fail) {
				fail = false;
				throw new Error("refresh failed");
			}
			return {
				data: [turnFixture(authorities, "refresh-turn", [])],
				nextCursor: null,
				backwardsCursor: null,
			};
		},
		timelineListPage: async (_params: Parameters<CodexSession["timelineListPage"]>[0]) => ({
			data: [],
			nextCursor: null,
			activeRealtimeSessionAtPageStart: null,
		}),
	};
	let changes = 0;
	const owner = createServerTimelineOwner({
		session,
		identity: authorities.identity.decoder,
		approvals: { inspectViews: () => [] },
		onChange: () => {
			changes += 1;
		},
	});
	const link = executableLink(authorities, threadId);
	const connection = {};
	owner.read("chat-timeline", 1, link, false, connection);
	await flush();
	expect(calls).toBe(0);
	owner.read("chat-timeline", 1, link, true, connection);
	await flush();
	expect({
		calls,
		changes,
		projection: owner.read("chat-timeline", 1, link, true, connection),
	}).toEqual({
		calls: 1,
		changes: 0,
		projection: null,
	});

	owner.onNotification(event(authorities, "other-thread"));
	owner.onNotification(
		event(
			foreign,
			authorities.identity.decoder.serializeCodexIdentity(threadId),
			foreign.identity.validator.childId,
			foreign.identity.validator.epoch,
		),
	);
	await flush();
	expect(calls).toBe(1);

	owner.onNotification(
		event(authorities, authorities.identity.decoder.serializeCodexIdentity(threadId)),
	);
	await flush();
	const projection = owner.read("chat-timeline", 1, link, true, connection);
	if (projection === null) {
		throw new Error("timeline did not recover after notification");
	}
	expect({ calls, changes, threadId: projection.threadId }).toEqual({
		calls: 2,
		changes: 1,
		threadId,
	});
	owner.dispose();
});
