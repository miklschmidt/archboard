import { describe, expect, test } from "bun:test";

import { CodexEpochError } from "../../codex-epoch/index.ts";
import { CodexSessionMutationError } from "../../codex-session/index.ts";
import type { ThreadLinkSnapshot } from "../../codex-thread-link/index.ts";
import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.ts";
import { createHarness, FEED_ID, inspectOnlyLink, unboundLink } from "./delivery-support.ts";

describe("codex thread context delivery", () => {
	test("delivers one canonical developer input_text body through the fixed link", async () => {
		const harness = createHarness();
		const event = harness.events();

		const result = await harness.delivery.deliver(event);

		expect(result.outcome).toBe("delivered");
		expect(result.reason).toBeNull();
		expect(result.attempted).toBe(true);
		expect(harness.received).toHaveLength(1);
		if (result.payload === null) throw new Error("delivered outcome did not retain its payload");
		expect(JSON.stringify(harness.received[0])).toBe(JSON.stringify(result.payload));
		expect(result.payload?.items).toHaveLength(1);
		expect(result.payload?.items[0]).toMatchObject({
			type: "message",
			role: "developer",
			content: [{ type: "input_text" }],
		});
		expect(result.payload?.threadId).toBe(harness.target.threadId);
		expect(harness.classifyCalls()).toBe(1);
		expect(harness.epochRequests()).toHaveLength(2);
		expect(Object.isFrozen(result)).toBe(true);
		expect(Object.isFrozen(result.event)).toBe(true);
	});

	test("does not send agent-only or cosmetic events", async () => {
		const harness = createHarness();

		const agent = await harness.delivery.deliver(harness.events({ origin: "agent" }));
		const cosmetic = await harness.delivery.deliver(
			harness.events({ sequence: 2, significance: "cosmetic" }),
		);

		expect(agent).toMatchObject({
			outcome: "not_delivered",
			reason: "agent_only",
			attempted: false,
		});
		expect(cosmetic).toMatchObject({
			outcome: "not_delivered",
			reason: "cosmetic",
			attempted: false,
		});
		expect(harness.received).toHaveLength(0);
	});

	test("refuses an unbound link and every inspect-only safety condition", async () => {
		const cases: readonly [
			string,
			ThreadLinkSnapshot | null,
			"unbound" | "thread_status_not_loaded" | "direct_input_false" | "thread_status_system_error",
		][] = [
			["unbound", null, "unbound"],
			["not loaded", null, "thread_status_not_loaded"],
			["uncontrollable", null, "direct_input_false"],
			["system error", null, "thread_status_system_error"],
		];

		for (const [, link, reason] of cases) {
			const harness = createHarness();
			harness.setLink(
				link ??
					inspectOnlyLink(
						harness.target.threadId,
						reason === "unbound" ? "unknown_provenance" : reason,
					),
			);
			if (reason === "unbound") harness.setLink(unboundLink());
			const result = await harness.delivery.deliver(harness.events());
			expect(result).toMatchObject({ outcome: "not_delivered", reason, attempted: false });
			expect(harness.received).toHaveLength(0);
		}
	});

	test("rejects an inspect-only result from the final fresh classification", async () => {
		const harness = createHarness();
		harness.setClassificationLink(
			inspectOnlyLink(harness.target.threadId, "thread_loaded_list_missing"),
		);

		const result = await harness.delivery.deliver(harness.events());

		expect(result).toMatchObject({
			outcome: "not_delivered",
			reason: "thread_loaded_list_missing",
			attempted: false,
		});
		expect(result.payload).not.toBeNull();
		expect(harness.received).toHaveLength(0);
	});

	test("rechecks the pane link after the final classification and before writing", async () => {
		const harness = createHarness();
		harness.setClassifyEffect(() => harness.setLink(unboundLink()));

		const result = await harness.delivery.deliver(harness.events());

		expect(result).toMatchObject({
			outcome: "not_delivered",
			reason: "link_changed",
			attempted: false,
		});
		expect(harness.received).toHaveLength(0);
	});

	test("rejects a stale child and a prior epoch before revalidation", async () => {
		const staleChildHarness = createHarness();
		const otherAuthority = createIdentityAuthority();
		staleChildHarness.setExecution({
			childId: otherAuthority.validator.childId,
			epoch: otherAuthority.validator.epoch,
		});
		const staleChild = await staleChildHarness.delivery.deliver(staleChildHarness.events());

		const priorEpochHarness = createHarness();
		const priorEpoch = priorEpochHarness.authority.issuer.mintChildEpoch();
		priorEpochHarness.setExecution({
			childId: priorEpochHarness.target.childId,
			epoch: priorEpoch,
		});
		const priorEpochResult = await priorEpochHarness.delivery.deliver(priorEpochHarness.events());

		expect(staleChild).toMatchObject({
			outcome: "not_delivered",
			reason: "stale_child",
			attempted: false,
		});
		expect(priorEpochResult).toMatchObject({
			outcome: "not_delivered",
			reason: "prior_epoch",
			attempted: false,
		});
	});

	test("does not send a stale event or a prior cursor", async () => {
		const harness = createHarness();
		const first = await harness.delivery.deliver(harness.events({ sequence: 3 }));
		const stale = await harness.delivery.deliver(harness.events({ sequence: 2 }));
		const oldFeed = await harness.delivery.deliver(
			harness.events({ sequence: 4, feedId: "old-feed" }),
		);
		const explicitlyStale = await harness.delivery.deliver(
			harness.events({ sequence: 5, stale: true }),
		);

		expect(first.outcome).toBe("delivered");
		expect(stale).toMatchObject({
			outcome: "not_delivered",
			reason: "stale_cursor",
			attempted: false,
		});
		expect(oldFeed).toMatchObject({
			outcome: "not_delivered",
			reason: "stale_cursor",
			attempted: false,
		});
		expect(explicitlyStale).toMatchObject({
			outcome: "not_delivered",
			reason: "stale_event",
			attempted: false,
		});
		expect(harness.received).toHaveLength(1);
	});

	test("coalesces a duplicate identity while the first attempt is in flight", async () => {
		const harness = createHarness();
		harness.holdResponse();
		const event = harness.events();

		const firstPromise = harness.delivery.deliver(event);
		const duplicatePromise = harness.delivery.deliver(event);
		await harness.flush();

		expect(duplicatePromise).toBe(firstPromise);
		expect(harness.received).toHaveLength(1);
		harness.resolveResponse();
		const result = await firstPromise;

		expect(result.outcome).toBe("delivered");
		expect(harness.delivery.get({ feedId: FEED_ID, sequence: 1 })).toBe(result);
		expect(harness.delivery.inspect()).toEqual([result]);
	});

	test("reports a child exit during the write as outcome_unknown", async () => {
		const harness = createHarness();
		harness.setSessionBehavior(async () => {
			harness.setExecution(null);
			return {};
		});

		const result = await harness.delivery.deliver(harness.events());

		expect(result).toMatchObject({
			outcome: "outcome_unknown",
			reason: "child_exit",
			attempted: true,
		});
	});

	test("reports a link change during the write as outcome_unknown", async () => {
		const harness = createHarness();
		harness.setSessionBehavior(async () => {
			harness.setLink(unboundLink());
			return {};
		});

		const result = await harness.delivery.deliver(harness.events());

		expect(result).toMatchObject({
			outcome: "outcome_unknown",
			reason: "link_changed",
			attempted: true,
		});
	});

	test("reports a prior epoch discovered after the write as outcome_unknown", async () => {
		const harness = createHarness();
		harness.setSessionBehavior(async () => {
			harness.setEpochError(new CodexEpochError("prior_epoch", "epoch changed"));
			return {};
		});

		const result = await harness.delivery.deliver(harness.events());

		expect(result).toMatchObject({
			outcome: "outcome_unknown",
			reason: "prior_epoch",
			attempted: true,
		});
	});

	test("keeps a known session rejection as not_delivered", async () => {
		const harness = createHarness();
		harness.setSessionBehavior(async () => {
			throw new CodexSessionMutationError(
				"thread/inject_items",
				"not_delivered",
				"rejected before delivery",
			);
		});

		const result = await harness.delivery.deliver(harness.events());

		expect(result).toMatchObject({
			outcome: "not_delivered",
			reason: "session_rejected",
			attempted: true,
		});
	});

	test("does not guess after a lost response", async () => {
		const harness = createHarness();
		harness.setSessionBehavior(async () => {
			throw new Error("transport closed");
		});

		const result = await harness.delivery.deliver(harness.events());

		expect(result).toMatchObject({
			outcome: "outcome_unknown",
			reason: "response_lost",
			attempted: true,
		});
	});

	test("rejects a context whose semantic snapshot is not the event", async () => {
		const harness = createHarness({ contextValid: false });

		const result = await harness.delivery.deliver(harness.events());

		expect(result).toMatchObject({
			outcome: "not_delivered",
			reason: "invalid_context",
			attempted: false,
		});
		expect(harness.classifyCalls()).toBe(0);
		expect(harness.received).toHaveLength(0);
	});

	test("uses the publisher subscription and stops accepting events after dispose", async () => {
		const harness = createHarness();
		harness.emit(harness.events());
		await harness.flush();
		expect(harness.received).toHaveLength(1);

		harness.delivery.dispose();
		harness.emit(harness.events({ sequence: 2 }));
		await harness.flush();
		expect(harness.received).toHaveLength(1);
	});
});
