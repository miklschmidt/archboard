import { describe, expect, test } from "bun:test";

import {
	ADDITIONAL_CONTEXT_POLICY,
	ArchboardContextSchema,
	encodeCanonicalContext,
} from "../index.js";
import { contextFixture } from "./fixtures.js";

function expectDeepFrozen(value: unknown): void {
	if (typeof value !== "object" || value === null) {
		return;
	}
	expect(Object.isFrozen(value)).toBe(true);
	for (const child of Object.values(value as Record<string, unknown>)) {
		expectDeepFrozen(child);
	}
}

describe("additional-context policy contract", () => {
	test("freezes every policy row and nested value", () => {
		expectDeepFrozen(ADDITIONAL_CONTEXT_POLICY);
	});

	test("enforces each producer's reviewed RPC set", () => {
		for (const producer of ADDITIONAL_CONTEXT_POLICY.operation.producers) {
			for (const rpc of producer.rpcs) {
				expect(
					ArchboardContextSchema.safeParse({
						...contextFixture,
						operation: {
							id: "operation-1",
							kind: producer.kind,
							rpc,
							outcome: "delivered",
						},
					}).success,
				).toBe(true);
			}
			for (const rpc of ["turn/start", "turn/steer"] as const) {
				if ((producer.rpcs as readonly string[]).includes(rpc)) {
					continue;
				}
				expect(
					ArchboardContextSchema.safeParse({
						...contextFixture,
						operation: {
							id: "operation-1",
							kind: producer.kind,
							rpc,
							outcome: "delivered",
						},
					}).success,
				).toBe(false);
			}
		}
	});

	test("emits every operation tuple in the reviewed field order", () => {
		const operations = [
			{ id: null, kind: null, rpc: null, outcome: null },
			{ id: "operation-1", kind: "composer_message", rpc: "turn/start", outcome: null },
			{
				id: "operation-1",
				kind: "steer_workhorse",
				rpc: "turn/steer",
				outcome: "delivered",
			},
			{ id: "operation-1", kind: "composer_message", rpc: "turn/start", outcome: "not_delivered" },
			{
				id: "operation-1",
				kind: "composer_message",
				rpc: "turn/start",
				outcome: "outcome_unknown",
			},
		] as const;
		for (const operation of operations) {
			const encoded = encodeCanonicalContext({ ...contextFixture, operation });
			expect(Object.keys(JSON.parse(encoded).operation)).toEqual(["id", "kind", "rpc", "outcome"]);
		}
	});
});
