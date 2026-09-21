// A terminal workhorse outcome during a live voice session runs the coordinator (TASK-291).
//
// In a full-duplex voice session appended text is quiet context, so work that ended would sit
// unheard until the person asked again. What is guarded: a terminal outcome starts exactly one
// coordinator turn and is not also appended to the voice model; everything that is not a terminal
// outcome stays quiet context; a coordinator that stays busy still gets the outcome, once, as the
// injected developer message; and with no voice session nothing changes.

import { describe, expect, test } from "bun:test";

import {
	createCodexCoordinatorCallbacks,
	type CoordinatorCallbackTurnPort,
	type CoordinatorCallbackTurnResult,
} from "../index.js";
import { close, harness, operationEvent } from "./support.js";

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

describe("a terminal workhorse outcome while voice is live", () => {
	test("runs the coordinator once with the outcome, and is not also appended to the voice model", async () => {
		const { h, reports, callbacks } = withTurnPort(true, DELIVERED);
		try {
			for (const type of ["completed", "failed", "attention", "outcome_unknown"] as const) {
				const delivery = await callbacks.enqueue(operationEvent(h.ids, type));
				expect(delivery).toMatchObject({ path: "coordinator_turn", outcome: "delivered" });
			}
			expect(reports).toHaveLength(4);
			expect(reports.every((report) => report.threadId === h.ids.coordinator)).toBe(true);
			expect(reports[0]?.text).toContain('"type":"completed"');
			expect(h.realtimeRequests).toHaveLength(0);
			expect(h.injections).toHaveLength(0);
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
			expect(h.injections).toHaveLength(0);
		} finally {
			callbacks.dispose();
			close(h);
		}
	});

	test("reaches a coordinator that stays busy once, as the injected developer message", async () => {
		const { h, reports, callbacks } = withTurnPort(true, "busy");
		try {
			const delivery = await callbacks.enqueue(operationEvent(h.ids, "completed"));
			expect(delivery).toMatchObject({ path: "thread_inject_items", outcome: "delivered" });
			expect(reports).toHaveLength(1);
			expect(h.injections).toHaveLength(1);
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
			const delivery = await callbacks.enqueue(operationEvent(h.ids, "completed"));
			expect(delivery).toMatchObject({ path: "coordinator_turn", outcome: "outcome_unknown" });
			expect(h.injections).toHaveLength(0);
			expect(h.realtimeRequests).toHaveLength(0);
		} finally {
			callbacks.dispose();
			close(h);
		}
	});

	test("changes nothing with no voice session: the outcome is the injected developer message", async () => {
		const { h, reports, callbacks } = withTurnPort(false, DELIVERED);
		try {
			const delivery = await callbacks.enqueue(operationEvent(h.ids, "completed"));
			expect(delivery.path).toBe("thread_inject_items");
			expect(reports).toHaveLength(0);
		} finally {
			callbacks.dispose();
			close(h);
		}
	});
});
