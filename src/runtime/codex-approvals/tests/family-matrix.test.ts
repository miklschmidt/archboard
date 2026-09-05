import { describe, expect, test } from "bun:test";

import { approvalFamilyCases } from "./family-fixtures.js";
import { closeBroker, expectSingleResponse, testBroker } from "./support.js";

describe("Codex approval family matrix", () => {
	test("accepts every family-specific response with exact wire shapes", async () => {
		await Promise.all(
			approvalFamilyCases.flatMap((family) =>
				family.responses.map(async (responseCase) => {
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
				}),
			),
		);
	});

	test("cancellation and expiry settle every family with an exact terminal fallback", async () => {
		await Promise.all(
			(["cancel", "expire"] as const).flatMap((operation) =>
				approvalFamilyCases.map(async (family) => {
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
				}),
			),
		);
	});

	test("downgrades every family when captured effect evidence is stale", async () => {
		await Promise.all(approvalFamilyCases.map(async (family) => {
			const fixture = testBroker();
			try {
				const label = `stale-${family.name}`;
				const pending = fixture.broker.receive(family.make(fixture.identity, label));
				const [responseCase] = family.responses;
				if (responseCase === undefined) {
					throw new Error(`Approval family ${family.name} has no positive response fixture`);
				}
				const settlement = await fixture.broker.resolve({
					requestId: pending.requestId,
					approvalId: pending.approvalId,
					binding: { effect: `changed-${label}` },
					response: responseCase.response(label),
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
		}));
	});

	test("marks every family stale on the matching child exit and answers once", async () => {
		await Promise.all(approvalFamilyCases.map(async (family) => {
			const fixture = testBroker();
			try {
				const label = `exit-${family.name}`;
				const pending = fixture.broker.receive(family.make(fixture.identity, label));
				const settlements = await fixture.broker.childExit({
					child: fixture.identity.validator.childId,
					epoch: fixture.identity.validator.epoch,
				});
				expect(settlements).toHaveLength(1);
				const [settlement] = settlements;
				if (settlement === undefined) {
					throw new Error("Expected one child-exit settlement");
				}
				expect(settlement).toMatchObject({
					family: family.family,
					state: "stale",
					outcome: "delivered",
				});
				expect(await fixture.broker.cancel(pending.requestId)).toEqual(settlement);
				expect(expectSingleResponse(fixture.port)).toEqual(family.fallback("stale"));
			} finally {
				closeBroker(fixture.broker);
			}
		}));
	});

	test("classifies one late write per family without retrying it", async () => {
		await Promise.all(
			(["not_delivered", "outcome_unknown"] as const).flatMap((mode) =>
				approvalFamilyCases.map(async (family) => {
				const fixture = testBroker(mode);
				try {
					const label = `late-${mode}-${family.name}`;
					const pending = fixture.broker.receive(family.make(fixture.identity, label));
					const [responseCase] = family.responses;
					if (responseCase === undefined) {
						throw new Error(`Approval family ${family.name} has no positive response fixture`);
					}
					const first = fixture.broker.resolve({
						requestId: pending.requestId,
						approvalId: pending.approvalId,
						response: responseCase.response(label),
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
				}),
			),
		);
	});
});
