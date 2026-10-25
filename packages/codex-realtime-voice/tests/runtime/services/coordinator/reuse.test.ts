import { TEST_INSTRUCTIONS } from "#tests/runtime/support/host.ts";
import { describe, expect, test } from "bun:test";

import { CodexSessionMutationError } from "@archboard/codex-app-server/session";
import { type EpochOperationRecord } from "#runtime/store/epoch/manifest-contract.ts";
import {
	type CoordinatorPersistedState,
	type CoordinatorSnapshot,
	type CoordinatorThreadLinkClassification,
} from "#runtime/protocol/coordinator/contract.ts";
import { createIdentityAuthority } from "@archboard/codex-app-server/identity";
import { createCodexCoordinator } from "#runtime/services/coordinator/coordinator.ts";
import {
	WORKING_DIRECTORY,
	fixture,
	type Fixture,
} from "#tests/runtime/services/coordinator/support.ts";

function persistence(snapshot: CoordinatorSnapshot): CoordinatorPersistedState {
	if (snapshot.persistence === null) {
		throw new Error("fixture did not persist coordinator state");
	}
	return snapshot.persistence;
}

async function ready(
	fixtureValue: Fixture,
	operationId = "coordinator-operation-1",
): Promise<CoordinatorSnapshot> {
	const result = await fixtureValue.coordinator.ensure({ operationId });
	expect(result.state).toBe("ready");
	return result;
}

function coordinatorRecord(fixtureValue: Fixture, operationId: string): EpochOperationRecord {
	const record = fixtureValue.epoch.records.find(
		(candidate) => candidate.correlation.operationId === operationId,
	);
	if (record === undefined) {
		throw new Error(`missing fake record ${operationId}`);
	}
	return record;
}

