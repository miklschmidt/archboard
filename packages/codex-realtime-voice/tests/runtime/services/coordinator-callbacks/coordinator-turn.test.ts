// What a coordinator operation's own outcome does while voice is live (TASK-291, TASK-321).
//
// That a turn ended or waits on the user is workhorse news from the thread itself, whoever started
// the turn, so an operation's completed, failed and attention stay quiet here rather than telling
// the coordinator twice. What is guarded: only an outcome nobody can vouch for reaches the
// coordinator, and none of it is appended to the voice model; an unattended session gets nothing;
// and with no voice session nothing reaches the coordinator.

import { describe, expect, test } from "bun:test";

import { createCodexCoordinatorCallbacks } from "#runtime/services/coordinator-callbacks/callbacks.ts";
import {
	type CoordinatorCallbackTurnPort,
	type CoordinatorCallbackTurnResult,
} from "#runtime/protocol/coordinator-callbacks/contract.ts";
import {
	close,
	harness,
	operationEvent,
} from "#tests/runtime/services/coordinator-callbacks/support.ts";

/** A callbacks owner over the shared harness, with a turn port that records what it was asked. */
function withTurnPort(active: boolean, result: CoordinatorCallbackTurnResult) {
	const h = harness(active);
	const reports: Parameters<CoordinatorCallbackTurnPort["report"]>[0][] = [];
	const callbacks = createCodexCoordinatorCallbacks({
		...h.options,
		coordinatorTurn: {
			report: async (request) => {
				reports.push(request);
				return result;
			},
		},
	});
	return { h, reports, callbacks };
}

const DELIVERED = { attempted: true, outcome: "delivered", reason: null } as const;

describe("a coordinator operation's outcome while voice is live", () => {
	test("reaches the coordinator only when nobody can vouch for it, and is never appended to the voice model", async () => {
		const { h, reports, callbacks } = withTurnPort(true, DELIVERED);
		try {
			for (const type of ["completed", "failed", "attention"] as const) {
				const delivery = await callbacks.enqueue(operationEvent(h.ids, type));
				expect(delivery).toMatchObject({ path: "silent", reason: "recorded_only" });
			}
			const unknown = await callbacks.enqueue(operationEvent(h.ids, "outcome_unknown"));
			expect(unknown).toMatchObject({ path: "coordinator_turn", outcome: "delivered" });
			expect(reports).toHaveLength(1);
			expect(reports[0]).toMatchObject({ threadId: h.ids.coordinator, situation: "ended" });
			expect(h.realtimeRequests).toHaveLength(0);
		} finally {
			callbacks.dispose();
			close(h);
		}
	});

	test("tells nobody of an outcome that is not terminal, and never appends its envelope to the voice session", async () => {
		const { h, reports, callbacks } = withTurnPort(true, DELIVERED);
		try {
			for (const type of ["accepted", "queued", "started", "progress"] as const) {
				// The tool result already told the coordinator how its delegation went in, and the
				// envelope is machine text a speech model would say out loud (TASK-293).
				const delivery = await callbacks.enqueue(operationEvent(h.ids, type));
				expect(delivery).toMatchObject({
					path: "silent",
					outcome: "not_delivered",
					reason: "recorded_only",
				});
			}
			expect(reports).toHaveLength(0);
			expect(h.realtimeRequests).toHaveLength(0);
		} finally {
			callbacks.dispose();
			close(h);
		}
	});

	test("sends nothing while the voice session is unattended, and records the outcome", async () => {
		const { h, reports, callbacks } = withTurnPort(true, "unattended");
		try {
			const delivery = await callbacks.enqueue(operationEvent(h.ids, "outcome_unknown"));
			expect(delivery).toMatchObject({
				path: "silent",
				outcome: "not_delivered",
				reason: "voice_inactive",
			});
			expect(reports).toHaveLength(1);
			expect(h.realtimeRequests).toHaveLength(0);
		} finally {
			callbacks.dispose();
			close(h);
		}
	});

	test("reports an unconfirmed turn start as it is, without a second attempt down another path", async () => {
		const lost = { attempted: true, outcome: "outcome_unknown", reason: "response_lost" } as const;
		const { h, callbacks } = withTurnPort(true, lost);
		try {
			const delivery = await callbacks.enqueue(operationEvent(h.ids, "outcome_unknown"));
			expect(delivery).toMatchObject({ path: "coordinator_turn", outcome: "outcome_unknown" });
			expect(h.realtimeRequests).toHaveLength(0);
		} finally {
			callbacks.dispose();
			close(h);
		}
	});

	test("reaches nobody with no voice session: the coordinator is never run without voice", async () => {
		const { h, reports, callbacks } = withTurnPort(false, DELIVERED);
		try {
			const delivery = await callbacks.enqueue(operationEvent(h.ids, "outcome_unknown"));
			expect(delivery).toMatchObject({ path: "silent", reason: "voice_inactive" });
			expect(reports).toHaveLength(0);
		} finally {
			callbacks.dispose();
			close(h);
		}
	});
});
