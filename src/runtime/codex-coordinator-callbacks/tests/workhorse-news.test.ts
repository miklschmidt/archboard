// Workhorse news (TASK-321): the coordinator hears when a turn on the linked workhorse thread ends
// or starts waiting on the user, whoever started the turn, and only while voice is live.
//
// What is guarded: a turn the agent bar started reaches the coordinator when it ends, as news
// that it finished, failed or was stopped; a wait is news when it begins, not on every status
// change while it lasts; another thread, a prior epoch and a session with no voice tell the
// coordinator nothing; and the coordinator is given a plain sentence, never the callback envelope.

import { describe, expect, test } from "bun:test";

import type { TransportServerNotification } from "../../codex-transport/server-requests.js";
import { close, harness } from "./support.js";

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

describe("workhorse news", () => {
	test("a turn the agent bar started reaches the coordinator when it ends, as a plain sentence", async () => {
		const h = harness(true);
		for (const status of ["completed", "failed", "interrupted"] as const) {
			h.callbacks.onNotification(turnCompleted(h, status));
		}
		await h.callbacks.flush();
		expect(h.reports).toHaveLength(3);
		expect(h.reports.every((report) => report.threadId === h.ids.coordinator)).toBe(true);
		expect(h.reports.every((report) => !report.waiting)).toBe(true);
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
		expect(h.reports.map((report) => report.waiting)).toEqual([true, true]);
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
});