function executableClassification(
	fixtureValue: Fixture,
	coordinatorPersistence: CoordinatorPersistedState,
): CoordinatorThreadLinkClassification {
	const record = coordinatorRecord(fixtureValue, coordinatorPersistence.operationId);
	return {
		link: {
			kind: "thread_link",
			state: "executable",
			childId: coordinatorPersistence.childId,
			epoch: coordinatorPersistence.epoch,
			threadId: coordinatorPersistence.threadId,
			source: "vscode",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
		thread: null,
		observation: {
			persisted: true,
			persistedRows: 1,
			loaded: true,
			loadedOccurrences: 1,
			source: "vscode",
			status: "idle",
			canAcceptDirectInput: true,
		},
		currentEpoch: {
			childId: coordinatorPersistence.childId,
			epoch: coordinatorPersistence.epoch,
		},
		proof: { record, manifestRevision: 3 },
	};
}

function inspectClassification(
	fixtureValue: Fixture,
	coordinatorPersistence: CoordinatorPersistedState,
	reason: "thread_loaded_list_missing" | "direct_input_false",
): CoordinatorThreadLinkClassification {
	const loaded = reason === "direct_input_false";
	return {
		link: {
			kind: "thread_link",
			state: "inspect_only",
			childId: null,
			epoch: null,
			threadId: coordinatorPersistence.threadId,
			source: "vscode",
			status: loaded ? "idle" : "notLoaded",
			loaded,
			canAcceptDirectInput: false,
			reason,
		},
		thread: null,
		observation: {
			persisted: true,
			persistedRows: 1,
			loaded,
			loadedOccurrences: loaded ? 1 : 0,
			source: "vscode",
			status: loaded ? "idle" : "notLoaded",
			canAcceptDirectInput: false,
		},
		currentEpoch: {
			childId: fixtureValue.authority.validator.childId,
			epoch: fixtureValue.authority.validator.epoch,
		},
		proof: null,
	};
}

describe("coordinator candidate reuse and replacement", () => {
	test("reuses only the matching loaded controllable current-epoch proof", async () => {
		const fixtureValue = fixture();
		const first = await ready(fixtureValue);
		const coordinatorPersistence = persistence(first);
		fixtureValue.link.outcome = executableClassification(fixtureValue, coordinatorPersistence);

		const reused = await fixtureValue.coordinator.ensure();

		expect(reused.state).toBe("ready");
		expect(reused.persistence).toEqual(coordinatorPersistence);
		expect(fixtureValue.session.startParams).toHaveLength(1);
		expect(fixtureValue.session.updateParams).toHaveLength(1);
		expect(fixtureValue.epoch.assertRequests).toHaveLength(1);
		expect(fixtureValue.link.calls[0]).toMatchObject({
			threadId: coordinatorPersistence.threadId,
			childId: coordinatorPersistence.childId,
			epoch: coordinatorPersistence.epoch,
			operationId: coordinatorPersistence.operationId,
			provenance: fixtureValue.epoch.records[0],
		});
	});

	test("does not infer a coordinator from a committed record when persisted settings are absent", async () => {
		const fixtureValue = fixture();
		await ready(fixtureValue);

		const inspected = await fixtureValue.coordinator.ensure({
			persisted: null,
			operationId: "not-a-retry",
		});

		expect(inspected.state).toBe("inspect_only");
		expect(inspected.reason).toContain("persisted coordinator settings snapshot");
		expect(fixtureValue.session.startParams).toHaveLength(1);
		expect(fixtureValue.link.calls).toHaveLength(0);
	});

	test("a conversation's first coordinator starts beside another conversation's committed one in the same epoch", async () => {
		const fixtureValue = fixture();
		await ready(fixtureValue);
		// Another browser tab's conversation, on the same child epoch and Codex session.
		const other = createCodexCoordinator({
			session: fixtureValue.session,
			threadLink: fixtureValue.link,
			epoch: fixtureValue.epoch,
			identity: fixtureValue.authority,
			workingDirectory: WORKING_DIRECTORY,
			profile: TEST_INSTRUCTIONS.coordinator,
		});
		const first = fixtureValue.coordinator;
		fixtureValue.session.notify = (event) => {
			first.onNotification(event);
			other.onNotification(event);
		};

		const started = await other.ensure({ operationId: "another-conversation" });

		expect(started.state).toBe("ready");
		expect(fixtureValue.session.startParams).toHaveLength(2);
		expect(first.snapshot().state).toBe("ready");
	});

	test("replaces an inspect-only not-loaded candidate through a new staged transaction", async () => {
		const fixtureValue = fixture();
		const first = await ready(fixtureValue);
		const coordinatorPersistence = persistence(first);
		fixtureValue.link.outcome = inspectClassification(
			fixtureValue,
			coordinatorPersistence,
			"thread_loaded_list_missing",
		);

		const replaced = await fixtureValue.coordinator.ensure({
			operationId: "replacement-operation",
		});

		expect(replaced.state).toBe("ready");
		expect(fixtureValue.session.startParams).toHaveLength(2);
		expect(fixtureValue.session.updateParams).toHaveLength(2);
		expect(fixtureValue.epoch.records).toHaveLength(2);
		expect(fixtureValue.epoch.records.every((record) => record.status === "committed")).toBe(true);
	});

	test("replaces an uncontrollable candidate but refuses replacement without a server operation id", async () => {
		const fixtureValue = fixture();
		const first = await ready(fixtureValue);
		const coordinatorPersistence = persistence(first);
		fixtureValue.link.outcome = inspectClassification(
			fixtureValue,
			coordinatorPersistence,
			"direct_input_false",
		);

		const inspected = await fixtureValue.coordinator.ensure();
		expect(inspected.state).toBe("inspect_only");
		expect(inspected.reason).toContain("fresh server operation id");
		expect(fixtureValue.session.startParams).toHaveLength(1);
		expect(fixtureValue.epoch.records).toHaveLength(1);
	});

	test("replaces stale-epoch evidence without classifying or reusing its thread", async () => {
		const fixtureValue = fixture();
		const first = await ready(fixtureValue);
		const coordinatorPersistence = persistence(first);
		const staleAuthority = createIdentityAuthority();
		const stalePersistence: CoordinatorPersistedState = {
			...coordinatorPersistence,
			childId: staleAuthority.validator.childId,
			epoch: staleAuthority.validator.epoch,
			threadId: staleAuthority.decoder.adoptThreadId("stale-coordinator"),
		};

		const replaced = await fixtureValue.coordinator.ensure({
			persisted: stalePersistence,
			operationId: "stale-replacement",
		});

		expect(replaced.state).toBe("ready");
		expect(fixtureValue.link.calls).toHaveLength(0);
		expect(fixtureValue.session.startParams).toHaveLength(2);
	});

	test("replaces review-hash drift instead of reusing a matching-looking thread", async () => {
		const fixtureValue = fixture();
		const first = await ready(fixtureValue);
		const coordinatorPersistence = persistence(first);
		const drifted: CoordinatorPersistedState = {
			...coordinatorPersistence,
			review: { ...coordinatorPersistence.review, instructionHash: "f".repeat(64) },
		};

		const replaced = await fixtureValue.coordinator.ensure({
			persisted: drifted,
			operationId: "hash-replacement",
		});

		expect(replaced.state).toBe("ready");
		expect(fixtureValue.link.calls).toHaveLength(0);
		expect(fixtureValue.session.startParams).toHaveLength(2);
	});

	test("replaces settings-hash drift before classification", async () => {
		const fixtureValue = fixture();
		const first = await ready(fixtureValue);
		const coordinatorPersistence = persistence(first);
		const drifted: CoordinatorPersistedState = {
			...coordinatorPersistence,
			review: { ...coordinatorPersistence.review, settingsHash: "d".repeat(64) },
		};

		const replaced = await fixtureValue.coordinator.ensure({
			persisted: drifted,
			operationId: "settings-hash-replacement",
		});

		expect(replaced.state).toBe("ready");
		expect(fixtureValue.link.calls).toHaveLength(0);
		expect(fixtureValue.session.startParams).toHaveLength(2);
	});
});

describe("coordinator replacement for a new voice session", () => {
	test("keeps the current coordinator published until the fresh one is ready, then swaps both", async () => {
		const fixtureValue = fixture();
		const first = await ready(fixtureValue);
		fixtureValue.session.nextThread("coordinator-thread-2");
		const published: CoordinatorSnapshot[] = [];
		fixtureValue.session.onStart = () => published.push(fixtureValue.coordinator.snapshot());

		const fresh = await fixtureValue.coordinator.replace({
			operationId: "voice-replacement",
			onRetired: () => undefined,
		});

		expect(published).toHaveLength(1);
		expect(published[0]).toBe(first);
		expect(fresh.state).toBe("ready");
		expect(fresh.threadId).not.toBe(first.threadId);
		expect(fixtureValue.coordinator.snapshot()).toBe(fresh);
		expect(fixtureValue.coordinator.persisted()).toEqual(persistence(fresh));
		expect(fixtureValue.epoch.records.map((record) => record.status)).toEqual([
			"committed",
			"committed",
		]);
	});

	test("leaves the current coordinator when the fresh one is uncertain, and still reuses it", async () => {
		const fixtureValue = fixture();
		const first = await ready(fixtureValue);
		const kept = persistence(first);
		fixtureValue.session.nextThread("coordinator-thread-2");
		fixtureValue.session.startError = new CodexSessionMutationError(
			"thread/start",
			"outcome_unknown",
			"fixture settlement timeout",
		);

		await expect(
			fixtureValue.coordinator.replace({
				operationId: "uncertain-replacement",
				onRetired: () => undefined,
			}),
		).rejects.toMatchObject({ code: "transaction_failed" });
		expect(fixtureValue.coordinator.snapshot()).toBe(first);
		expect(fixtureValue.coordinator.persisted()).toEqual(kept);
		fixtureValue.link.outcome = executableClassification(fixtureValue, kept);
		const reused = await fixtureValue.coordinator.ensure();
		expect(reused.state).toBe("ready");
		expect(reused.threadId).toBe(first.threadId);
		expect(fixtureValue.session.unsubscribeParams).toHaveLength(0);
	});
});
