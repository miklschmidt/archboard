import { describe, expect, test } from "bun:test";

import type { BrowserQueue } from "@/shared/codex-browser-model";
import { queueEntryActions, queueStateText } from "@/ui/workbench/queue-projection";
import { identities } from "@/ui/workbench/tests/identities";

type QueueEntry = BrowserQueue["entries"][number];

/**
 * A queue entry.
 * @param id The submission name.
 * @param status The entry status.
 * @returns The entry.
 */
const entry = (id: string, status: QueueEntry["status"]): QueueEntry => ({
	submissionId: identities.queued(id),
	prompt: `prompt ${id}`,
	status,
	operationId: null,
});

/**
 * A queue.
 * @param status The queue status.
 * @param entries The entries.
 * @returns The queue.
 */
const queue = (status: BrowserQueue["status"], entries: QueueEntry[]): BrowserQueue => ({
	kind: "queue",
	status,
	entries,
});

const NOTHING = { moveUp: false, moveDown: false, remove: false, sendNow: false };

describe("queue entry actions", () => {
	test("waiting entries move within the waiting run and can be sent or removed", () => {
		const waiting = queue("queued", [
			entry("a", "queued"),
			entry("b", "queued"),
			entry("c", "queued"),
		]);
		expect(queueEntryActions(waiting, 0)).toEqual({
			moveUp: false,
			moveDown: true,
			remove: true,
			sendNow: true,
		});
		expect(queueEntryActions(waiting, 1)).toEqual({
			moveUp: true,
			moveDown: true,
			remove: true,
			sendNow: true,
		});
		expect(queueEntryActions(waiting, 2).moveDown).toBe(false);
	});

	test("a running entry cannot be moved past, and nothing sends while running", () => {
		const running = queue("running", [entry("a", "running"), entry("b", "queued")]);
		expect(queueEntryActions(running, 0)).toEqual(NOTHING);
		expect(queueEntryActions(running, 1)).toEqual({
			moveUp: false,
			moveDown: false,
			remove: true,
			sendNow: false,
		});
	});

	test("recovery states disable every action", () => {
		for (const status of ["reconnecting", "unavailable", "outcome_unknown"] as const) {
			const recovering = queue(status, [entry("a", "queued")]);
			expect(queueEntryActions(recovering, 0)).toEqual(NOTHING);
			expect(queueStateText(recovering).recovering).toBe(true);
		}
	});

	test("an index past the end offers nothing", () => {
		expect(queueEntryActions(queue("empty", []), 0)).toEqual(NOTHING);
		expect(queueStateText(queue("empty", []))).toEqual({ text: "Queue empty", recovering: false });
		expect(queueStateText(queue("queued", [entry("a", "queued")])).text).toBe("Queued · 1");
	});
});
