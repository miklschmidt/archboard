import { describe, expect, test } from "bun:test";

import type { ThreadInjectItemsParams } from "@archboard/codex-realtime-voice/runtime";
import { createHarness, PANE_ID } from "#tests/runtime/services/thread-context/delivery-support.ts";

// What delivery does with the Archboard context: its focus and claim fields, and a context that
// does not match the event it was built for. The delivery mechanics live with the voice package.

interface EncodedContextProjection {
	readonly focus: { readonly paneId: string | null };
	readonly claim: { readonly doing: string | null };
	readonly semantic: { readonly brief: string };
}

function decodePayloadContext(payload: ThreadInjectItemsParams): EncodedContextProjection {
	return JSON.parse(payload.items[0]!.content[0]!.text) as EncodedContextProjection;
}

describe("codex thread context delivery of the Archboard context", () => {
	test("a focused event carries the focused pane in the delivered body", async () => {
		const harness = createHarness();

		const result = await harness.delivery.deliver(harness.events({ focused: true }));

		expect(result.outcome).toBe("delivered");
		if (result.payload === null) {
			throw new Error("delivered outcome did not retain its payload");
		}
		expect(decodePayloadContext(result.payload).focus.paneId).toBe(PANE_ID);
	});

	test("clears focus for an unfocused event and rejects a focused context", async () => {
		const unfocusedHarness = createHarness();
		const unfocused = await unfocusedHarness.delivery.deliver(
			unfocusedHarness.events({ focused: false }),
		);

		expect(unfocused.outcome).toBe("delivered");
		if (unfocused.payload === null) {
			throw new Error("unfocused delivery did not retain its payload");
		}
		expect(decodePayloadContext(unfocused.payload).focus.paneId).toBeNull();

		const staleFocusHarness = createHarness({ contextFocusPaneId: PANE_ID });
		const staleFocus = await staleFocusHarness.delivery.deliver(
			staleFocusHarness.events({ focused: false }),
		);

		expect(staleFocus).toMatchObject({
			outcome: "not_delivered",
			reason: "invalid_context",
			attempted: false,
		});
		expect(staleFocusHarness.received).toHaveLength(0);
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

	test("keeps claim campaign text distinct from the per-write doing step", async () => {
		const harness = createHarness();
		const result = await harness.delivery.deliver(
			harness.events({
				claimDoing: "campaign: payments redesign",
				doing: "write: reroute checkout edge",
				brief: JSON.stringify({ doing: "write: reroute checkout edge" }),
			}),
		);

		expect(result).toMatchObject({ outcome: "delivered", attempted: true, reason: null });
		if (result.payload === null) {
			throw new Error("campaign-step delivery did not retain its payload");
		}
		const context = decodePayloadContext(result.payload);
		expect(context.claim.doing).toBe("campaign: payments redesign");
		expect(JSON.parse(context.semantic.brief)).toMatchObject({
			doing: "write: reroute checkout edge",
		});
	});

	test("rejects a context cursor from sequence 1 for a sequence 3 event", async () => {
		const harness = createHarness({ contextCursorSequence: 1 });

		const result = await harness.delivery.deliver(harness.events({ sequence: 3 }));

		expect(result).toMatchObject({
			outcome: "not_delivered",
			reason: "invalid_context",
			attempted: false,
		});
		expect(harness.classifyCalls()).toBe(0);
		expect(harness.received).toHaveLength(0);
	});
});
