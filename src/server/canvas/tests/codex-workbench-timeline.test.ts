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
import {
	createCanvasBrowserGatewayOptions,
	createCanvasTimelineOwner,
	type CanvasBrowserBindingState,
	type CanvasTimelineOwner,
} from "../codex-workbench-adapters.js";
import type { CodexWorkbenchComponents } from "../codex-workbench-generation.js";
import type { BrowserProjectionContext } from "../../codex-workbench/index.js";

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

function turnFixture(
	authorities: IdentityAuthorities,
	rawId: string,
	items: readonly SessionThreadItem[],
	status: SessionTurn["status"] = "completed",
): SessionTurn {
	return {
		id: authorities.identity.decoder.adoptTurnId(rawId),
		items,
		itemsView: "full",
		status,
		error: null,
		startedAt: 1,
		completedAt: 2,
		durationMs: 1,
	} as SessionTurn;
}

type SessionThreadItemWithoutId = SessionThreadItem extends infer Item
	? Item extends { readonly id: unknown }
		? Omit<Item, "id">
		: never
	: never;

function item(
	authorities: IdentityAuthorities,
	rawId: string,
	value: SessionThreadItemWithoutId,
): SessionThreadItem {
	return {
		...value,
		id: authorities.identity.decoder.adoptItemId(rawId),
	} as SessionThreadItem;
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

test("canvas gateway passes its exact browser binding to the timeline owner", () => {
	const authorities = createIdentityAuthorities();
	const threadId = authorities.identity.decoder.adoptThreadId("gateway-timeline-thread");
	const link = executableLink(authorities, threadId);
	const timelineValue = { kind: "codex_timeline", threadId, turns: [], cursor: null } as never;
	const received: {
		current: {
			readonly paneId: string;
			readonly revision: number;
			readonly link: ThreadLinkSnapshot;
			readonly threadCapable: boolean;
		} | null;
	} = { current: null };
	const timeline: CanvasTimelineOwner = {
		read: (paneId, revision, receivedLink, threadCapable) => {
			received.current = { paneId, revision, link: receivedLink, threadCapable };
			return timelineValue;
		},
		onNotification: () => undefined,
		dispose: () => undefined,
	};
	const components = {
		identity: { operation: { issuer: { mintOperationId: () => "operation" as never } } },
		workhorse: { snapshot: () => ({ state: "stopped", start: null }) },
		coordinator: {
			snapshot: () => ({
				state: "unbound",
				threadId: null,
				configured: null,
				effective: null,
				approvalPolicy: null,
				approvalsReviewer: null,
				sandboxPolicy: null,
				activePermissionProfile: null,
			}),
		},
		semanticDelivery: { inspect: () => [], snapshot: () => ({ binding: null }) },
		semanticPublisher: {},
		realtime: { generation: () => null, transcript: () => [] },
		approvals: { inspectViews: () => [] },
	} as unknown as Omit<CodexWorkbenchComponents, "gateway">;
	const state = {
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "unknown", reason: "fixture" },
		login: { kind: "login", state: "idle" },
		queue: { kind: "codex_queue", submissions: null },
	} as CanvasBrowserBindingState;
	const options = createCanvasBrowserGatewayOptions({
		components,
		dynamicApprovals: {
			pending: () => [],
			bindLease: () => undefined,
			browser: { pending: () => [] },
		} as never,
		state,
		timeline,
		leaseLedger: { active: null, retired: new Map() },
		checkoutRoot: "/repo",
		contextForOperation: () => ({}) as never,
		onChange: () => () => undefined,
	});
	const context = {
		browserId: "browser-timeline",
		paneId: "pane-timeline",
		binding: {
			paneId: "pane-timeline",
			revision: 7,
			link,
			cas: {
				revision: 7,
				paneId: "pane-timeline",
				childId: link.childId,
				epoch: link.epoch,
				threadId: link.threadId,
			},
		},
		lease: null,
		mediaReady: false,
	} satisfies BrowserProjectionContext;
	const projection = options.projection.read(context);
	expect(projection.timeline).toBe(timelineValue);
	const captured = received.current;
	if (captured === null) throw new Error("the gateway did not ask the timeline owner to read");
	expect(captured.paneId).toBe("pane-timeline");
	expect(captured.revision).toBe(7);
	expect(captured.link).toBe(link);
	expect(captured.threadCapable).toBeTrue();
});

