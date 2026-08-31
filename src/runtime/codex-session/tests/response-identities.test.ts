import { describe, expect, test } from "bun:test";

import {
	createIdentityAuthority,
	IdentityValidationError,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	CodexSessionMutationError,
	type SessionAgentMessageItem,
	type SessionCollabAgentItem,
	type SessionSubAgentActivityItem,
	type SessionThread,
} from "../index.js";
import { createSessionFixture, threadFixture, type SessionFixture } from "./support.js";

async function rejected(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("expected the operation to reject");
}

async function readyFixture(): Promise<SessionFixture> {
	const fixture = createSessionFixture();
	await fixture.session.initialize();
	fixture.transport.enqueueResponse("account/read", {
		account: { type: "chatgpt", email: null, planType: "pro" },
		requiresOpenaiAuth: true,
	});
	await fixture.session.accountRead();
	return fixture;
}

const richItems = [
	{
		type: "agentMessage",
		id: "item-agent",
		text: "nested",
		phase: null,
		memoryCitation: { entries: [], threadIds: ["thread-parent"] },
		delivery: null,
	},
	{
		type: "collabAgentToolCall",
		id: "item-collab",
		tool: "sendMessage",
		status: "completed",
		senderThreadId: "thread-parent",
		receiverThreadIds: ["thread-child", "thread-parent"],
		prompt: null,
		model: null,
		reasoningEffort: null,
		agentsStates: {
			"thread-parent": { status: "completed", message: null },
			"thread-child": { status: "running", message: "working" },
		},
	},
	{
		type: "subAgentActivity",
		id: "item-subagent",
		kind: "started",
		agentThreadId: "thread-child",
		agentPath: "/root/worker",
	},
] as const;

const richTurn = {
	id: "turn-rich",
	items: richItems,
	itemsView: "full",
	status: "completed",
	error: null,
	startedAt: 1,
	completedAt: 2,
	durationMs: 1,
} as const;

const richThread = {
	...threadFixture,
	id: "thread-child",
	forkedFromId: "thread-parent",
	parentThreadId: "thread-parent",
	source: {
		subAgent: {
			thread_spawn: {
				parent_thread_id: "thread-parent",
				depth: 1,
				agent_path: "/root/worker",
				agent_nickname: null,
				agent_role: "worker",
			},
		},
	},
	turns: [richTurn],
} as const;

function threadStartResponse(thread: unknown) {
	return {
		thread,
		model: "gpt-5.6-luna",
		modelProvider: "openai",
		serviceTier: null,
		cwd: "/tmp/archboard",
		runtimeWorkspaceRoots: ["/tmp/archboard"],
		instructionSources: [],
		approvalPolicy: "never",
		approvalsReviewer: "user",
		sandbox: { type: "dangerFullAccess" },
		activePermissionProfile: null,
		reasoningEffort: "medium",
		multiAgentMode: "explicitRequestOnly",
	};
}

function queueResponse(id: string) {
	return {
		id,
		input: [{ type: "text", text: "queued", text_elements: [] }],
		clientUserMessageId: `client-${id}`,
	};
}

function expectRawIdentity(
	fixture: SessionFixture,
	identity: Parameters<SessionFixture["identity"]["decoder"]["serializeCodexIdentity"]>[0],
	raw: string,
): void {
	expect(fixture.identity.decoder.serializeCodexIdentity(identity)).toBe(raw);
}

function expectRichThread(fixture: SessionFixture, thread: SessionThread): void {
	expectRawIdentity(fixture, thread.id, "thread-child");
	if (!thread.forkedFromId || !thread.parentThreadId)
		throw new Error("rich thread ancestry was not returned");
	expect(thread.forkedFromId).toBe(thread.parentThreadId);
	expectRawIdentity(fixture, thread.parentThreadId, "thread-parent");
	if (
		typeof thread.source !== "object" ||
		!("subAgent" in thread.source) ||
		typeof thread.source.subAgent !== "object" ||
		!("thread_spawn" in thread.source.subAgent)
	)
		throw new Error("rich thread source was not returned");
	expect(thread.source.subAgent.thread_spawn.parent_thread_id).toBe(thread.parentThreadId);
	const turn = thread.turns[0];
	if (!turn) throw new Error("rich turn was not returned");
	expectRawIdentity(fixture, turn.id, "turn-rich");
	const agent = turn.items.find(
		(item): item is SessionAgentMessageItem => item.type === "agentMessage",
	);
	const collab = turn.items.find(
		(item): item is SessionCollabAgentItem => item.type === "collabAgentToolCall",
	);
	const subagent = turn.items.find(
		(item): item is SessionSubAgentActivityItem => item.type === "subAgentActivity",
	);
	if (!agent?.memoryCitation || !collab || !subagent)
		throw new Error("rich identity-bearing items were not returned");
	expect(agent.memoryCitation.threadIds).toEqual([thread.parentThreadId]);
	expect(collab.senderThreadId).toBe(thread.parentThreadId);
	expect(collab.receiverThreadIds).toEqual([thread.id, thread.parentThreadId]);
	expect(Object.keys(collab.agentsStates)).toEqual([thread.parentThreadId, thread.id]);
	expect(collab.agentsStates[thread.id]).toEqual({ status: "running", message: "working" });
	expect(subagent.agentThreadId).toBe(thread.id);
	for (const [item, raw] of [
		[agent, "item-agent"],
		[collab, "item-collab"],
		[subagent, "item-subagent"],
	] as const)
		expectRawIdentity(fixture, item.id, raw);
}

