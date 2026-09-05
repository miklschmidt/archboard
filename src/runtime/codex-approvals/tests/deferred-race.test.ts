import { describe, expect, test } from "bun:test";

import { approvalFamilyCases } from "./family-fixtures.js";
import { closeBroker, testBroker } from "./support.js";

describe("Codex approval in-flight settlement races", () => {
	test("shares one pending settlement across competing operations for every family", async () => {
		for (const outcome of ["delivered", "not_delivered", "outcome_unknown"] as const) {
			for (const family of approvalFamilyCases) {
				const fixture = testBroker("deferred");
				try {
					const label = `deferred-${outcome}-${family.name}`;
					const pending = fixture.broker.receive(family.make(fixture.identity, label));
					const first = fixture.broker.resolve({
						requestId: pending.requestId,
						approvalId: pending.approvalId,
						response: family.responses[0]!.response(label),
					});
					expect(fixture.port.responses).toHaveLength(1);

					const duplicateResolve = fixture.broker.resolve({
						requestId: pending.requestId,
						approvalId: pending.approvalId,
						response: family.responses[0]!.response(label),
					});
					const cancel = fixture.broker.cancel(pending.requestId);
					const expire = fixture.broker.expire(pending.requestId);
					const stale = fixture.broker.markStale(pending.requestId);
					const childExit = fixture.broker.childExit({
						child: fixture.identity.validator.childId,
						epoch: fixture.identity.validator.epoch,
					});

					expect(duplicateResolve).toBe(first);
					expect(cancel).toBe(first);
					expect(expire).toBe(first);
					expect(stale).toBe(first);
					if (outcome === "delivered") {
						fixture.port.resolveDeferred();
					} else {
						fixture.port.rejectDeferred(outcome);
					}

					const settlement = await first;
					expect(await duplicateResolve).toBe(settlement);
					expect(await cancel).toBe(settlement);
					expect(await expire).toBe(settlement);
					expect(await stale).toBe(settlement);
					expect(await childExit).toEqual([settlement]);
					expect(settlement).toMatchObject({
						family: family.family,
						state: outcome === "outcome_unknown" ? "outcome_unknown" : "settled",
						outcome,
					});
					expect(fixture.port.responses).toHaveLength(1);
					expect(fixture.port.responses[0]!.response).toEqual(family.responses[0]!.expected(label));
				} finally {
					closeBroker(fixture.broker);
				}
			}
		}
	});
});
