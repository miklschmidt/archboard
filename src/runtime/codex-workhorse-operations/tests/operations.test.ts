import { describe, expect, test } from "bun:test";

import { createTextUserInput } from "../../codex-instructions/index.js";
import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.js";
import type { ManageWorkhorseQueueRequest, WorkhorseOperationEvent } from "../index.js";
import { notification, rawTurn, rejected } from "./evidence.js";
import { fixture, turn, type Fixture } from "./support.js";

function queuedItem(fixtureValue: Fixture, id = "queue-target") {
	return {
		id: fixtureValue.identity.decoder.adoptQueuedSubmissionId(id),
		input: [createTextUserInput("queued")],
		clientUserMessageId: `client-${id}`,
	};
}

async function mutate(
	fixtureValue: Fixture,
	operation: Exclude<ManageWorkhorseQueueRequest["operation"], "list">,
) {
	const call = fixtureValue.setCall("manage_workhorse_queue");
	const target = fixtureValue.queue.state[0];
	switch (operation) {
		case "add":
			return fixtureValue.operations.manageQueue({ call, operation, prompt: "add" });
		case "update":
			if (target === undefined) throw new Error("missing update target");
			return fixtureValue.operations.manageQueue({
				call,
				operation,
				submissionId: target.id,
				prompt: "updated",
			});
		case "delete":
			if (target === undefined) throw new Error("missing delete target");
			return fixtureValue.operations.manageQueue({ call, operation, submissionId: target.id });
		case "reorder":
			if (target === undefined) throw new Error("missing reorder target");
			return fixtureValue.operations.manageQueue({
				call,
				operation,
				orderedSubmissionIds: [target.id],
			});
		case "start":
			if (target === undefined) throw new Error("missing start target");
			return fixtureValue.operations.manageQueue({ call, operation, submissionId: target.id });
	}
}

