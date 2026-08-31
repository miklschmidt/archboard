import { describe, expect, jest, test } from "bun:test";

import { CodexSessionMutationError } from "../../codex-session/index.js";
import type {
	CodexCoordinatorError,
	CoordinatorEffectiveSettings,
	CoordinatorSnapshot,
} from "../index.js";
import {
	COORDINATOR_CAPABILITY_POLICY,
	COORDINATOR_EFFORT,
	COORDINATOR_MODEL,
	createCoordinatorSettingsUpdateParams,
	createCoordinatorThreadStartParams,
} from "../index.js";
import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.js";
import { CODEX_REQUEST_SETTLEMENT_MS } from "../../../shared/timing/timing.js";
import { CHECKOUT_ROOT, coordinatorModel, fixture, type Fixture } from "./support.js";

async function flushMicrotasks(): Promise<void> {
	for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
}

async function ready(
	fixtureValue: Fixture,
	operationId = "coordinator-operation-1",
): Promise<CoordinatorSnapshot> {
	const result = await fixtureValue.coordinator.ensure({ operationId });
	expect(result.state).toBe("ready");
	return result;
}

function persistence(snapshot: CoordinatorSnapshot) {
	if (snapshot.persistence === null) throw new Error("fixture did not persist coordinator state");
	return snapshot.persistence;
}

async function expectCoordinatorCode(
	promise: Promise<unknown>,
	code: CodexCoordinatorError["code"],
): Promise<void> {
	try {
		await promise;
		throw new Error("expected coordinator operation to fail");
	} catch (error) {
		expect(error).toMatchObject({ code });
	}
}