async function flush(): Promise<void> {
	for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

test("timeline owner loads typed pages, maps seven arms, and bounds the projection", async () => {
	const authorities = createIdentityAuthorities();
	const threadId = authorities.identity.decoder.adoptThreadId("timeline-thread");
	const turnId = authorities.identity.decoder.adoptTurnId("timeline-turn");
	const commandItemId = authorities.identity.decoder.adoptItemId("timeline-command");
	const approvalId = authorities.identity.decoder.adoptApprovalId("timeline-approval");
	const items: readonly SessionThreadItem[] = [
		item(authorities, "timeline-user", {
			type: "userMessage",
			clientId: null,
			content: [{ type: "text", text: "hello", text_elements: [] }],
		}),
		item(authorities, "timeline-agent", {
			type: "agentMessage",
			text: "assistant answer",
			phase: null,
			memoryCitation: null,
			delivery: null,
		}),
		item(authorities, "timeline-mcp", {
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
		item(authorities, "timeline-dynamic", {
			type: "dynamicToolCall",
			namespace: "archboard_app",
			tool: "inspect",
			arguments: {},
			status: "failed",
			contentItems: null,
			success: false,
			durationMs: 1,
		}),
		{
			type: "commandExecution",
			id: commandItemId,
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
		} as SessionThreadItem,
		item(authorities, "timeline-file", {
			type: "fileChange",
			changes: [],
			status: "declined",
		}),
		item(authorities, "timeline-reasoning", {
			type: "reasoning",
			summary: ["first", "second"],
			content: [],
		}),
		item(authorities, "timeline-plan", {
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
	expect(owner.read("pane-timeline", 1, link, true)).toBeNull();
	await flush();
	const projection = owner.read("pane-timeline", 1, link, true);
	if (projection === null) throw new Error("timeline projection was not loaded");

	expect(turnRequests).toEqual([
		{
			threadId,
			cursor: null,
			limit: 100,
			sortDirection: "asc",
			itemsView: "full",
		},
		{
			threadId,
			cursor: "turn-next",
			limit: 100,
			sortDirection: "asc",
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
	if (projectedPlan?.kind !== "plan") throw new Error("plan item was not projected");
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
			if (page === undefined) throw new Error(`unexpected thread ${params.threadId}`);
			return page;
		},
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
	owner.read("pane-timeline", 1, firstLink, true);
	owner.read("pane-timeline", 2, secondLink, true);
	firstPage.resolve({
		data: [turnFixture(authorities, "first-turn", [])],
		nextCursor: null,
		backwardsCursor: null,
	});
	await flush();
	expect(changes).toBe(0);
	expect(owner.read("pane-timeline", 2, secondLink, true)).toBeNull();
	secondPage.resolve({
		data: [turnFixture(authorities, "second-turn", [])],
		nextCursor: null,
		backwardsCursor: null,
	});
	await flush();
	const projection = owner.read("pane-timeline", 2, secondLink, true);
	if (projection === null) throw new Error("replacement timeline projection was not loaded");
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
	owner.read("pane-timeline", 1, link, false);
	await flush();
	expect(calls).toBe(0);
	owner.read("pane-timeline", 1, link, true);
	await flush();
	expect({ calls, changes, projection: owner.read("pane-timeline", 1, link, true) }).toEqual({
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
	const projection = owner.read("pane-timeline", 1, link, true);
	if (projection === null) throw new Error("timeline did not recover after notification");
	expect({ calls, changes, threadId: projection.threadId }).toEqual({
		calls: 2,
		changes: 1,
		threadId,
	});
	owner.dispose();
});
