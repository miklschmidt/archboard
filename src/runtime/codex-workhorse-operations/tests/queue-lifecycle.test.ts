import { describe, expect, test } from "bun:test";

import type { WorkhorseOperationEvent } from "../index.js";
import { notification, rawTurn, rejected } from "./evidence.js";
import { useFixtureGroup } from "./fixture-group.js";
import { turn } from "./support.js";
import { mutate, queuedItem } from "./queue-mutation.js";

const fixture = useFixtureGroup();

describe("codex workhorse queue mutation delivery and correlation", () => {
	test("retains queued correlation through authoritative queue start and completion", async () => {
		const fixtureValue = fixture("active");
		try {
			fixtureValue.setStatus("active", [turn(fixtureValue.identity, "busy", "inProgress")]);
			const events: WorkhorseOperationEvent[] = [];
			fixtureValue.operations.subscribe((event) => events.push(event));
			const delegated = await fixtureValue.operations.delegate({
				call: fixtureValue.setCall("delegate_to_workhorse"),
				input: "queued lifecycle",
				transcriptDelta: "",
			});
			if (delegated.queuedSubmissionId === null) {
				throw new Error("delegate was not queued");
			}
			const startResult = await fixtureValue.operations.manageQueue({
				call: fixtureValue.setCall("manage_workhorse_queue"),
				operation: "start",
				submissionId: delegated.queuedSubmissionId,
			});
			expect(startResult.operation).toBe("start");
			const started = events.filter((event) => event.type === "started");
			expect(started).toHaveLength(2);
			expect(started.map((event) => event.correlation.turnId)).toEqual([
				fixtureValue.queue.nextStartTurnId,
				fixtureValue.queue.nextStartTurnId,
			]);
			fixtureValue.operations.onNotification(
				notification(fixtureValue, {
					method: "turn/completed",
					params: {
						threadId: "workhorse",
						turn: rawTurn(
							fixtureValue.identity,
							"queue-start-turn",
							"completed",
							delegated.clientUserMessageId,
						),
					},
				}),
			);
			expect(events.filter((event) => event.type === "completed")).toHaveLength(2);
			expect(
				events.find(
					(event) => event.operation === "delegate_to_workhorse" && event.type === "completed",
				)?.correlation,
			).toMatchObject({
				clientUserMessageId: delegated.clientUserMessageId,
				queuedSubmissionId: delegated.queuedSubmissionId,
				turnId: fixtureValue.queue.nextStartTurnId,
			});
		} finally {
			fixtureValue.cleanup();
		}
	});

	for (const operation of ["add", "update", "delete", "reorder", "start"] as const) {
		test(`attempts queue ${operation} once for every delivery outcome`, async () => {
			for (const outcome of ["delivered", "not_delivered", "outcome_unknown"] as const) {
				const fixtureValue = fixture();
				try {
					expect(fixtureValue.queue.calls).toEqual([]);
					expect(fixtureValue.queue.nextOutcome).toBe("delivered");
					expect(fixtureValue.epoch.snapshot().manifest.records).toHaveLength(4);
					if (operation !== "add") {
						fixtureValue.queue.state = [queuedItem(fixtureValue)];
					}
					fixtureValue.queue.nextOutcome = outcome;
					if (operation === "start" && outcome === "outcome_unknown") {
						fixtureValue.queue.nextStartTurnId = null;
					}
					const pending = mutate(fixtureValue, operation);
					if (outcome === "delivered") {
						expect((await pending).operation).toBe(operation);
					} else {
						expect(await rejected(pending)).toMatchObject({ outcome });
					}
					expect(fixtureValue.queue.calls).toEqual([operation]);
				} finally {
					fixtureValue.cleanup();
				}
			}
		});
	}
});