describe("coordinator lifecycle", () => {
	test("starts the exact capable coordinator and records effective preserved settings", async () => {
		const fixtureValue = fixture({ staleNotificationAuthority: createIdentityAuthority() });
		const snapshot = await ready(fixtureValue);
		const coordinatorPersistence = persistence(snapshot);

		expect(fixtureValue.session.startParams).toEqual([
			createCoordinatorThreadStartParams(CHECKOUT_ROOT, "priority"),
		]);
		expect(fixtureValue.session.updateParams).toEqual([
			createCoordinatorSettingsUpdateParams(coordinatorPersistence.threadId, "priority"),
		]);
		expect(snapshot.configured).toEqual({
			model: COORDINATOR_MODEL,
			effort: COORDINATOR_EFFORT,
			serviceTier: "priority",
		});
		expect(snapshot.effective).toEqual({
			model: COORDINATOR_MODEL,
			effort: COORDINATOR_EFFORT,
			serviceTier: "priority",
		} satisfies CoordinatorEffectiveSettings);
		expect(snapshot.approvalPolicy).toBe("on-request");
		expect(snapshot.approvalsReviewer).toBe("user");
		expect(snapshot.sandboxPolicy).toEqual({ type: "dangerFullAccess" });
		expect(snapshot.activePermissionProfile).toEqual({ id: "archboard-default", extends: null });
		expect(snapshot.capabilities).toEqual(COORDINATOR_CAPABILITY_POLICY);
		expect(snapshot.capabilities.sustainedWork).toBe("instruction_policy");
		expect(coordinatorPersistence.settings.approvalPolicy).toBe("on-request");
		expect(coordinatorPersistence.settings.sandboxPolicy).toEqual({ type: "dangerFullAccess" });
		expect(coordinatorPersistence.settings.activePermissionProfile).toEqual({
			id: "archboard-default",
			extends: null,
		});
		expect(fixtureValue.epoch.records).toHaveLength(1);
		expect(fixtureValue.epoch.records[0]?.status).toBe("committed");
	});

	test("keeps configured and effective service tier absent when priority is not advertised", async () => {
		const fixtureValue = fixture({
			model: coordinatorModel({ serviceTiers: [], defaultServiceTier: null }),
		});
		const snapshot = await ready(fixtureValue, "fallback-operation");

		expect(snapshot.configured?.serviceTier).toBeNull();
		expect(snapshot.effective?.serviceTier).toBeNull();
		expect(Object.hasOwn(fixtureValue.session.startParams[0] ?? {}, "serviceTier")).toBe(false);
		expect(Object.hasOwn(fixtureValue.session.updateParams[0] ?? {}, "serviceTier")).toBe(false);
	});

	test("rolls back a known not-delivered thread/start without an automatic retry", async () => {
		const fixtureValue = fixture({
			startError: new CodexSessionMutationError(
				"thread/start",
				"not_delivered",
				"fixture delivery failure",
			),
		});
		const snapshot = await fixtureValue.coordinator.ensure({ operationId: "not-delivered" });

		expect(snapshot.state).toBe("failed");
		expect(fixtureValue.epoch.records[0]?.status).toBe("rolled_back");
		expect(fixtureValue.epoch.records[0]?.outcome).toBe("not_delivered");
		expect(fixtureValue.session.startParams).toHaveLength(1);
		expect(fixtureValue.session.updateParams).toHaveLength(0);
	});

	test("quarantines an unknown thread/start outcome and refuses a second start", async () => {
		const fixtureValue = fixture({
			startError: new CodexSessionMutationError(
				"thread/start",
				"outcome_unknown",
				"fixture settlement timeout",
			),
		});
		const first = await fixtureValue.coordinator.ensure({ operationId: "unknown-operation" });
		const second = await fixtureValue.coordinator.ensure({ operationId: "retry-operation" });

		expect(first.state).toBe("inspect_only");
		expect(second.state).toBe("inspect_only");
		expect(fixtureValue.epoch.records[0]?.status).toBe("inspect_only");
		expect(fixtureValue.epoch.records[0]?.outcome).toBe("outcome_unknown");
		expect(fixtureValue.session.startParams).toHaveLength(1);
		expect(second.reason).toContain("uncertain");
	});

	test("quarantines a settings/update loss and never retries the one update", async () => {
		const fixtureValue = fixture({
			updateError: new CodexSessionMutationError(
				"thread/settings/update",
				"outcome_unknown",
				"fixture settings settlement timeout",
			),
		});
		const first = await fixtureValue.coordinator.ensure({ operationId: "settings-unknown" });
		const second = await fixtureValue.coordinator.ensure({ operationId: "settings-retry" });

		expect(first.state).toBe("inspect_only");
		expect(fixtureValue.epoch.records[0]?.outcome).toBe("outcome_unknown");
		expect(fixtureValue.session.startParams).toHaveLength(1);
		expect(fixtureValue.session.updateParams).toHaveLength(1);
		expect(second.reason).toContain("uncertain");
	});

	test("expires after a delivered empty update without a matching notification", async () => {
		const fixtureValue = fixture({
			emitSettings: false,
		});
		jest.useFakeTimers();
		try {
			const pending = fixtureValue.coordinator.ensure({ operationId: "settings-timeout" });
			await flushMicrotasks();
			jest.advanceTimersByTime(CODEX_REQUEST_SETTLEMENT_MS);
			const snapshot = await pending;
			const retry = await fixtureValue.coordinator.ensure({
				operationId: "settings-timeout-retry",
			});

			expect(snapshot.state).toBe("inspect_only");
			expect(snapshot.threadId).not.toBeNull();
			expect(snapshot.reason).toContain("did not match");
			expect(fixtureValue.epoch.records[0]?.outcome).toBe("outcome_unknown");
			expect(fixtureValue.epoch.unknownCalls).toBe(1);
			expect(retry.state).toBe("inspect_only");
			expect(fixtureValue.epoch.unknownCalls).toBe(1);
			expect(fixtureValue.session.startParams).toHaveLength(1);
			expect(fixtureValue.session.updateParams).toHaveLength(1);
		} finally {
			jest.useRealTimers();
		}
	});

	test("settles timeout before deferred update without an unhandled rejection", async () => {
		const fixtureValue = fixture({ emitSettings: false, deferSettingsUpdate: true });
		const unhandledRejections: unknown[] = [];
		const onUnhandledRejection = (reason: unknown): void => {
			unhandledRejections.push(reason);
		};
		process.on("unhandledRejection", onUnhandledRejection);
		jest.useFakeTimers();
		try {
			const pending = fixtureValue.coordinator.ensure({ operationId: "deferred-settings-timeout" });
			await flushMicrotasks();
			expect(fixtureValue.session.updateParams).toHaveLength(1);

			jest.advanceTimersByTime(CODEX_REQUEST_SETTLEMENT_MS);
			await flushMicrotasks();
			expect(fixtureValue.epoch.unknownCalls).toBe(0);

			fixtureValue.session.releaseSettingsUpdate();
			const snapshot = await pending;
			const retry = await fixtureValue.coordinator.ensure({
				operationId: "deferred-settings-timeout-retry",
			});
			await flushMicrotasks();

			expect(snapshot.state).toBe("inspect_only");
			expect(snapshot.threadId).not.toBeNull();
			expect(fixtureValue.epoch.unknownCalls).toBe(1);
			expect(retry.state).toBe("inspect_only");
			expect(fixtureValue.epoch.unknownCalls).toBe(1);
			expect(fixtureValue.session.startParams).toHaveLength(1);
			expect(fixtureValue.session.updateParams).toHaveLength(1);
			expect(unhandledRejections).toHaveLength(0);
		} finally {
			fixtureValue.session.releaseSettingsUpdate();
			jest.useRealTimers();
			process.off("unhandledRejection", onUnhandledRejection);
		}
	});

	test("retains an earlier same-thread mismatch until a later exact notification", async () => {
		const fixtureValue = fixture({ emitSettings: false });
		jest.useFakeTimers();
		try {
			const pending = fixtureValue.coordinator.ensure({ operationId: "mismatch-then-exact" });
			await flushMicrotasks();
			const mismatchedSettings = {
				...fixtureValue.session.threadSettings,
				activePermissionProfile: { id: "other-profile", extends: null },
			};
			fixtureValue.session.emitSettingsNotification(mismatchedSettings);
			await flushMicrotasks();
			expect(fixtureValue.coordinator.snapshot().state).toBe("starting");
			expect(fixtureValue.epoch.records[0]?.status).toBe("staged");

			fixtureValue.session.emitSettingsNotification();
			const snapshot = await pending;
			expect(snapshot.state).toBe("ready");
			expect(fixtureValue.epoch.records[0]?.status).toBe("committed");
			expect(fixtureValue.session.updateParams).toHaveLength(1);
		} finally {
			jest.useRealTimers();
		}
	});

	test("fails the ensure when the current epoch is unavailable", async () => {
		const fixtureValue = fixture({ activeEpoch: null });

		await expectCoordinatorCode(
			fixtureValue.coordinator.ensure({ operationId: "no-epoch" }),
			"epoch_unavailable",
		);
		expect(fixtureValue.coordinator.snapshot().state).toBe("failed");
	});

	test("does not start when the epoch transaction cannot be staged", async () => {
		const fixtureValue = fixture({ stageError: new Error("fixture stage failure") });

		await expectCoordinatorCode(
			fixtureValue.coordinator.ensure({ operationId: "stage-failure" }),
			"transaction_failed",
		);
		expect(fixtureValue.session.startParams).toHaveLength(0);
		expect(fixtureValue.coordinator.snapshot().state).toBe("failed");
	});

	test("quarantines a durable commit failure after the remote coordinator is ready", async () => {
		const fixtureValue = fixture({ commitError: new Error("fixture commit failure") });
		const snapshot = await fixtureValue.coordinator.ensure({ operationId: "commit-failure" });

		expect(snapshot.state).toBe("inspect_only");
		expect(snapshot.reason).toContain("durable ownership proof");
		expect(fixtureValue.epoch.records[0]?.status).toBe("inspect_only");
		expect(fixtureValue.epoch.records[0]?.outcome).toBe("outcome_unknown");
	});
});
