import { describe, expect, test } from "bun:test";

import {
	outcomeUnknownEnvelope,
	toolResponseFor,
} from "#runtime/voice/coordinator/tools-and-work/tool-contract/protocol/dynamic-tool-envelopes.ts";

describe("dynamic wire envelopes", () => {
	test("wraps one canonical envelope as one inputText item", () => {
		const envelope = { tag: "ok", operationId: "op-1", value: { threadId: "thread-1" } } as const;
		const response = toolResponseFor(envelope, true);
		expect(response).toEqual({
			contentItems: [{ type: "inputText", text: JSON.stringify(envelope) }],
			success: true,
		});
		expect(Object.isFrozen(response)).toBe(true);
		expect(Object.isFrozen(response.contentItems[0])).toBe(true);

		const refused = {
			tag: "refused",
			reason: "not_ready",
			message: "Inspect the linked workhorse first.",
		} as const;
		expect(toolResponseFor(refused, true).contentItems[0].text).toBe(JSON.stringify(refused));
		expect(toolResponseFor(outcomeUnknownEnvelope("op-2"), true).contentItems[0].text).toBe(
			JSON.stringify({
				tag: "outcome_unknown",
				operationId: "op-2",
				message:
					"The request may have taken effect. Inspect authoritative state before another mutation.",
			}),
		);
	});

	test("refuses an envelope that is not canonical", () => {
		expect(() =>
			toolResponseFor(
				{ tag: "outcome_unknown", operationId: "op-2", message: "lost" } as never,
				true,
			),
		).toThrow();
		expect(() => toolResponseFor({ tag: "ok", operationId: "", value: {} }, true)).toThrow();
		expect(() =>
			toolResponseFor({ tag: "ok", operationId: "op-1", value: {}, extra: true } as never, true),
		).toThrow();
	});

	test("a call rejected before a tool call was established returns only a refusal", () => {
		const refused = {
			tag: "refused",
			reason: "invalid_call",
			message: "The call was not understood.",
		} as const;
		expect(toolResponseFor(refused, false)).toMatchObject({ success: false });
		expect(() => toolResponseFor({ tag: "ok", operationId: "op-1", value: {} }, false)).toThrow();
	});
});
