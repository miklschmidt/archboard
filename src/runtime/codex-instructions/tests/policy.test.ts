import { describe, expect, test } from "bun:test";

import {
	ADDITIONAL_CONTEXT_POLICY,
	ArchboardContextSchema,
	encodeCanonicalContext,
} from "../index.js";
import { contextFixture, reviewedAdditionalContextPolicy } from "./fixtures.js";

function expectDeepFrozen(value: unknown): void {
	if (typeof value !== "object" || value === null) {
		return;
	}
	expect(Object.isFrozen(value)).toBe(true);
	for (const child of Object.values(value as Record<string, unknown>)) {
		expectDeepFrozen(child);
	}
}

function expectReviewedPolicy(value: unknown): void {
	expect(JSON.stringify(value)).toBe(JSON.stringify(reviewedAdditionalContextPolicy));
}

describe("additional-context policy contract", () => {
	test("matches the reviewed e9fd214 manifest byte-for-byte", () => {
		expectReviewedPolicy(ADDITIONAL_CONTEXT_POLICY);
		expect(Object.keys(ADDITIONAL_CONTEXT_POLICY)).toEqual(["schema", "threadLink", "operation"]);
		expect(Object.keys(ADDITIONAL_CONTEXT_POLICY.threadLink)).toEqual([
			"classificationTarget",
			"exhaustBeforePrecedence",
			"classificationFailures",
			"reasonNullStates",
			"reasonRequiredStates",
			"nonExecutableStatuses",
			"reasonPrecedence",
			"inferThreadFromRecency",
		]);
		expect(Object.keys(ADDITIONAL_CONTEXT_POLICY.operation)).toEqual([
			"fieldOrder",
			"producers",
			"tupleStates",
			"outcomeTransitions",
			"turnEvidence",
			"terminal",
			"retryAfterOutcomeUnknown",
			"threadStartOutcomeUnknown",
			"excludedBoundaries",
			"callbackEvents",
			"forbiddenFields",
		]);
	});

	test("freezes every policy row and nested value", () => {
		expectDeepFrozen(ADDITIONAL_CONTEXT_POLICY);
	});

	test("keeps lifecycle, evidence, retry, and recency rules closed", () => {
		const { operation, threadLink } = ADDITIONAL_CONTEXT_POLICY;
		expect(operation.fieldOrder).toEqual(["id", "kind", "rpc", "outcome"]);
		expect(operation.turnEvidence[0]).toEqual({
			event: "turn/started",
			rpcs: ["turn/start"],
			outcome: "delivered",
			tupleAction: "retain",
		});
		expect(operation.turnEvidence[1]).toEqual({
			event: "turn/steer_response",
			rpcs: ["turn/steer"],
			outcome: "delivered",
			tupleAction: "retain_existing_turn_id",
		});
		for (const evidence of operation.turnEvidence.slice(2)) {
			if (!("status" in evidence)) {
				throw new Error("terminal evidence must have a status");
			}
			expect(evidence.event).toBe("turn/completed");
			expect(evidence.status).toMatch(/^(completed|interrupted|failed)$/);
			expect(evidence.rpcs).toEqual(["turn/start", "turn/steer"]);
			expect(evidence.tupleAction).toBe("emit_terminal_then_clear");
		}
		expect(operation.terminal).toEqual({
			emit: "once",
			clear: "after_terminal_callback_or_event",
			clearFields: ["id", "kind", "rpc", "outcome"],
		});
		expect(operation.retryAfterOutcomeUnknown).toBe(false);
		expect(operation.threadStartOutcomeUnknown).toEqual({
			linkState: "inspect_only",
			reason: "thread_start_outcome_unknown",
			inferFromRecency: false,
		});
		expect(threadLink.inferThreadFromRecency).toBe(false);
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

	test("rejects every reviewed policy mutation in the test oracle", () => {
		const mutations = [
			(policy: Record<string, unknown>) => delete policy["schema"],
			(policy: Record<string, unknown>) => (policy["unreviewed"] = true),
			(policy: Record<string, unknown>) => {
				const entries = Object.entries(policy);
				[entries[0], entries[1]] = [entries[1]!, entries[0]!];
				for (const field of Object.keys(policy)) {
					delete policy[field];
				}
				for (const [field, value] of entries) {
					policy[field] = value;
				}
			},
			(policy: Record<string, unknown>) => {
				const threadLink = policy["threadLink"] as Record<string, unknown>;
				threadLink["inferThreadFromRecency"] = true;
			},
			(policy: Record<string, unknown>) => {
				const operation = policy["operation"] as Record<string, unknown>;
				operation["retryAfterOutcomeUnknown"] = true;
			},
			(policy: Record<string, unknown>) => {
				const operation = policy["operation"] as Record<string, unknown>;
				(operation["turnEvidence"] as Record<string, unknown>[])[0]!["rpcs"] = [
					"turn/start",
					"turn/steer",
				];
			},
		] as const;
		for (const mutate of mutations) {
			const candidate = structuredClone(ADDITIONAL_CONTEXT_POLICY) as Record<string, unknown>;
			mutate(candidate);
			expect(() => expectReviewedPolicy(candidate)).toThrow();
		}
	});
});
