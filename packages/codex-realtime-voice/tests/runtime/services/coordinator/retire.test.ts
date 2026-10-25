import { describe, expect, test } from "bun:test";

import { CodexSessionMutationError, type SessionThread } from "@archboard/codex-app-server/session";
import {
	type CoordinatorRetirement,
	type CoordinatorSnapshot,
} from "#runtime/protocol/coordinator/contract.ts";
import { fixture, type Fixture } from "#tests/runtime/services/coordinator/support.ts";

type ThreadId = SessionThread["id"];

async function flushMicrotasks(): Promise<void> {
	for (let turn = 0; turn < 8; turn += 1) {
		await Promise.resolve();
	}
}

async function ready(fixtureValue: Fixture): Promise<ThreadId> {
	const first = await fixtureValue.coordinator.ensure({ operationId: "coordinator-operation-1" });
	if (first.threadId === null) {
		throw new Error("fixture did not start a coordinator");
	}
	return first.threadId;
}

async function replace(
	fixtureValue: Fixture,
	reports: CoordinatorRetirement[],
): Promise<CoordinatorSnapshot> {
	fixtureValue.session.nextThread("coordinator-thread-2");
	const fresh = await fixtureValue.coordinator.replace({
		operationId: "voice-replacement",
		onRetired: (retirement) => reports.push(retirement),
	});
	await flushMicrotasks();
	return fresh;
}

function raw(fixtureValue: Fixture, threadId: ThreadId): string {
	return fixtureValue.authority.decoder.serializeCodexIdentity(threadId);
}

function status(fixtureValue: Fixture, threadId: ThreadId, active: boolean): void {
	fixtureValue.session.emit({
		method: "thread/status/changed",
		params: {
			threadId: raw(fixtureValue, threadId),
			status: active ? { type: "active", activeFlags: [] } : { type: "idle" },
		},
	});
}

describe("a coordinator a voice start replaced", () => {
	test("is unsubscribed once it is idle, so Codex unloads it", async () => {
		const fixtureValue = fixture();
		const retired = await ready(fixtureValue);
		const reports: CoordinatorRetirement[] = [];

		const fresh = await replace(fixtureValue, reports);

		expect(fresh.threadId).not.toBe(retired);
		expect(fixtureValue.session.unsubscribeParams).toEqual([{ threadId: retired }]);
		expect(reports).toEqual([{ threadId: retired, outcome: "unsubscribed" }]);
	});

	test("stays subscribed until its voice session closed and the turn that ended it finished", async () => {
		const fixtureValue = fixture();
		const retired = await ready(fixtureValue);
		fixtureValue.session.emit({
			method: "thread/realtime/started",
			params: { threadId: raw(fixtureValue, retired), realtimeSessionId: null, version: "v3" },
		});
		const reports: CoordinatorRetirement[] = [];

		await replace(fixtureValue, reports);
		// Codex starts the turn for the end of the transcript before it says the session closed.
		status(fixtureValue, retired, true);
		fixtureValue.session.emit({
			method: "thread/realtime/closed",
			params: { threadId: raw(fixtureValue, retired), reason: "requested" },
		});
		expect(fixtureValue.session.unsubscribeParams).toHaveLength(0);

		status(fixtureValue, retired, false);
		await flushMicrotasks();
		expect(fixtureValue.session.unsubscribeParams).toEqual([{ threadId: retired }]);
		expect(reports).toHaveLength(1);
	});

	test("takes a turn that started while it was being read over the read", async () => {
		const fixtureValue = fixture();
		const retired = await ready(fixtureValue);
		fixtureValue.session.onRead = () => status(fixtureValue, retired, true);

		await replace(fixtureValue, []);
		expect(fixtureValue.session.unsubscribeParams).toHaveLength(0);

		status(fixtureValue, retired, false);
		expect(fixtureValue.session.unsubscribeParams).toEqual([{ threadId: retired }]);
	});

	test("reports a failed unsubscribe and leaves the fresh coordinator ready", async () => {
		const fixtureValue = fixture();
		const retired = await ready(fixtureValue);
		fixtureValue.session.unsubscribeError = new CodexSessionMutationError(
			"thread/unsubscribe",
			"outcome_unknown",
			"fixture settlement timeout",
		);
		const reports: CoordinatorRetirement[] = [];

		const fresh = await replace(fixtureValue, reports);

		expect(reports).toEqual([
			{ threadId: retired, outcome: "failed", message: expect.any(String) },
		]);
		expect(fixtureValue.coordinator.snapshot()).toBe(fresh);
		expect(fresh.state).toBe("ready");
	});
});
