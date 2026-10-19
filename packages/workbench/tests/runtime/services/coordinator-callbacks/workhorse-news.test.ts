// Workhorse news (TASK-321): the coordinator hears when a turn on the linked workhorse thread ends
// or starts waiting on the user, whoever started the turn, and what the workhorse tells it, only
// while voice is live.
//
// What is guarded: a turn the conversation started reaches the coordinator when it ends, as news
// that it finished, failed or was stopped; a wait is news when it begins, not on every status
// change while it lasts; another thread, a prior epoch and a session with no voice tell the
// coordinator nothing; the coordinator is given a plain sentence, never the callback envelope; and
// the workhorse's tell_coordinator reaches the coordinator at once while voice is live, and with
// no voice sends nothing and tells the workhorse so.

import { describe, expect, test } from "bun:test";

import type {
	DynamicServerRequest,
	TransportServerNotification,
} from "@archboard/codex-app-server/transport";
import type { ThreadId } from "@archboard/codex-app-server/identity";
import { TELL_COORDINATOR_OWNER } from "#runtime/services/coordinator-callbacks/tell-coordinator.ts";
import { close, harness } from "#tests/runtime/services/coordinator-callbacks/support.ts";

type Harness = ReturnType<typeof harness>;

/**
 * One Codex notification as the transport hands it over.
 * @param h - The harness whose identities it carries.
 * @param value - The notification body.
 * @param epoch - The epoch it names; the current one by default.
 * @returns The notification.
 */
function notification(
	h: Harness,
	value: unknown,
	epoch = h.ids.epoch,
): TransportServerNotification {
	return {
		correlation: {
			child: h.ids.child,
			epoch,
			requestId: h.ids.authorities.identity.issuer.mintJsonRpcRequestId(),
		},
		notification: value as TransportServerNotification["notification"],
	};
}

/**
 * A turn on a thread coming to an end.
 * @param h - The harness.
 * @param status - How it ended.
 * @param threadId - The wire thread; the linked workhorse by default.
 * @returns The notification.
 */
function turnCompleted(
	h: Harness,
	status: "completed" | "failed" | "interrupted",
	threadId = "workhorse",
): TransportServerNotification {
	return notification(h, {
		method: "turn/completed",
		params: {
			threadId,
			turn: {
				id: `turn-${status}`,
				items: [],
				itemsView: "notLoaded",
				status,
				error: status === "failed" ? { message: "The model stopped answering." } : null,
				startedAt: null,
				completedAt: null,
				durationMs: null,
			},
		},
	});
}

/**
 * The linked workhorse thread's status changing.
 * @param h - The harness.
 * @param waitingFlags - The active flags; none means idle.
 * @returns The notification.
 */
function statusChanged(
	h: Harness,
	waitingFlags: readonly string[] | null,
): TransportServerNotification {
	return notification(h, {
		method: "thread/status/changed",
		params: {
			threadId: "workhorse",
			status:
				waitingFlags === null ? { type: "idle" } : { type: "active", activeFlags: waitingFlags },
		},
	});
}

/**
 * The linked workhorse calling tell_coordinator.
 * @param h - The harness.
 * @param message - What it tells the coordinator.
 * @returns The call as the transport hands it over.
 */
function tellCoordinator(h: Harness, message: string): DynamicServerRequest {
	const { decoder } = h.ids.authorities.identity;
	const requestId = decoder.adoptJsonRpcRequestId("tell-coordinator");
	const callId = decoder.adoptDynamicToolCallId("tell-call");
	return {
		child: h.ids.child,
		epoch: h.ids.epoch,
		requestId,
		correlation: decoder.createWireRequestCorrelation({ requestId }),
		method: "item/tool/call",
		params: {
			threadId: "workhorse",
			turnId: "workhorse-turn",
			callId: String(callId),
			namespace: "archboard_coordinator",
			tool: "tell_coordinator",
			arguments: { message },
		},
		owner: TELL_COORDINATOR_OWNER,
		logicalCall: decoder.createLogicalToolCallCorrelation({
			threadId: h.ids.workhorse,
			turnId: decoder.adoptTurnId("workhorse-turn"),
			callId,
			namespace: "archboard_coordinator",
			tool: "tell_coordinator",
			manifestHash: "manifest-hash",
		}),
	};
}