describe("Codex session response identities", () => {
	test("adopts every non-realtime result shape, nested identities, duplicate IDs, and pages", async () => {
		const fixture = await readyFixture();
		try {
			fixture.transport.enqueueResponse("thread/start", threadStartResponse(richThread) as never);
			const started = await fixture.session.threadStart({});
			expectRichThread(fixture, started.thread);
			const threadId = started.thread.id;

			fixture.transport.enqueueResponse(
				"thread/fork",
				threadStartResponse({ ...richThread, id: "thread-forked" }) as never,
			);
			const forked = await fixture.session.threadFork({ threadId });
			expectRawIdentity(fixture, forked.thread.id, "thread-forked");

			fixture.transport.enqueueResponse("thread/list", {
				data: [richThread, richThread],
				nextCursor: "thread-next",
				backwardsCursor: "thread-back",
			} as never);
			const threads = await fixture.session.threadListPage({});
			expect(threads.nextCursor).toBe("thread-next");
			expect(threads.backwardsCursor).toBe("thread-back");
			expect(threads.data[0]?.id).toBe(threads.data[1]?.id);
			if (!threads.data[0]) throw new Error("thread page was empty");
			expectRichThread(fixture, threads.data[0]);

			fixture.transport.enqueueResponse("thread/loaded/list", {
				data: ["thread-child", "thread-child"],
				nextCursor: "loaded-next",
			} as never);
			const loaded = await fixture.session.threadLoadedListPage({});
			expect(loaded.data[0]).toBe(loaded.data[1]);
			expect(loaded.data[0]).toBe(threadId);
			expect(loaded.nextCursor).toBe("loaded-next");

			fixture.transport.enqueueResponse("thread/read", { thread: richThread } as never);
			const read = await fixture.session.threadRead({ threadId });
			expectRichThread(fixture, read.thread);

			fixture.transport.enqueueResponse("thread/turns/list", {
				data: [richTurn],
				nextCursor: "turn-next",
				backwardsCursor: "turn-back",
			} as never);
			const turns = await fixture.session.threadTurnsListPage({ threadId });
			const listedTurn = turns.data[0];
			if (!listedTurn) throw new Error("turn page was empty");
			expectRawIdentity(fixture, listedTurn.id, "turn-rich");
			expect(turns.nextCursor).toBe("turn-next");
			expect(turns.backwardsCursor).toBe("turn-back");

			fixture.transport.enqueueResponse("thread/items/list", {
				data: [{ turnId: "turn-rich", item: richItems[0] }],
				nextCursor: "item-next",
				backwardsCursor: "item-back",
			} as never);
			const items = await fixture.session.threadItemsListPage({ threadId });
			expect(items.data[0]?.turnId).toBe(turns.data[0]?.id);
			expect(items.data[0]?.item.id).toBe(turns.data[0]?.items[0]?.id);
			expect(items.nextCursor).toBe("item-next");
			expect(items.backwardsCursor).toBe("item-back");

			fixture.transport.enqueueResponse("turn/start", { turn: richTurn } as never);
			const turnStarted = await fixture.session.turnStart({
				threadId,
				input: [{ type: "text", text: "continue", text_elements: [] }],
			});
			expect(turnStarted.turn.id).toBe(listedTurn.id);

			fixture.transport.enqueueResponse("turn/steer", { turnId: "turn-steered" });
			const steered = await fixture.session.turnSteer({
				threadId,
				clientUserMessageId: "message-1",
				input: [{ type: "text", text: "continue", text_elements: [] }],
				additionalContext: {},
				expectedTurnId: turnStarted.turn.id,
			});
			expectRawIdentity(fixture, steered.turnId, "turn-steered");

			fixture.transport.enqueueResponse("thread/queue/add", {
				queuedSubmission: queueResponse("queue-add"),
			} as never);
			const added = await fixture.session.queueAdd({
				threadId,
				input: [{ type: "text", text: "queued", text_elements: [] }],
				clientUserMessageId: "message-queue",
			});
			expectRawIdentity(fixture, added.queuedSubmission.id, "queue-add");

			fixture.transport.enqueueResponse("thread/queue/list", {
				data: [queueResponse("queue-add")],
				nextCursor: "queue-next",
			} as never);
			const queue = await fixture.session.queueListPage({ threadId });
			expect(queue.data[0]?.id).toBe(added.queuedSubmission.id);
			expect(queue.nextCursor).toBe("queue-next");

			fixture.transport.enqueueResponse("thread/queue/update", {
				queuedSubmission: queueResponse("queue-updated"),
			} as never);
			const updated = await fixture.session.queueUpdate({
				threadId,
				queuedSubmissionId: added.queuedSubmission.id,
				input: [{ type: "text", text: "updated", text_elements: [] }],
			});
			expectRawIdentity(fixture, updated.queuedSubmission.id, "queue-updated");

			fixture.transport.enqueueResponse("thread/queue/start", { turn: richTurn } as never);
			const queueStarted = await fixture.session.queueStart({
				threadId,
				queuedSubmissionId: updated.queuedSubmission.id,
			});
			expect(queueStarted.turn.id).toBe(turnStarted.turn.id);

			fixture.transport.enqueueResponse("thread/timeline/list", {
				data: [{ type: "turnStarted", position: 1, turnId: "raw-realtime-turn", startedAt: 1 }],
				nextCursor: "timeline-next",
				activeRealtimeSessionAtPageStart: null,
			} as never);
			const timeline = await fixture.session.timelineListPage({ threadId });
			const timelineEntry = timeline.data[0];
			if (timelineEntry?.type !== "turnStarted")
				throw new Error("timeline fixture was not returned");
			expect(timelineEntry.turnId).toBe("raw-realtime-turn");
			expect(() => fixture.identity.decoder.parseTurnId(timelineEntry.turnId)).toThrow(
				IdentityValidationError,
			);
			expect(timeline.nextCursor).toBe("timeline-next");
		} finally {
			fixture.close();
		}
	});

	test("rejects an invalid late nested identity before trusting any earlier field", async () => {
		const fixture = await readyFixture();
		try {
			fixture.transport.enqueueResponse("thread/list", {
				data: [
					{ ...threadFixture, id: "valid-before-failure", turns: [] },
					{
						...threadFixture,
						id: "later-thread",
						turns: [{ ...richTurn, id: "" }],
					},
				],
				nextCursor: null,
				backwardsCursor: null,
			} as never);
			const error = await rejected(fixture.session.threadListPage({}));
			expect(error).toMatchObject({ code: "invalid_identity" });
			expect(() => fixture.identity.decoder.resolveThreadId("valid-before-failure")).toThrow(
				IdentityValidationError,
			);
			expect(() => fixture.identity.decoder.resolveThreadId("later-thread")).toThrow(
				IdentityValidationError,
			);
		} finally {
			fixture.close();
		}
	});

	test("rejects stale read and wrong-child mutation responses before identity adoption", async () => {
		const stale = await readyFixture();
		try {
			const staleEpoch = stale.identity.issuer.mintChildEpoch();
			stale.transport.nextResponseCorrelation = {
				child: stale.identity.validator.childId,
				epoch: staleEpoch,
				requestId: stale.identity.issuer.mintJsonRpcRequestId(),
			};
			stale.transport.enqueueResponse("thread/list", {
				data: [{ ...threadFixture, id: "stale-result-thread", turns: [] }],
				nextCursor: null,
				backwardsCursor: null,
			} as never);
			expect(await rejected(stale.session.threadListPage({}))).toMatchObject({
				code: "invalid_identity",
			});
			expect(() => stale.identity.decoder.resolveThreadId("stale-result-thread")).toThrow(
				IdentityValidationError,
			);
		} finally {
			stale.close();
		}

		const wrongChild = await readyFixture();
		try {
			const other = createIdentityAuthority();
			wrongChild.transport.nextResponseCorrelation = other.decoder.createWireRequestCorrelation({
				requestId: other.issuer.mintJsonRpcRequestId(),
			});
			wrongChild.transport.enqueueResponse(
				"thread/start",
				threadStartResponse({ ...threadFixture, id: "wrong-child-thread", turns: [] }) as never,
			);
			const error = await rejected(wrongChild.session.threadStart({}));
			expect(error).toBeInstanceOf(CodexSessionMutationError);
			expect(error).toMatchObject({
				method: "thread/start",
				outcome: "outcome_unknown",
				cause: { code: "invalid_identity" },
			});
			expect(() => wrongChild.identity.decoder.resolveThreadId("wrong-child-thread")).toThrow(
				IdentityValidationError,
			);
		} finally {
			wrongChild.close();
		}
	});
});
