import { describe, expect, test } from "bun:test";

import { CodexEpochError } from "#runtime/store/epoch/contract.ts";
import { type ThreadInjectItemsParams } from "#runtime/rules/host/bodies.ts";
import { CodexSessionMutationError } from "@archboard/codex-app-server/session";
import { type ThreadLinkSnapshot } from "#runtime/rules/thread-link/contract.ts";
import { createIdentityAuthority } from "@archboard/codex-app-server/identity";
import {
	createHarness,
	FEED_ID,
	inspectOnlyLink,
	unboundLink,
} from "#tests/runtime/services/thread-context/delivery-support.ts";

function invokeRelease(release: (() => void) | null, message: string): void {
	if (release === null) {
		throw new Error(message);
	}
	release();
}

function decodePayloadContext(payload: ThreadInjectItemsParams): {
	readonly brief: { readonly text: string };
} {
	return JSON.parse(payload.items[0]!.content[0]!.text) as {
		readonly brief: { readonly text: string };
	};
}

describe("codex thread context delivery", () => {
	test("delivers one canonical developer input_text body through the fixed link", async () => {
		const harness = createHarness();
		const event = harness.events();

		const result = await harness.delivery.deliver(event);

		expect(result.outcome).toBe("delivered");
		expect(result.reason).toBeNull();
		expect(result.attempted).toBe(true);
		expect(harness.received).toHaveLength(1);
		if (result.payload === null) {
			throw new Error("delivered outcome did not retain its payload");
		}
		expect(JSON.stringify(harness.received[0])).toBe(JSON.stringify(result.payload));
		expect(result.payload?.items).toHaveLength(1);
		expect(result.payload?.items[0]).toMatchObject({
			type: "message",
			role: "developer",
			content: [{ type: "input_text" }],
		});
		expect(decodePayloadContext(result.payload).brief.text).toBe(event.text ?? "");
		expect(result.payload?.threadId).toBe(harness.target.threadId);
		expect(harness.classifyCalls()).toBe(1);
		expect(harness.epochRequests()).toHaveLength(2);
		expect(Object.isFrozen(result)).toBe(true);
		expect(Object.isFrozen(result.event)).toBe(true);
	});

	test("does not send a change whose words the host withheld", async () => {
		const harness = createHarness();

		const withheld = await harness.delivery.deliver(
			harness.events({ sequence: 2, withheld: "cosmetic" }),
		);

		expect(withheld).toMatchObject({
			outcome: "not_delivered",
			reason: "withheld",
			attempted: false,
		});
		expect(harness.received).toHaveLength(0);
	});

	test("sends every settled change, including one this thread's own work made", async () => {
		const harness = createHarness();

		// The news a thread most needs is that what it was told has stopped being
		// true, and nothing about the change says whose work made it. It used to:
		// a write stated the pane it was running for, and a change whose stated
		// pane matched this port's was dropped as an echo. That made a surface a
		// person opens and closes decide who hears about an architecture, and it
		// went quiet in the one case that mattered — two threads on one claimed
		// board, where the second suppressed the first's change.
		//
		// Redundancy replaces it: a thread may be told about its own write, and
		// that is a thing it is told how to read.
		const first = await harness.delivery.deliver(harness.events());
		const second = await harness.delivery.deliver(harness.events({ sequence: 2 }));

		expect(first).toMatchObject({ outcome: "delivered", attempted: true });
		expect(second).toMatchObject({ outcome: "delivered", attempted: true });
		expect(harness.received).toHaveLength(2);
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
			if (reason === "unbound") {
				harness.setLink(unboundLink());
			}
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

	test("does not send a stale change or a sequence that does not pass its feed's last", async () => {
		const harness = createHarness();
		const first = await harness.delivery.deliver(harness.events({ sequence: 3 }));
		const prior = await harness.delivery.deliver(harness.events({ sequence: 2 }));
		const otherFeed = await harness.delivery.deliver(
			harness.events({ sequence: 1, feedId: "other-feed" }),
		);
		const stale = await harness.delivery.deliver(harness.events({ sequence: 5, stale: true }));

		expect(first.outcome).toBe("delivered");
		expect(prior).toMatchObject({
			outcome: "not_delivered",
			reason: "stale_cursor",
			attempted: false,
		});
		// Each feed keeps its own sequence.
		expect(otherFeed.outcome).toBe("delivered");
		expect(stale).toMatchObject({
			outcome: "not_delivered",
			reason: "stale_event",
			attempted: false,
		});
		expect(harness.received).toHaveLength(2);
	});

	test("reserves a newer cursor before delayed classification and inspects in first-seen order", async () => {
		const harness = createHarness();
		let releaseFirst: (() => void) | null = null;
		harness.setClassificationDelay((call) =>
			call === 1
				? new Promise<void>((resolve) => {
						releaseFirst = () => resolve();
					})
				: Promise.resolve(),
		);

		const firstPromise = harness.delivery.deliver(harness.events({ sequence: 1 }));
		await harness.flush();
		expect(harness.classifyCalls()).toBe(1);

		const second = await harness.delivery.deliver(harness.events({ sequence: 2 }));
		expect(second).toMatchObject({ outcome: "delivered", attempted: true, reason: null });
		expect(harness.delivery.inspect()).toEqual([second]);
		expect(harness.received).toHaveLength(1);

		invokeRelease(releaseFirst, "first classification was not held");
		const first = await firstPromise;
		expect(first).toMatchObject({
			outcome: "not_delivered",
			reason: "stale_cursor",
			attempted: false,
		});
		expect(harness.delivery.inspect()).toEqual([first, second]);
		expect(harness.received).toHaveLength(1);
	});

	test("checks the injected clock after a classification that crosses freshness expiry", async () => {
		const harness = createHarness();
		let releaseClassification: (() => void) | null = null;
		harness.setClassificationDelay(
			() =>
				new Promise<void>((resolve) => {
					releaseClassification = () => resolve();
				}),
		);

		const deliveryPromise = harness.delivery.deliver(harness.events());
		await harness.flush();
		harness.setNow(201);
		invokeRelease(releaseClassification, "classification was not held");

		const result = await deliveryPromise;
		expect(result).toMatchObject({
			outcome: "not_delivered",
			reason: "stale_event",
			attempted: false,
		});
		expect(harness.received).toHaveLength(0);
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

	test("stops accepting changes after dispose", async () => {
		const harness = createHarness();
		await harness.delivery.deliver(harness.events());
		expect(harness.received).toHaveLength(1);

		harness.delivery.dispose();
		const after = await harness.delivery.deliver(harness.events({ sequence: 2 }));
		expect(after).toMatchObject({ outcome: "not_delivered", attempted: false });
		expect(harness.received).toHaveLength(1);
	});
});
