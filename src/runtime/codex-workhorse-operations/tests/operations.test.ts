import { describe, expect, test } from "bun:test";

import { createTextUserInput } from "../../codex-instructions/index.js";
import { CodexSessionMutationError } from "../../codex-session/index.js";
import { CodexWorkhorseQueueError } from "../../codex-workhorse-queue/index.js";
import { fixture, flush, notification, rawTurn, rejected, turn } from "./support.js";

describe("codex workhorse operations", () => {
	test("rejects a coordinator call for the wrong operation before touching a port", async () => {
		const fixtureValue = fixture();
		try {
			const error = await rejected(
				fixtureValue.operations.inspect({
					call: fixtureValue.setCall("manage_workhorse_queue"),
				}),
			);
			expect(error).toMatchObject({ code: "invalid_call" });
			expect(fixtureValue.queue.calls).toEqual([]);
		} finally {
			fixtureValue.cleanup();
		}
	});

	test("inspects read-only state and starts one inactive delegate with stable correlation", async () => {
		const fixtureValue = fixture();
		try {
			await fixtureValue.operations.inspect({ call: fixtureValue.setCall("inspect_workhorse") });
			expect(fixtureValue.session.starts).toHaveLength(0);
			const events: string[] = [];
			const correlations: string[] = [];
			fixtureValue.operations.subscribe((event) => {
				events.push(event.type);
				correlations.push(String(event.correlation.operationId));
			});
			fixtureValue.session.nextStartTurn = turn(
				fixtureValue.identity,
				"delegate-turn",
				"inProgress",
			);
			const result = await fixtureValue.operations.delegate({
				call: fixtureValue.setCall("delegate_to_workhorse"),
				input: "do the work",
				transcriptDelta: "the user added context",
			});
			expect(result.mode).toBe("started");
			expect(fixtureValue.session.starts).toHaveLength(1);
			expect(fixtureValue.session.starts[0]).toMatchObject({
				threadId: fixtureValue.binding.workhorse.threadId,
				clientUserMessageId: result.clientUserMessageId,
				turnTrigger: "archboard",
				input: [
					{
						type: "text",
						text: "do the work\n\nRealtime transcript context:\nthe user added context",
						text_elements: [],
					},
				],
			});
			expect(events).toEqual(["accepted", "started"]);
			expect(new Set(correlations)).toEqual(new Set([result.clientUserMessageId]));
			fixtureValue.operations.onNotification(
				notification(fixtureValue, {
					method: "turn/completed",
					params: {
						threadId: "workhorse",
						turn: rawTurn(
							fixtureValue.identity,
							"delegate-turn",
							"completed",
							result.clientUserMessageId,
						),
					},
				}),
			);
			expect(events).toEqual(["accepted", "started", "completed"]);
			fixtureValue.operations.onNotification(
				notification(fixtureValue, {
					method: "turn/completed",
					params: {
						threadId: "workhorse",
						turn: rawTurn(
							fixtureValue.identity,
							"delegate-turn",
							"completed",
							result.clientUserMessageId,
						),
					},
				}),
			);
			expect(events).toEqual(["accepted", "started", "completed"]);
		} finally {
			fixtureValue.cleanup();
		}
	});

	test("settles a direct delegate when turn evidence arrives before its response", async () => {
		const fixtureValue = fixture();
		try {
			fixtureValue.session.nextStartTurn = turn(fixtureValue.identity, "early-turn", "inProgress");
			const events: string[] = [];
			let operationId = "";
			let outcomeAtNotification = "";
			fixtureValue.operations.subscribe((event) => {
				events.push(event.type);
				operationId = String(event.correlation.operationId);
			});
			fixtureValue.session.beforeStart = () => {
				fixtureValue.operations.onNotification(
					notification(fixtureValue, {
						method: "turn/started",
						params: {
							threadId: "workhorse",
							turn: rawTurn(fixtureValue.identity, "early-turn", "inProgress", operationId),
						},
					}),
				);
				outcomeAtNotification = String(
					fixtureValue.epoch.snapshot().manifest.records.at(-1)?.outcome,
				);
			};
			const result = await fixtureValue.operations.delegate({
				call: fixtureValue.setCall("delegate_to_workhorse"),
				input: "early evidence",
				transcriptDelta: "",
			});
			expect(result.turnId).toBe(fixtureValue.session.nextStartTurn.id);
			expect(outcomeAtNotification).toBe("delivered");
			expect(events).toEqual(["accepted", "started"]);
			expect(fixtureValue.session.starts).toHaveLength(1);
		} finally {
			fixtureValue.cleanup();
		}
	});

	test("queues an active delegate and routes every queue mutation through the queue port", async () => {
		const fixtureValue = fixture("active");
		try {
			fixtureValue.setStatus("active", [turn(fixtureValue.identity, "active", "inProgress")]);
			const delegated = await fixtureValue.operations.delegate({
				call: fixtureValue.setCall("delegate_to_workhorse"),
				input: "queue this",
				transcriptDelta: "",
			});
			expect(delegated.mode).toBe("queued");
			expect(fixtureValue.session.starts).toHaveLength(0);
			const first = fixtureValue.queue.state[0];
			if (first === undefined) throw new Error("delegate did not create a queue item");
			const second = {
				...first,
				id: fixtureValue.identity.decoder.adoptQueuedSubmissionId("second"),
				clientUserMessageId: "external",
			};
			fixtureValue.queue.state = [first, second];
			await fixtureValue.operations.manageQueue({
				call: fixtureValue.setCall("manage_workhorse_queue"),
				operation: "list",
			});
			await fixtureValue.operations.manageQueue({
				call: fixtureValue.setCall("manage_workhorse_queue"),
				operation: "update",
				submissionId: first.id,
				prompt: "updated",
			});
			await fixtureValue.operations.manageQueue({
				call: fixtureValue.setCall("manage_workhorse_queue"),
				operation: "reorder",
				orderedSubmissionIds: [second.id, first.id],
			});
			await fixtureValue.operations.manageQueue({
				call: fixtureValue.setCall("manage_workhorse_queue"),
				operation: "delete",
				submissionId: second.id,
			});
			await fixtureValue.operations.manageQueue({
				call: fixtureValue.setCall("manage_workhorse_queue"),
				operation: "start",
				submissionId: first.id,
			});
			expect(fixtureValue.queue.calls).toEqual([
				"add",
				"list",
				"update",
				"reorder",
				"delete",
				"start",
			]);
		} finally {
			fixtureValue.cleanup();
		}
	});

	test("steers only the exact active turn with one bounded literal body", async () => {
		const fixtureValue = fixture();
		try {
			const expectedTurnId = fixtureValue.identity.decoder.adoptTurnId("active-steer");
			fixtureValue.setStatus("active", [turn(fixtureValue.identity, "active-steer", "inProgress")]);
			const events: string[] = [];
			fixtureValue.operations.subscribe((event) => events.push(event.type));
			const result = await fixtureValue.operations.steer({
				call: fixtureValue.setCall("steer_workhorse"),
				expectedTurnId,
				input: "stop and inspect",
			});
			expect(result).toEqual({ turnId: expectedTurnId, delivery: "delivered" });
			expect(fixtureValue.session.steers).toHaveLength(1);
			expect(fixtureValue.session.steers[0]).toMatchObject({
				threadId: fixtureValue.binding.workhorse.threadId,
				clientUserMessageId: expect.any(String),
				expectedTurnId,
				input: [{ type: "text", text: "stop and inspect", text_elements: [] }],
			});
			expect(events).toEqual(["accepted", "started"]);
			const wrong = await rejected(
				fixtureValue.operations.steer({
					call: fixtureValue.setCall("steer_workhorse"),
					expectedTurnId: fixtureValue.identity.decoder.adoptTurnId("wrong-turn"),
					input: "must not send",
				}),
			);
			expect(wrong).toMatchObject({ code: "busy" });
			expect(fixtureValue.session.steers).toHaveLength(1);
		} finally {
			fixtureValue.cleanup();
		}
	});

	test("keeps one unknown start attempt and confirms it only from exact later turn evidence", async () => {
		const fixtureValue = fixture();
		try {
			fixtureValue.session.nextStartError = new CodexSessionMutationError(
				"turn/start",
				"outcome_unknown",
				"lost",
			);
			const events: string[] = [];
			let operationId = "";
			fixtureValue.operations.subscribe((event) => {
				events.push(event.type);
				operationId = String(event.correlation.operationId);
			});
			const error = await rejected(
				fixtureValue.operations.delegate({
					call: fixtureValue.setCall("delegate_to_workhorse"),
					input: "lost start",
					transcriptDelta: "",
				}),
			);
			expect(error).toMatchObject({ code: "outcome_unknown", outcome: "outcome_unknown" });
			expect(fixtureValue.session.starts).toHaveLength(1);
			expect(events).toEqual(["accepted", "outcome_unknown"]);
			fixtureValue.operations.onNotification(
				notification(fixtureValue, {
					method: "turn/started",
					params: {
						threadId: "workhorse",
						turn: rawTurn(fixtureValue.identity, "lost-turn", "inProgress", operationId),
					},
				}),
			);
			expect(events).toEqual(["accepted", "outcome_unknown", "started"]);
			const record = fixtureValue.epoch
				.snapshot()
				.manifest.records.find((candidate) => candidate.correlation.operationId === operationId);
			expect(record).toMatchObject({ status: "committed", outcome: "delivered" });
			fixtureValue.operations.onNotification(
				notification(fixtureValue, {
					method: "turn/completed",
					params: {
						threadId: "workhorse",
						turn: rawTurn(fixtureValue.identity, "lost-turn", "completed", operationId),
					},
				}),
			);
			expect(events).toEqual(["accepted", "outcome_unknown", "started", "completed"]);
		} finally {
			fixtureValue.cleanup();
		}
	});

	test("reconciles one unknown queue response by exact client identity and never retries", async () => {
		const fixtureValue = fixture("active");
		try {
			fixtureValue.setStatus("active", [turn(fixtureValue.identity, "active", "inProgress")]);
			fixtureValue.queue.nextError = new CodexWorkhorseQueueError("transport_failure", "lost", {
				operation: "add",
				outcome: "outcome_unknown",
			});
			const events: string[] = [];
			let operationId = "";
			fixtureValue.operations.subscribe((event) => {
				events.push(event.type);
				operationId = String(event.correlation.operationId);
			});
			const error = await rejected(
				fixtureValue.operations.manageQueue({
					call: fixtureValue.setCall("manage_workhorse_queue"),
					operation: "add",
					prompt: "lost queue",
				}),
			);
			expect(error).toMatchObject({ code: "outcome_unknown", outcome: "outcome_unknown" });
			expect(fixtureValue.queue.calls).toEqual(["add"]);
			fixtureValue.queue.state = [
				{
					id: fixtureValue.identity.decoder.adoptQueuedSubmissionId("late-queue"),
					input: [createTextUserInput("lost queue")],
					clientUserMessageId: operationId,
				},
			];
			fixtureValue.operations.onNotification(
				notification(fixtureValue, {
					method: "thread/queue/changed",
					params: { threadId: "workhorse" },
				}),
			);
			await flush();
			expect(events).toEqual(["accepted", "outcome_unknown", "queued"]);
			expect(fixtureValue.queue.calls).toEqual(["add", "list"]);
			const record = fixtureValue.epoch
				.snapshot()
				.manifest.records.find((candidate) => candidate.correlation.operationId === operationId);
			expect(record).toMatchObject({ status: "committed", outcome: "delivered" });
		} finally {
			fixtureValue.cleanup();
		}
	});

	test("returns not_delivered for a lost steer without issuing a second request", async () => {
		const fixtureValue = fixture();
		try {
			const expectedTurnId = fixtureValue.identity.decoder.adoptTurnId("steer-loss");
			fixtureValue.setStatus("active", [turn(fixtureValue.identity, "steer-loss", "inProgress")]);
			fixtureValue.session.nextSteerError = new CodexSessionMutationError(
				"turn/steer",
				"not_delivered",
				"not sent",
			);
			const events: string[] = [];
			fixtureValue.operations.subscribe((event) => events.push(event.type));
			const result = await fixtureValue.operations.steer({
				call: fixtureValue.setCall("steer_workhorse"),
				expectedTurnId,
				input: "one attempt",
			});
			expect(result.delivery).toBe("not_delivered");
			expect(fixtureValue.session.steers).toHaveLength(1);
			expect(events).toEqual(["accepted", "failed"]);
		} finally {
			fixtureValue.cleanup();
		}
	});

	test("reconciles an unknown steer from terminal evidence without retrying", async () => {
		const fixtureValue = fixture();
		try {
			const expectedTurnId = fixtureValue.identity.decoder.adoptTurnId("unknown-steer");
			fixtureValue.setStatus("active", [
				turn(fixtureValue.identity, "unknown-steer", "inProgress"),
			]);
			fixtureValue.session.nextSteerError = new CodexSessionMutationError(
				"turn/steer",
				"outcome_unknown",
				"response lost",
			);
			const events: string[] = [];
			let operationId = "";
			fixtureValue.operations.subscribe((event) => {
				events.push(event.type);
				operationId = String(event.correlation.operationId);
			});
			const result = await fixtureValue.operations.steer({
				call: fixtureValue.setCall("steer_workhorse"),
				expectedTurnId,
				input: "one unknown steer",
			});
			expect(result).toEqual({ turnId: expectedTurnId, delivery: "outcome_unknown" });
			expect(fixtureValue.session.steers).toHaveLength(1);
			expect(events).toEqual(["accepted", "outcome_unknown"]);

			fixtureValue.operations.onNotification(
				notification(fixtureValue, {
					method: "turn/completed",
					params: {
						threadId: "workhorse",
						turn: rawTurn(fixtureValue.identity, "unknown-steer", "completed", operationId),
					},
				}),
			);
			await flush();
			expect(events).toEqual(["accepted", "outcome_unknown", "started", "completed"]);
			expect(fixtureValue.session.steers).toHaveLength(1);
			expect(
				fixtureValue.epoch
					.snapshot()
					.manifest.records.find((record) => record.correlation.operationId === operationId),
			).toMatchObject({ status: "committed", outcome: "delivered" });
		} finally {
			fixtureValue.cleanup();
		}
	});

	test("rolls back a staged delegate when its link changes before turn delivery", async () => {
		const fixtureValue = fixture();
		try {
			fixtureValue.setBeforeContext(() =>
				fixtureValue.replaceBinding({
					...fixtureValue.binding,
					workhorse: {
						...fixtureValue.binding.workhorse,
						threadId: fixtureValue.identity.decoder.adoptThreadId("context-replacement"),
					},
				}),
			);
			const error = await rejected(
				fixtureValue.operations.delegate({
					call: fixtureValue.setCall("delegate_to_workhorse"),
					input: "must not send",
					transcriptDelta: "",
				}),
			);
			expect(error).toMatchObject({ code: "stale_link", outcome: "not_delivered" });
			expect(fixtureValue.session.starts).toHaveLength(0);
			expect(fixtureValue.epoch.snapshot().manifest.records.at(-1)).toMatchObject({
				status: "rolled_back",
				outcome: "not_delivered",
			});
		} finally {
			fixtureValue.cleanup();
		}
	});

	test("revalidates the link after a delivered response and preserves one unknown operation", async () => {
		const fixtureValue = fixture();
		try {
			fixtureValue.session.nextStartTurn = turn(fixtureValue.identity, "race-turn", "inProgress");
			fixtureValue.session.beforeStart = () =>
				fixtureValue.replaceBinding({
					...fixtureValue.binding,
					workhorse: {
						...fixtureValue.binding.workhorse,
						threadId: fixtureValue.identity.decoder.adoptThreadId("replacement-workhorse"),
					},
				});
			const events: string[] = [];
			fixtureValue.operations.subscribe((event) => events.push(event.type));
			const error = await rejected(
				fixtureValue.operations.delegate({
					call: fixtureValue.setCall("delegate_to_workhorse"),
					input: "race",
					transcriptDelta: "",
				}),
			);
			expect(error).toMatchObject({ code: "outcome_unknown" });
			expect(fixtureValue.session.starts).toHaveLength(1);
			expect(events).toEqual(["accepted", "outcome_unknown"]);
		} finally {
			fixtureValue.cleanup();
		}
	});
});
