import { afterEach, describe, expect, test } from "bun:test";

import {
	parseRealtimeCorrelationId,
	parseRealtimeSessionId,
} from "../../../shared/codex-realtime-host/index.js";
import { COORDINATOR_CAPABILITY_POLICY } from "../../codex-coordinator/index.js";
import {
	cleanup,
	makeHarness,
	PROMPT,
	resolverRequest,
	stateEvent,
	transcript,
	turnEvent,
	type GateHarness,
} from "./support.js";

const harnesses: GateHarness[] = [];
afterEach(() => {
	for (const value of harnesses) cleanup(value);
	harnesses.length = 0;
});

function harness(options: Parameters<typeof makeHarness>[0] = {}): GateHarness {
	const value = makeHarness(options);
	harnesses.push(value);
	return value;
}

async function flush(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

function arm(harnessValue: GateHarness): void {
	expect(harnessValue.gate.arm(harnessValue.armInput).state).toBe("awaiting_user");
}

describe("spoken approval state gate", () => {
	test("waits for one later final user item and never settles from realtime", async () => {
		const h = harness();
		arm(h);
		h.realtime.emitTranscript(transcript("user", "provisional", "user-1", 11, "yes"));
		expect(h.gate.snapshot().state).toBe("awaiting_user");
		h.realtime.emitTranscript(transcript("user", "final", "user-1", 11, "yes"));
		await flush();
		expect(h.startParams).toHaveLength(1);
		expect(h.gate.snapshot().state).toBe("awaiting_resolver");
		expect(h.broker.get(h.approval.requestId)?.state).toBe("pending");
		expect(h.port.responses).toHaveLength(0);
		h.realtime.emitTranscript(transcript("user", "final", "user-1", 11, "yes"));
		await flush();
		expect(h.startParams).toHaveLength(1);
	});

	test("rejects pre-existing post-prompt items, including provisional and assistant output", () => {
		const cases = [
			[transcript("user", "final", "old-user", 11, "yes"), "user_already_spoke"],
			[transcript("user", "provisional", "old-user", 11, "yes"), "user_already_spoke"],
			[transcript("assistant", "final", "old-assistant", 11, "run it"), "assistant_only"],
		] as const;
		for (const [record, reason] of cases) {
			const h = harness({
				records: [
					transcript("assistant", "final", PROMPT.itemId, 10, "Run echo approved in /workspace"),
					record,
				],
			});
			const snapshot = h.gate.arm(h.armInput);
			expect(snapshot.state).toBe("visual_fallback");
			expect(snapshot.reason).toBe(reason);
		}
	});

	test("rejects an assistant effect prompt that differs from the broker presentation", () => {
		const h = harness({
			records: [
				transcript(
					"assistant",
					"final",
					PROMPT.itemId,
					PROMPT.sequence,
					"Approve a different harmless effect",
				),
			],
		});
		const snapshot = h.gate.arm(h.armInput);
		expect(snapshot).toMatchObject({
			state: "visual_fallback",
			reason: "invalid_effect_prompt",
		});
		expect(h.startParams).toHaveLength(0);

		const callerSummary = harness();
		const callerSnapshot = callerSummary.gate.arm({
			...callerSummary.armInput,
			effectSummary: "Approve a different harmless effect",
		});
		expect(callerSnapshot).toMatchObject({
			state: "visual_fallback",
			reason: "invalid_effect_prompt",
		});
	});

	test("keeps null and omitted command approvals visual-only", () => {
		for (const options of [{ command: null }, { omitCommand: true }]) {
			const h = harness(options);
			expect(h.broker.spokenEligibility(h.approval.requestId)).toEqual({
				eligible: false,
				reason: "unsupported_schema",
			});
			expect(h.gate.arm(h.armInput)).toMatchObject({
				state: "visual_fallback",
				reason: "not_eligible",
			});
			expect(h.startParams).toHaveLength(0);
		}
	});

	test("falls back on stale session, empty final text, assistant speech, and realtime failure", () => {
		const stale = harness();
		arm(stale);
		const other = {
			sessionId: parseRealtimeSessionId("other-session"),
			correlationId: parseRealtimeCorrelationId("other-correlation"),
		};
		stale.realtime.emitTranscript(transcript("user", "final", "stale-user", 11, "yes", other));
		expect(stale.gate.snapshot()).toMatchObject({
			state: "visual_fallback",
			reason: "stale_realtime_session",
		});

		const empty = harness();
		arm(empty);
		empty.realtime.emitTranscript(transcript("user", "final", "empty-user", 11, ""));
		expect(empty.gate.snapshot()).toMatchObject({
			state: "visual_fallback",
			reason: "missing_user_final",
		});

		const assistant = harness();
		arm(assistant);
		assistant.realtime.emitTranscript(
			transcript("assistant", "final", "new-assistant", 11, "more speech"),
		);
		expect(assistant.gate.snapshot()).toMatchObject({
			state: "visual_fallback",
			reason: "assistant_only",
		});

		const failed = harness();
		arm(failed);
		failed.realtime.emit(stateEvent(failed, "idle"));
		expect(failed.gate.snapshot()).toMatchObject({
			state: "visual_fallback",
			reason: "realtime_unavailable",
		});
	});

	test("starts one exact ordinary classifier turn and records the final user evidence", async () => {
		const h = harness();
		arm(h);
		h.realtime.emitTranscript(transcript("user", "final", "user-final", 11, "yes, run it"));
		await flush();
		const params = h.startParams[0];
		if (params === undefined) throw new Error("The classifier turn was not started.");
		const input = params.input[0];
		if (input?.type !== "text") throw new Error("The classifier prompt was not text input.");
		expect(params.turnTrigger).toBe("archboard");
		expect(params.clientUserMessageId).toBe("classifier-message");
		expect(input.text).toContain("user_final_item_id: user-final");
		expect(input.text).toContain("user_final_sequence: 11");
		expect(input.text).toContain("user_final_text: yes, run it");
		expect(params.additionalContext?.archboard?.kind).toBe("application");
		expect(h.gate.snapshot()).toMatchObject({
			state: "awaiting_resolver",
			finalUserItemId: "user-final",
			finalUserSequence: 11,
			finalUserText: "yes, run it",
		});
	});

	test("accepts only one matching resolver call and supplies the captured approval identity", async () => {
		const h = harness();
		arm(h);
		h.realtime.emitTranscript(transcript("user", "final", "user-final", 11, "yes"));
		await flush();
		const request = resolverRequest(h);
		const result = await h.gate.resolve(request);
		expect(result).toEqual({ tag: "ok", value: { verdict: "accept", settlement: "delivered" } });
		expect(h.port.responses).toHaveLength(1);
		expect(h.broker.get(h.approval.requestId)?.state).toBe("settled");
		expect(h.gate.snapshot().state).toBe("settled");
		expect(await h.gate.resolve(request)).toMatchObject({ tag: "refused", reason: "not_ready" });
		expect(h.port.responses).toHaveLength(1);
	});

	test("refuses a wrong manifest or thread and moves to visual fallback", async () => {
		const manifest = harness();
		arm(manifest);
		manifest.realtime.emitTranscript(transcript("user", "final", "user-final", 11, "yes"));
		await flush();
		const wrongManifest = await manifest.gate.resolve(
			resolverRequest(manifest, "accept", { manifestHash: "wrong" }),
		);
		expect(wrongManifest).toMatchObject({ tag: "refused", reason: "invalid_call" });
		expect(manifest.gate.snapshot()).toMatchObject({
			state: "visual_fallback",
			reason: "ambiguous",
		});

		const thread = harness();
		arm(thread);
		thread.realtime.emitTranscript(transcript("user", "final", "user-final", 11, "yes"));
		await flush();
		const otherThread = thread.identity.decoder.adoptThreadId("other-thread");
		const wrongThread = await thread.gate.resolve(
			resolverRequest(thread, "accept", { threadId: otherThread }),
		);
		expect(wrongThread).toMatchObject({ tag: "refused", reason: "invalid_call" });
		expect(thread.gate.snapshot()).toMatchObject({ state: "visual_fallback", reason: "ambiguous" });
	});

	test("revalidates effect, realtime, expiry, and child ownership before settlement", async () => {
		const effect = harness();
		arm(effect);
		effect.realtime.emitTranscript(transcript("user", "final", "user-final", 11, "yes"));
		await flush();
		effect.currentBinding = { effect: "changed-effect" };
		const changed = await effect.gate.resolve(resolverRequest(effect));
		expect(changed).toMatchObject({ tag: "refused", reason: "unknown_provenance" });
		expect(effect.gate.snapshot()).toMatchObject({
			state: "visual_fallback",
			reason: "changed_effect",
		});

		const session = harness();
		arm(session);
		session.realtime.emitTranscript(transcript("user", "final", "user-final", 11, "yes"));
		await flush();
		session.realtimeCorrelation = {
			sessionId: parseRealtimeSessionId("replaced-session"),
			correlationId: parseRealtimeCorrelationId("replaced-correlation"),
		};
		const stale = await session.gate.resolve(resolverRequest(session));
		expect(stale).toMatchObject({ tag: "refused", reason: "unknown_provenance" });
		expect(session.gate.snapshot()).toMatchObject({
			state: "visual_fallback",
			reason: "stale_realtime_session",
		});

		const expired = harness();
		arm(expired);
		expired.now = expired.gate.snapshot().expiresAtMs ?? expired.now;
		expired.realtime.emitTranscript(transcript("user", "final", "user-final", 11, "yes"));
		expect(expired.gate.snapshot()).toMatchObject({ state: "visual_fallback", reason: "timeout" });

		const exited = harness();
		arm(exited);
		exited.gate.onChildExit({
			child: exited.identity.validator.childId,
			epoch: exited.identity.validator.epoch,
		});
		expect(exited.gate.snapshot()).toMatchObject({
			state: "visual_fallback",
			reason: "child_exit",
		});
	});

	test("handles turn start races, notification identity, classifier loss, and disposal", async () => {
		const deferred = harness({ deferTurn: true });
		arm(deferred);
		deferred.realtime.emitTranscript(transcript("user", "final", "user-final", 11, "yes"));
		await flush();
		expect(deferred.gate.snapshot().state).toBe("classifying");
		const pending = deferred.gate.resolve(resolverRequest(deferred));
		await flush();
		const release = deferred.resolveTurn;
		if (release === null) throw new Error("The deferred classifier turn was not captured.");
		release();
		expect((await pending).tag).toBe("ok");

		const notified = harness({ deferTurn: true });
		arm(notified);
		notified.realtime.emitTranscript(transcript("user", "final", "user-final", 11, "yes"));
		notified.gate.onNotification(turnEvent(notified, "turn/started"));
		notified.gate.onNotification(turnEvent(notified, "turn/completed"));
		expect(notified.gate.snapshot()).toMatchObject({
			state: "visual_fallback",
			reason: "classifier_lost",
		});

		const lost = harness({ turnFailure: new Error("turn start unavailable") });
		arm(lost);
		lost.realtime.emitTranscript(transcript("user", "final", "user-final", 11, "yes"));
		await flush();
		expect(lost.gate.snapshot()).toMatchObject({
			state: "visual_fallback",
			reason: "classifier_lost",
		});

		const disposed = harness();
		arm(disposed);
		disposed.gate.dispose();
		expect(disposed.gate.snapshot()).toMatchObject({
			state: "visual_fallback",
			reason: "disposed",
		});
	});

	test("does not accept a non-ready coordinator", () => {
		const h = harness();
		h.coordinatorState = {
			...h.coordinatorState,
			state: "starting",
			capabilities: COORDINATOR_CAPABILITY_POLICY,
		};
		const result = h.gate.arm(h.armInput);
		expect(result).toMatchObject({ state: "visual_fallback", reason: "coordinator_unavailable" });
	});

	test("keeps the slot one-shot and falls back when resolver delivery is lost", async () => {
		const busy = harness();
		arm(busy);
		expect(() => busy.gate.arm(busy.armInput)).toThrow();
		busy.gate.dispose();
		expect(() => busy.gate.arm(busy.armInput)).toThrow();

		const lost = harness({ settlementFailure: "outcome_unknown" });
		arm(lost);
		lost.realtime.emitTranscript(transcript("user", "final", "user-final", 11, "yes"));
		await flush();
		const result = await lost.gate.resolve(resolverRequest(lost));
		expect(result).toEqual({
			tag: "ok",
			value: { verdict: "accept", settlement: "outcome_unknown" },
		});
		expect(lost.gate.snapshot()).toMatchObject({
			state: "visual_fallback",
			reason: "resolver_lost",
		});
		expect(lost.port.responses).toHaveLength(1);
	});
});
