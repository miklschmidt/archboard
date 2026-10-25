import { expect, test } from "bun:test";
import { projectServerVoiceContext } from "#server/projections/browser-state/voice-context.ts";
import {
	BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES,
	BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES,
} from "#shared/schemas/browser/vocabulary.ts";
import type { CoordinatorCallbackDelivery } from "#runtime/protocol/coordinator-callbacks/contract.ts";
import type { CodexRealtimeGeneration } from "#runtime/services/realtime/contract.ts";

// A host's words reach the page as they were told. Words longer than the wire holds, or holding a
// NUL the wire refuses, must not stop the page from being shown its state.
test("the page is shown a host's words and start context within the wire's limits and without NUL", () => {
	const generation = {
		child: "child",
		epoch: "epoch",
		coordinatorThreadId: "coordinator",
		wireSessionId: "wire",
		browserSessionId: "browser",
		browserCorrelationId: "correlation",
		startBrief: "b".repeat(BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES + 1),
	} as unknown as CodexRealtimeGeneration;
	const delivery = {
		kind: "coordinator_callback_delivery",
		callback: {
			kind: "context",
			audience: "voice",
			context: { topic: null },
			correlation: {
				realtimeGeneration: {
					childId: "child",
					epoch: "epoch",
					coordinatorThreadId: "coordinator",
					wireSessionId: "wire",
					browserSessionId: "browser",
					browserCorrelationId: "correlation",
				},
			},
		},
		sourceOrder: 0,
		freshness: { capturedAtMs: 1, freshUntilMs: 2 },
		path: "realtime_appendText",
		reason: null,
		text: `a\0${"é".repeat(BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES)}`,
		realtimeRequest: null,
		attempted: true,
		attemptedAtMs: 1,
		outcome: "delivered",
	} as unknown as CoordinatorCallbackDelivery;

	const context = projectServerVoiceContext(generation, {
		inspectHistory: () => ({ deliveries: [delivery], omittedPrefixCount: 0 }),
	});
	const [entry] = context?.entries ?? [];

	expect(entry?.body.startsWith("a�é")).toBe(true);
	expect(new TextEncoder().encode(entry?.body).byteLength).toBeLessThanOrEqual(
		BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES,
	);
	expect(entry).toMatchObject({ kind: "voice", topic: null });
	expect(context?.canonicalBrief).toHaveLength(BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES);
});
