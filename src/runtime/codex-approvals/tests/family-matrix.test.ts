import { describe, expect, test } from "bun:test";

import { approvalFamilyCases } from "./family-fixtures.js";
import { closeBroker, expectSingleResponse, testBroker } from "./support.js";

describe("Codex approval family matrix", () => {
	test("accepts every family-specific response with exact wire shapes", async () => {
		for (const family of approvalFamilyCases) {
			for (const responseCase of family.responses) {
				const fixture = testBroker();
				try {
					const label = `positive-${family.name}-${responseCase.name}`;
					const pending = fixture.broker.receive(family.make(fixture.identity, label));
					const settlement = await fixture.broker.resolve({
						requestId: pending.requestId,
						approvalId: pending.approvalId,
						response: responseCase.response(label),
					});
					expect(settlement).toMatchObject({
						family: family.family,
						state: "settled",
						outcome: "delivered",
					});
					expect(expectSingleResponse(fixture.port)).toEqual(responseCase.expected(label));
				} finally {
					closeBroker(fixture.broker);
				}
			}
		}
	});

	test("cancellation and expiry settle every family with an exact terminal fallback", async () => {
		for (const operation of ["cancel", "expire"] as const) {
			for (const family of approvalFamilyCases) {
				const fixture = testBroker();
				try {
					const label = `${operation}-${family.name}`;
					const pending = fixture.broker.receive(family.make(fixture.identity, label));
					const settlement =
						operation === "cancel"
							? await fixture.broker.cancel(pending.requestId)
							: await fixture.broker.expire(pending.requestId);
					expect(settlement).toMatchObject({
						family: family.family,
						state: operation === "cancel" ? "cancelled" : "expired",
						outcome: "delivered",
					});
					expect(expectSingleResponse(fixture.port)).toEqual(
						family.fallback(operation === "cancel" ? "cancelled" : "expired"),
					);
				} finally {
					closeBroker(fixture.broker);
				}
			}
		}
	});

	test("downgrades every family when captured effect evidence is stale", async () => {
		for (const family of approvalFamilyCases) {
			const fixture = testBroker();
			try {
				const label = `stale-${family.name}`;
				const pending = fixture.broker.receive(family.make(fixture.identity, label));
				const settlement = await fixture.broker.resolve({
					requestId: pending.requestId,
					approvalId: pending.approvalId,
					binding: { effect: `changed-${label}` },
					response: family.responses[0]!.response(label),
				});
				expect(settlement).toMatchObject({
					family: family.family,
					state: "stale",
					outcome: "delivered",
				});
				expect(expectSingleResponse(fixture.port)).toEqual(family.fallback("stale"));
			} finally {
				closeBroker(fixture.broker);
			}
		}
	});

	test("marks every family stale on the matching child exit and answers once", async () => {
		for (const family of approvalFamilyCases) {
			const fixture = testBroker();
			try {
				const label = `exit-${family.name}`;
				const pending = fixture.broker.receive(family.make(fixture.identity, label));
				const settlements = await fixture.broker.childExit({
					child: fixture.identity.validator.childId,
					epoch: fixture.identity.validator.epoch,
				});
				expect(settlements).toHaveLength(1);
				expect(settlements[0]).toMatchObject({
					family: family.family,
					state: "stale",
					outcome: "delivered",
				});
				expect(await fixture.broker.cancel(pending.requestId)).toEqual(settlements[0]!);
				expect(expectSingleResponse(fixture.port)).toEqual(family.fallback("stale"));
			} finally {
				closeBroker(fixture.broker);
			}
		}
	});

	test("classifies one late write per family without retrying it", async () => {
		for (const mode of ["not_delivered", "outcome_unknown"] as const) {
			for (const family of approvalFamilyCases) {
				const fixture = testBroker(mode);
				try {
					const label = `late-${mode}-${family.name}`;
					const pending = fixture.broker.receive(family.make(fixture.identity, label));
					const first = fixture.broker.resolve({
						requestId: pending.requestId,
						approvalId: pending.approvalId,
						response: family.responses[0]!.response(label),
					});
					const duplicate = fixture.broker.cancel(pending.requestId);
					expect(duplicate).toBe(first);
					expect(await first).toMatchObject({
						family: family.family,
						state: mode === "outcome_unknown" ? "outcome_unknown" : "settled",
						outcome: mode,
					});
					expect(fixture.port.responses).toHaveLength(1);
				} finally {
					closeBroker(fixture.broker);
				}
			}
		}
	});
});