describe("workhorse news", () => {
	test("a turn the conversation started reaches the coordinator when it ends, as a plain sentence", async () => {
		const h = harness(true);
		for (const status of ["completed", "failed", "interrupted"] as const) {
			h.callbacks.onNotification(turnCompleted(h, status));
		}
		await h.callbacks.flush();
		expect(h.reports).toHaveLength(3);
		expect(h.reports.every((report) => report.threadId === h.ids.coordinator)).toBe(true);
		expect(h.reports.every((report) => report.situation === "ended")).toBe(true);
		// The coordinator is told what happened in words, never the identities around it.
		for (const report of h.reports) {
			expect(report.news).not.toContain(h.ids.child);
			expect(report.news).not.toContain("{");
		}
		expect(
			h.callbacks.inspect().map((delivery) => [delivery.callback?.type, delivery.path]),
		).toEqual([
			["completed", "coordinator_turn"],
			["failed", "coordinator_turn"],
			["stopped", "coordinator_turn"],
		]);
		close(h);
	});

	test("a wait is news when it begins, once, and again when a later wait begins", async () => {
		const h = harness(true);
		h.callbacks.onNotification(statusChanged(h, ["waitingOnApproval"]));
		h.callbacks.onNotification(statusChanged(h, ["waitingOnApproval"]));
		h.callbacks.onNotification(statusChanged(h, []));
		h.callbacks.onNotification(statusChanged(h, ["waitingOnUserInput"]));
		await h.callbacks.flush();
		expect(h.reports.map((report) => report.situation)).toEqual(["waiting", "waiting"]);
		close(h);
	});

	test("a wait that lasts into a new voice session is news to its fresh coordinator", async () => {
		const h = harness(true);
		h.callbacks.onNotification(statusChanged(h, ["waitingOnApproval"]));
		await h.callbacks.flush();
		const coordinator = h.state.coordinator;
		if (coordinator === null) {
			throw new Error("harness has no coordinator");
		}
		h.state.coordinator = {
			...coordinator,
			threadId: h.ids.authorities.identity.decoder.adoptThreadId("coordinator-2"),
			operationId: "coordinator-operation-2",
		};
		h.callbacks.onNotification(statusChanged(h, ["waitingOnApproval"]));
		await h.callbacks.flush();
		expect(h.reports.map((report) => report.situation)).toEqual(["waiting", "waiting"]);
		close(h);
	});

	test("another thread, a prior epoch and a session with no voice tell the coordinator nothing", async () => {
		const live = harness(true);
		live.callbacks.onNotification(turnCompleted(live, "completed", "another-thread"));
		live.callbacks.onNotification(
			notification(
				live,
				{
					method: "turn/completed",
					params: { threadId: "workhorse", turn: { id: "old", status: "completed", error: null } },
				},
				"archboard:epoch:h11111111111111111111111111111111.h44444444444444444444444444444444" as Harness["ids"]["epoch"],
			),
		);
		await live.callbacks.flush();
		expect(live.reports).toHaveLength(0);
		expect(live.callbacks.inspect()).toHaveLength(0);
		close(live);

		const quiet = harness(false);
		quiet.callbacks.onNotification(turnCompleted(quiet, "completed"));
		await quiet.callbacks.flush();
		expect(quiet.reports).toHaveLength(0);
		expect(quiet.callbacks.inspect()).toMatchObject([
			{ path: "silent", outcome: "not_delivered", reason: "voice_inactive" },
		]);
		close(quiet);
	});

	test("what the workhorse tells the coordinator reaches it at once while voice is live, and nothing is sent without voice", async () => {
		const question = "Should the tests move with the module?";
		const live = harness(true);
		const liveAnswer = live.nextAnswer();
		live.callbacks.onServerRequest(tellCoordinator(live, question));
		const heard = await liveAnswer;
		expect(live.reports).toMatchObject([{ threadId: live.ids.coordinator, situation: "message" }]);
		expect(live.reports[0]?.news).toContain(question);
		expect(heard.response).toMatchObject({ result: { success: true } });
		close(live);

		const quiet = harness(false);
		const quietAnswer = quiet.nextAnswer();
		quiet.callbacks.onServerRequest(tellCoordinator(quiet, question));
		const unheard = await quietAnswer;
		expect(quiet.reports).toHaveLength(0);
		expect(quiet.callbacks.inspect()).toMatchObject([
			{ outcome: "not_delivered", reason: "voice_inactive" },
		]);
		// The workhorse is told something other than that the coordinator has it.
		expect(unheard.response).toMatchObject({ result: { success: true } });
		expect(unheard.response).not.toEqual(heard.response);
		close(quiet);
	});
});

/**
 * A thread as Codex spells it.
 * @param h - The harness.
 * @param threadId - The thread, or null.
 * @returns Its wire spelling, or null.
 */
function wireOf(h: Harness, threadId: ThreadId | null): string | null {
	return threadId === null
		? null
		: h.ids.authorities.identity.decoder.serializeCodexIdentity(threadId);
}

/**
 * Give the harness's tab session a second workhorse, in another checkout (ADR 0050).
 * @param h - The harness.
 * @param wire - Its thread as Codex spells it.
 * @param checkout - The checkout it works in.
 */
function secondWorkhorse(h: Harness, wire: string, checkout: string): void {
	const first = h.state.link;
	if (first === null || first.binding.link.state !== "executable") {
		throw new Error("harness has no executable workhorse link");
	}
	const threadId = h.ids.authorities.identity.decoder.adoptThreadId(wire);
	h.state.others.push({
		binding: {
			...first.binding,
			paneId: `tab\u0000${checkout}`,
			link: { ...first.binding.link, threadId },
			cas: { ...first.binding.cas, paneId: `tab\u0000${checkout}`, threadId },
		},
		target: { ...first.target, threadId },
		checkout,
	});
}

describe("workhorse news of a tab with a workhorse in each checkout", () => {
	test("news of the second checkout's workhorse is about that workhorse and names its checkout", async () => {
		const h = harness(true);
		secondWorkhorse(h, "workhorse-shop", "/work/shop");
		h.callbacks.onNotification(turnCompleted(h, "completed", "workhorse-shop"));
		h.callbacks.onNotification(turnCompleted(h, "failed"));
		await h.callbacks.flush();
		const delivered = h.callbacks.inspect().map((delivery) => ({
			path: delivery.path,
			type: delivery.callback?.type,
			checkout: delivery.callback?.correlation.workhorseLink.checkout,
			thread: wireOf(h, delivery.callback?.correlation.workhorseThreadId ?? null),
		}));
		expect(delivered).toEqual([
			{
				path: "coordinator_turn",
				type: "completed",
				checkout: "/work/shop",
				thread: "workhorse-shop",
			},
			{ path: "coordinator_turn", type: "failed", checkout: "/work/payments", thread: "workhorse" },
		]);
		// The coordinator learns which checkout's workhorse it was, which every workhorse tool takes.
		expect(h.reports[0]?.news).toContain("/work/shop");
		expect(h.reports[1]?.news).toContain("/work/payments");
		close(h);
	});
});