describe("codex workhorse operation authority and correlation", () => {
	test("inspects and directly controls an executable attached workhorse without queue authority", async () => {
		const fixtureValue = fixture();
		try {
			fixtureValue.setAttached();
			const inspected = await fixtureValue.operations.inspect({
				call: fixtureValue.setCall("inspect_workhorse"),
			});
			expect(inspected).toMatchObject({ status: "idle", queuedSubmissionIds: [] });
			expect(fixtureValue.queue.calls).toEqual([]);
			const delegated = await fixtureValue.operations.delegate({
				call: fixtureValue.setCall("delegate_to_workhorse"),
				input: "attached direct work",
				transcriptDelta: "",
			});
			expect(delegated.mode).toBe("started");

			const turnId = fixtureValue.identity.decoder.adoptTurnId("attached-active");
			fixtureValue.setStatus("active", [
				turn(fixtureValue.identity, "attached-active", "inProgress"),
			]);
			expect(
				await fixtureValue.operations.steer({
					call: fixtureValue.setCall("steer_workhorse"),
					expectedTurnId: turnId,
					input: "related correction",
				}),
			).toEqual({ turnId, delivery: "delivered" });
			expect(
				await rejected(
					fixtureValue.operations.delegate({
						call: fixtureValue.setCall("delegate_to_workhorse"),
						input: "unrelated queued work",
						transcriptDelta: "",
					}),
				),
			).toMatchObject({ code: "unknown_provenance" });
			expect(fixtureValue.queue.calls).toEqual([]);
		} finally {
			fixtureValue.cleanup();
		}
	});

	test("refuses reachable unloaded, uncontrollable, and system-error workhorses before effect", async () => {
		for (const expected of [
			{ status: "notLoaded" as const, controllable: true, code: "not_loaded" },
			{ status: "idle" as const, controllable: false, code: "not_controllable" },
			{ status: "systemError" as const, controllable: true, code: "system_error" },
		]) {
			const fixtureValue = fixture();
			try {
				fixtureValue.setStatus(expected.status);
				fixtureValue.setControllable(expected.controllable);
				expect(
					await fixtureValue.operations.inspect({
						call: fixtureValue.setCall("inspect_workhorse"),
					}),
				).toMatchObject({ status: expected.status, queuedSubmissionIds: [] });
				expect(
					await rejected(
						fixtureValue.operations.delegate({
							call: fixtureValue.setCall("delegate_to_workhorse"),
							input: "must refuse",
							transcriptDelta: "",
						}),
					),
				).toMatchObject({ code: expected.code });
				expect(fixtureValue.session.starts).toEqual([]);
			} finally {
				fixtureValue.cleanup();
			}
		}
	});

	test("binds the logical call to the coordinator thread and rechecks child and epoch after staging", async () => {
		const cross = fixture();
		try {
			const call = cross.setCall("delegate_to_workhorse");
			const wrongCall = {
				...call,
				threadId: cross.identity.decoder.adoptThreadId("another-coordinator"),
			};
			cross.replaceCall(wrongCall);
			expect(
				await rejected(
					cross.operations.delegate({
						call: wrongCall,
						input: "wrong caller",
						transcriptDelta: "",
					}),
				),
			).toMatchObject({ code: "invalid_call" });
			expect(cross.session.starts).toEqual([]);
		} finally {
			cross.cleanup();
		}

		for (const change of ["child", "epoch"] as const) {
			const fixtureValue = fixture();
			try {
				fixtureValue.operations.subscribe((event) => {
					if (event.type !== "accepted") return;
					const replacementIdentity = createIdentityAuthority();
					const childId =
						change === "child"
							? replacementIdentity.validator.childId
							: fixtureValue.binding.childId;
					const epoch =
						change === "epoch"
							? fixtureValue.identity.issuer.mintChildEpoch()
							: fixtureValue.binding.epoch;
					fixtureValue.replaceBinding({
						...fixtureValue.binding,
						childId,
						epoch,
						coordinator: { ...fixtureValue.binding.coordinator, childId, epoch },
						workhorse: { ...fixtureValue.binding.workhorse, childId, epoch },
					});
				});
				expect(
					await rejected(
						fixtureValue.operations.delegate({
							call: fixtureValue.setCall("delegate_to_workhorse"),
							input: "revoked after stage",
							transcriptDelta: "",
						}),
					),
				).toMatchObject({ code: change === "child" ? "stale_child" : "prior_epoch" });
				expect(fixtureValue.session.starts).toEqual([]);
			} finally {
				fixtureValue.cleanup();
			}
		}
	});

	test("rechecks the current call after context and at the queue final pre-effect boundary", async () => {
		const direct = fixture();
		try {
			direct.setBeforeContext(() => direct.replaceCall(null));
			expect(
				await rejected(
					direct.operations.delegate({
						call: direct.setCall("delegate_to_workhorse"),
						input: "revoked in context",
						transcriptDelta: "",
					}),
				),
			).toMatchObject({ code: "invalid_call", outcome: "not_delivered" });
			expect(direct.session.starts).toEqual([]);
		} finally {
			direct.cleanup();
		}

		const queued = fixture("active");
		try {
			queued.setStatus("active", [turn(queued.identity, "active", "inProgress")]);
			queued.queue.beforeEffect = () => {
				const current = queued.setCall("manage_workhorse_queue");
				queued.replaceCall({
					...current,
					threadId: queued.identity.decoder.adoptThreadId("other-coordinator"),
				});
			};
			expect(
				await rejected(
					queued.operations.manageQueue({
						call: queued.setCall("manage_workhorse_queue"),
						operation: "add",
						prompt: "revoked before queue RPC",
					}),
				),
			).toMatchObject({ outcome: "not_delivered" });
			expect(queued.queue.state).toEqual([]);
		} finally {
			queued.cleanup();
		}
	});

	test("reconciles an unknown queue start through the queued client identity", async () => {
		const fixtureValue = fixture("active");
		try {
			fixtureValue.setStatus("active", [turn(fixtureValue.identity, "busy", "inProgress")]);
			const events: WorkhorseOperationEvent[] = [];
			fixtureValue.operations.subscribe((event) => events.push(event));
			const delegated = await fixtureValue.operations.delegate({
				call: fixtureValue.setCall("delegate_to_workhorse"),
				input: "queued unknown start",
				transcriptDelta: "",
			});
			if (delegated.queuedSubmissionId === null) throw new Error("delegate was not queued");
			fixtureValue.queue.nextOutcome = "outcome_unknown";
			fixtureValue.queue.nextStartTurnId = null;
			expect(
				await rejected(
					fixtureValue.operations.manageQueue({
						call: fixtureValue.setCall("manage_workhorse_queue"),
						operation: "start",
						submissionId: delegated.queuedSubmissionId,
					}),
				),
			).toMatchObject({ outcome: "outcome_unknown" });
			fixtureValue.operations.onNotification(
				notification(fixtureValue, {
					method: "turn/started",
					params: {
						threadId: "workhorse",
						turn: rawTurn(
							fixtureValue.identity,
							"late-queue-turn",
							"inProgress",
							delegated.clientUserMessageId,
						),
					},
				}),
			);
			expect(events.filter((event) => event.type === "started")).toHaveLength(2);
			expect(fixtureValue.queue.calls.filter((call) => call === "start")).toHaveLength(1);
			expect(fixtureValue.epoch.snapshot().manifest.records.slice(-2)).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ status: "committed", outcome: "delivered" }),
					expect.objectContaining({ status: "committed", outcome: "delivered" }),
				]),
			);
		} finally {
			fixtureValue.cleanup();
		}
	});

	test("never uses the active-turn cache as steer authority", async () => {
		const fixtureValue = fixture();
		try {
			fixtureValue.session.nextStartTurn = turn(fixtureValue.identity, "cached", "inProgress");
			const delegated = await fixtureValue.operations.delegate({
				call: fixtureValue.setCall("delegate_to_workhorse"),
				input: "seed cache",
				transcriptDelta: "",
			});
			fixtureValue.setStatus("active", []);
			expect(
				await rejected(
					fixtureValue.operations.steer({
						call: fixtureValue.setCall("steer_workhorse"),
						expectedTurnId: delegated.turnId!,
						input: "must not use cache",
					}),
				),
			).toMatchObject({ code: "busy" });
			expect(fixtureValue.session.steers).toEqual([]);
		} finally {
			fixtureValue.cleanup();
		}
	});

	test("isolates throwing listeners and snapshots a reentrant subscriber cohort", async () => {
		const fixtureValue = fixture();
		try {
			const ordered: string[] = [];
			fixtureValue.operations.subscribe(() => {
				throw new Error("consumer failure");
			});
			fixtureValue.operations.subscribe((event) => {
				ordered.push(`existing:${event.type}`);
				if (event.type === "accepted")
					fixtureValue.operations.subscribe((later) => ordered.push(`late:${later.type}`));
			});
			const result = await fixtureValue.operations.delegate({
				call: fixtureValue.setCall("delegate_to_workhorse"),
				input: "listener isolation",
				transcriptDelta: "",
			});
			expect(result.mode).toBe("started");
			expect(ordered).toEqual(["existing:accepted", "existing:started", "late:started"]);
			expect(fixtureValue.session.starts).toHaveLength(1);
		} finally {
			fixtureValue.cleanup();
		}
	});

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
			if (delegated.queuedSubmissionId === null) throw new Error("delegate was not queued");
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
					if (operation !== "add") fixtureValue.queue.state = [queuedItem(fixtureValue)];
					fixtureValue.queue.nextOutcome = outcome;
					if (operation === "start" && outcome === "outcome_unknown")
						fixtureValue.queue.nextStartTurnId = null;
					const pending = mutate(fixtureValue, operation);
					if (outcome === "delivered") expect((await pending).operation).toBe(operation);
					else expect(await rejected(pending)).toMatchObject({ outcome });
					expect(fixtureValue.queue.calls).toEqual([operation]);
				} finally {
					fixtureValue.cleanup();
				}
			}
		});
	}
});
