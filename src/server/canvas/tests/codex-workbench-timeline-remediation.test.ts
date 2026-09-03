import { expect, test } from "bun:test";

import { decodeServerNotification } from "../../../runtime/codex-protocol/index.js";
import type {
	CodexSession,
	SessionThreadItem,
	SessionThreadTurnPageResult,
	SessionTurn,
} from "../../../runtime/codex-session/index.js";
import type { TransportServerNotification } from "../../../runtime/codex-transport/index.js";
import type { ThreadLinkSnapshot } from "../../../runtime/codex-thread-link/index.js";
import {
	createIdentityAuthorities,
	type IdentityAuthorities,
	type ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import { createCanvasTimelineOwner } from "../codex-workbench-adapters.js";

function link(authorities: IdentityAuthorities, threadId: ThreadId): ThreadLinkSnapshot {
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

function turn(
	authorities: IdentityAuthorities,
	rawId: string,
	items: readonly SessionThreadItem[],
): SessionTurn {
	return {
		id: authorities.identity.decoder.adoptTurnId(rawId),
		items,
		itemsView: "full",
		status: "completed",
		error: null,
		startedAt: 1,
		completedAt: 2,
		durationMs: 1,
	} as SessionTurn;
}

type ItemWithoutId = SessionThreadItem extends infer Item
	? Item extends { readonly id: unknown }
		? Omit<Item, "id">
		: never
	: never;

function item(
	authorities: IdentityAuthorities,
	rawId: string,
	value: ItemWithoutId,
): SessionThreadItem {
	return { ...value, id: authorities.identity.decoder.adoptItemId(rawId) } as SessionThreadItem;
}

function event(authorities: IdentityAuthorities, threadId: ThreadId): TransportServerNotification {
	return {
		correlation: {
			child: authorities.identity.validator.childId,
			epoch: authorities.identity.validator.epoch,
			requestId: null,
		},
		notification: decodeServerNotification({
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
		}),
	};
}

async function flush(): Promise<void> {
	for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

test("retiring a closed pane drops its refresh and notification eligibility", async () => {
	const authorities = createIdentityAuthorities();
	const threadId = authorities.identity.decoder.adoptThreadId("retired-thread");
	const connection = {};
	let calls = 0;
	let changes = 0;
	const session = {
		threadTurnsListPage: async (_params: Parameters<CodexSession["threadTurnsListPage"]>[0]) => {
			calls += 1;
			return {
				data: [turn(authorities, "retired-turn", [])],
				nextCursor: null,
				backwardsCursor: null,
			} satisfies SessionThreadTurnPageResult;
		},
		timelineListPage: async (_params: Parameters<CodexSession["timelineListPage"]>[0]) => ({
			data: [],
			nextCursor: null,
			activeRealtimeSessionAtPageStart: null,
		}),
	};
	const owner = createCanvasTimelineOwner({
		session,
		identity: authorities.identity.decoder,
		approvals: { inspectViews: () => [] },
		onChange: () => {
			changes += 1;
		},
	});
	owner.read("pane-retired", 1, link(authorities, threadId), true, connection);
	await flush();
	expect(changes).toBe(1);
	owner.retire("pane-retired", connection);
	owner.onNotification(event(authorities, threadId));
	await flush();
	expect({ calls, changes }).toEqual({ calls: 1, changes: 1 });
	owner.dispose();
});

test("ingests bounded source items and takes the cursor from timeline/list", async () => {
	const authorities = createIdentityAuthorities();
	const threadId = authorities.identity.decoder.adoptThreadId("bounded-ingest-thread");
	const sourceItems = [
		item(authorities, "bounded-user", {
			type: "userMessage",
			clientId: null,
			content: [{ type: "text", text: "hello", text_elements: [] }],
		}),
		item(authorities, "bounded-agent", {
			type: "agentMessage",
			text: "answer",
			phase: null,
			memoryCitation: null,
			delivery: null,
		}),
	];
	Object.defineProperty(sourceItems, 2, {
		get: () => {
			throw new Error("the item beyond the ingestion limit was inspected");
		},
		configurable: true,
	});
	const session = {
		threadTurnsListPage: async (
			_params: Parameters<CodexSession["threadTurnsListPage"]>[0],
		): Promise<SessionThreadTurnPageResult> => ({
			data: [turn(authorities, "bounded-turn", sourceItems)],
			nextCursor: null,
			backwardsCursor: null,
		}),
		timelineListPage: async (_params: Parameters<CodexSession["timelineListPage"]>[0]) => ({
			data: [],
			nextCursor: "timeline-cursor",
			activeRealtimeSessionAtPageStart: null,
		}),
	};
	const owner = createCanvasTimelineOwner({
		session,
		identity: authorities.identity.decoder,
		approvals: { inspectViews: () => [] },
		onChange: () => undefined,
		budget: { maxTurns: 1, maxItemsPerTurn: 2, maxBytes: 8_192 },
	});
	const connection = {};
	const timelineLink = link(authorities, threadId);
	owner.read("pane-bounded", 1, timelineLink, true, connection);
	await flush();
	const projection = owner.read("pane-bounded", 1, timelineLink, true, connection);
	if (projection === null) throw new Error("bounded timeline was not loaded");
	expect(projection.cursor).toBe("timeline-cursor");
	expect(projection.turns[0]?.items.map((entry) => entry.kind)).toEqual(["agent_message"]);
	expect(projection.turns[0]?.presentation.outputs.truncated).toBeTrue();
	owner.dispose();
});

test("caps final item chronology after matching and unmatched approvals", async () => {
	const authorities = createIdentityAuthorities();
	const threadId = authorities.identity.decoder.adoptThreadId("approval-cap-thread");
	const turnId = authorities.identity.decoder.adoptTurnId("approval-cap-turn");
	const commandId = authorities.identity.decoder.adoptItemId("approval-command");
	const unmatchedId = authorities.identity.decoder.adoptItemId("approval-unmatched");
	const approvals = [
		{
			snapshot: {
				threadId,
				turnId,
				itemId: commandId,
				approvalId: authorities.identity.decoder.adoptApprovalId("approval-matched"),
				state: "pending" as const,
			},
		},
		{
			snapshot: {
				threadId,
				turnId,
				itemId: unmatchedId,
				approvalId: authorities.identity.decoder.adoptApprovalId("approval-unmatched"),
				state: "pending" as const,
			},
		},
	];
	const session = {
		threadTurnsListPage: async (_params: Parameters<CodexSession["threadTurnsListPage"]>[0]) => ({
			data: [
				turn(authorities, "approval-cap-turn", [
					item(authorities, "approval-command", {
						type: "commandExecution",
						pluginId: null,
						scriptPath: null,
						command: "bun test",
						cwd: "/repo",
						processId: null,
						status: "completed",
						commandActions: [],
						aggregatedOutput: "output",
						source: "agent",
						exitCode: 0,
						durationMs: 1,
					}),
					item(authorities, "approval-file", {
						type: "fileChange",
						changes: [],
						status: "completed",
					}),
				]),
			],
			nextCursor: null,
			backwardsCursor: null,
		}),
		timelineListPage: async (_params: Parameters<CodexSession["timelineListPage"]>[0]) => ({
			data: [],
			nextCursor: null,
			activeRealtimeSessionAtPageStart: null,
		}),
	};
	const owner = createCanvasTimelineOwner({
		session,
		identity: authorities.identity.decoder,
		approvals: { inspectViews: () => approvals },
		onChange: () => undefined,
		budget: { maxTurns: 1, maxItemsPerTurn: 3, maxBytes: 8_192 },
	});
	const connection = {};
	const timelineLink = link(authorities, threadId);
	owner.read("pane-approval-cap", 1, timelineLink, true, connection);
	await flush();
	const projection = owner.read("pane-approval-cap", 1, timelineLink, true, connection);
	if (projection === null) throw new Error("approval timeline was not loaded");
	expect(projection.turns[0]?.items.map((entry) => entry.kind)).toEqual([
		"command_execution",
		"approval_request",
		"file_change",
	]);
	expect(projection.turns[0]?.items).not.toContainEqual(
		expect.objectContaining({ identity: expect.objectContaining({ itemId: unmatchedId }) }),
	);
	expect(projection.turns[0]?.presentation.outputs).toEqual({ included: true, truncated: true });
	owner.dispose();
});

test("keeps the compact timeline projection below its injected byte budget", async () => {
	const authorities = createIdentityAuthorities();
	const threadId = authorities.identity.decoder.adoptThreadId("timeline-byte-thread");
	const turns = Array.from({ length: 4 }, (_, index) =>
		turn(authorities, `byte-turn-${index}`, [
			item(authorities, `byte-agent-${index}`, {
				type: "agentMessage",
				text: "x".repeat(600),
				phase: null,
				memoryCitation: null,
				delivery: null,
			}),
		]),
	);
	const session = {
		threadTurnsListPage: async (_params: Parameters<CodexSession["threadTurnsListPage"]>[0]) => ({
			data: turns,
			nextCursor: null,
			backwardsCursor: null,
		}),
		timelineListPage: async (_params: Parameters<CodexSession["timelineListPage"]>[0]) => ({
			data: [],
			nextCursor: null,
			activeRealtimeSessionAtPageStart: null,
		}),
	};
	const owner = createCanvasTimelineOwner({
		session,
		identity: authorities.identity.decoder,
		approvals: { inspectViews: () => [] },
		onChange: () => undefined,
		budget: { maxTurns: 4, maxItemsPerTurn: 2, maxBytes: 5_000 },
	});
	const connection = {};
	const timelineLink = link(authorities, threadId);
	owner.read("pane-byte-budget", 1, timelineLink, true, connection);
	await flush();
	const projection = owner.read("pane-byte-budget", 1, timelineLink, true, connection);
	if (projection === null) throw new Error("byte-budget timeline was not loaded");
	const bytes = new TextEncoder().encode(JSON.stringify(projection)).byteLength;
	expect(bytes).toBeLessThanOrEqual(5_000);
	expect(projection.turns.length).toBeLessThan(turns.length);
	expect(projection.turns.at(-1)?.presentation.outputs.truncated).toBeTrue();
	owner.dispose();
});
