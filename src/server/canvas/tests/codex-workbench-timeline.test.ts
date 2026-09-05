import { expect, test } from "bun:test";

import { decodeServerNotification } from "../../../runtime/codex-protocol/index.js";
import type {
	CodexSession,
	SessionThreadItem,
	SessionThreadTurnPageResult,
} from "../../../runtime/codex-session/index.js";
import type { TransportServerNotification } from "../../../runtime/codex-transport/index.js";
import type { ThreadLinkSnapshot } from "../../../runtime/codex-thread-link/index.js";
import {
	createIdentityAuthorities,
	type IdentityAuthorities,
	type ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import { createCanvasTimelineOwner } from "../codex-workbench-adapters.js";
import {
	agentMessageItem,
	commandExecutionItem,
	dynamicToolCallItem,
	fileChangeItem,
	mcpToolCallItem,
	planItem,
	reasoningItem,
	turnFixture,
	userMessageItem,
} from "./support/codex-workbench-timeline-fixture.js";

function executableLink(authorities: IdentityAuthorities, threadId: ThreadId): ThreadLinkSnapshot {
	return {
		kind: "thread_link",
		state: "executable",
		childId: authorities.identity.validator.childId,
		epoch: authorities.identity.validator.epoch,
		threadId,
		source: "appServer",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: true,
		reason: null,
	};
}

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

async function flush(): Promise<void> {
	for (let index = 0; index < 8; index += 1) {
		await Promise.resolve();
	}
}

test("timeline owner loads typed pages, maps seven arms, and bounds the projection", async () => {
	const authorities = createIdentityAuthorities();
	const threadId = authorities.identity.decoder.adoptThreadId("timeline-thread");
	const turnId = authorities.identity.decoder.adoptTurnId("timeline-turn");
	const commandItemId = authorities.identity.decoder.adoptItemId("timeline-command");
	const approvalId = authorities.identity.decoder.adoptApprovalId("timeline-approval");
	const items: readonly SessionThreadItem[] = [
		userMessageItem(authorities, "timeline-user", {
			type: "userMessage",
			clientId: null,
			content: [{ type: "text", text: "hello", text_elements: [] }],
		}),
		agentMessageItem(authorities, "timeline-agent", {
			type: "agentMessage",
			text: "assistant answer",
			phase: null,
			memoryCitation: null,
			delivery: null,
		}),
		mcpToolCallItem(authorities, "timeline-mcp", {
			type: "mcpToolCall",
			server: "private-server",
			tool: "inspect",
			status: "completed",
			arguments: { secret: "not projected" },
			appContext: null,
			pluginId: null,
			readOnlyHint: null,
			result: null,
			error: null,
			durationMs: 1,
		}),
		dynamicToolCallItem(authorities, "timeline-dynamic", {
			type: "dynamicToolCall",
			namespace: "archboard_app",
			tool: "inspect",
			arguments: {},
			status: "failed",
			contentItems: null,
			success: false,
			durationMs: 1,
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
			aggregatedOutput: "private output",
			exitCode: 0,
			durationMs: 1,
		}),
		fileChangeItem(authorities, "timeline-file", {
			type: "fileChange",
			changes: [],
			status: "declined",
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
	];
	const turn = turnFixture(authorities, "timeline-turn", items);
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
	const owner = createCanvasTimelineOwner({
		session,
		identity: authorities.identity.decoder,
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
	expect(owner.read("pane-timeline", 1, link, true, connection)).toBeNull();
	await flush();
	const projection = owner.read("pane-timeline", 1, link, true, connection);
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
	expect(projection).toMatchObject({ kind: "codex_timeline", threadId, cursor: "timeline-next" });
	expect(projection.turns).toHaveLength(1);
	expect(projection.turns[0]?.turn).toEqual({ id: turnId, status: "completed" });
	expect(projection.turns[0]?.items.map((entry) => entry.kind)).toEqual([
		"agent_message",
		"tool_call",
		"tool_call",
		"command_execution",
		"approval_request",
		"file_change",
		"reasoning_summary",
		"plan",
	]);
	expect(projection.turns[0]?.items[0]).toEqual({
		kind: "agent_message",
		item: {
			type: "agentMessage",
			id: authorities.identity.decoder.adoptItemId("timeline-agent"),
			text: "assistant answer",
		},
	});
	expect(projection.turns[0]?.items[4]).toEqual({
		kind: "approval_request",
		identity: { kind: "item", threadId, turnId, itemId: commandItemId, approvalId },
		state: "pending",
	});
	const projectedPlan = projection.turns[0]?.items[7];
	if (projectedPlan?.kind !== "plan") {
		throw new Error("plan item was not projected");
	}
	expect(projectedPlan.item.text.endsWith("…")).toBe(true);
	expect(projectedPlan.item.text.includes("\0")).toBe(false);
	expect(new TextEncoder().encode(projectedPlan.item.text).byteLength).toBeLessThanOrEqual(16_384);
	expect(projection.turns[0]?.presentation).toEqual({
		summary: "completed · user: hello · assistant: assistant answer",
		outputs: { included: true, truncated: true },
	});
	expect(JSON.stringify(projection)).not.toContain("private-server");
	expect(JSON.stringify(projection)).not.toContain("private output");
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
	const owner = createCanvasTimelineOwner({
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
	owner.read("pane-timeline", 1, firstLink, true, connection);
	owner.read("pane-timeline", 2, secondLink, true, connection);
	firstPage.resolve({
		data: [turnFixture(authorities, "first-turn", [])],
		nextCursor: null,
		backwardsCursor: null,
	});
	await flush();
	expect(changes).toBe(0);
	expect(owner.read("pane-timeline", 2, secondLink, true, connection)).toBeNull();
	secondPage.resolve({
		data: [turnFixture(authorities, "second-turn", [])],
		nextCursor: null,
		backwardsCursor: null,
	});
	await flush();
	const projection = owner.read("pane-timeline", 2, secondLink, true, connection);
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
	const owner = createCanvasTimelineOwner({
		session,
		identity: authorities.identity.decoder,
		approvals: { inspectViews: () => [] },
		onChange: () => {
			changes += 1;
		},
	});
	const link = executableLink(authorities, threadId);
	const connection = {};
	owner.read("pane-timeline", 1, link, false, connection);
	await flush();
	expect(calls).toBe(0);
	owner.read("pane-timeline", 1, link, true, connection);
	await flush();
	expect({
		calls,
		changes,
		projection: owner.read("pane-timeline", 1, link, true, connection),
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
	const projection = owner.read("pane-timeline", 1, link, true, connection);
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
