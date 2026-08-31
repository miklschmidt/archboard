import { describe, expect, test } from "bun:test";

import type { ApprovalBinding, BrowserApprovalResponse } from "../index.js";
import {
	closeBroker,
	commandRequestWithAvailableDecisions,
	commandRequestWithoutCommand,
	commandRequestWithoutAvailableDecisions,
	expectSingleResponse,
	testBroker,
} from "./support.js";

async function rejected(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
		return new Error("Expected the promise to reject.");
	} catch (error) {
		return error;
	}
}

const execpolicyResponse: BrowserApprovalResponse = {
	approvalKind: "command_execution",
	decision: {
		acceptWithExecpolicyAmendment: { execpolicy_amendment: ["allow /workspace"] },
	},
};

const networkResponse: BrowserApprovalResponse = {
	approvalKind: "command_execution",
	decision: {
		applyNetworkPolicyAmendment: {
			network_policy_amendment: { host: "example.test", action: "allow" },
		},
	},
};

describe("Codex approval remediation", () => {
	test.each(["null", "omitted"] as const)("keeps %s command approvals visual-only", (shape) => {
		const fixture = testBroker();
		try {
			const pending = fixture.broker.receive(
				commandRequestWithoutCommand(fixture.identity, `spoken-${shape}`, shape),
			);
			expect(fixture.broker.spokenEligibility(pending.requestId)).toEqual({
				eligible: false,
				reason: "unsupported_schema",
			});
		} finally {
			closeBroker(fixture.broker);
		}
	});

	test("treats an explicit null link as revocation in captured evidence", async () => {
		const live: Partial<ApprovalBinding> = {
			link: "link-a",
			target: "target-a",
			effect: "effect-a",
		};
		const fixture = testBroker("delivered", { getCurrentBinding: () => live });
		try {
			const pending = fixture.broker.receive(
				commandRequestWithAvailableDecisions(fixture.identity, "captured-null-link", [
					"accept",
					"decline",
				]),
			);
			const settlement = await fixture.broker.resolve({
				requestId: pending.requestId,
				approvalId: pending.approvalId,
				binding: { link: null },
				response: { approvalKind: "command_execution", decision: "accept" },
			});
			expect(settlement).toMatchObject({ state: "stale", outcome: "delivered" });
			expect(expectSingleResponse(fixture.port)).toEqual({ result: { decision: "cancel" } });
		} finally {
			closeBroker(fixture.broker);
		}
	});

	test("treats an immediately live null link as revocation", async () => {
		let live: Partial<ApprovalBinding> = {
			link: "link-a",
			target: "target-a",
			effect: "effect-a",
		};
		const fixture = testBroker("delivered", { getCurrentBinding: () => live });
		try {
			const pending = fixture.broker.receive(
				commandRequestWithAvailableDecisions(fixture.identity, "live-null-link", [
					"accept",
					"decline",
				]),
			);
			live = { ...live, link: null };
			const settlement = await fixture.broker.resolve({
				requestId: pending.requestId,
				approvalId: pending.approvalId,
				response: { approvalKind: "command_execution", decision: "accept" },
			});
			expect(settlement).toMatchObject({ state: "stale", outcome: "delivered" });
			expect(expectSingleResponse(fixture.port)).toEqual({ result: { decision: "cancel" } });
		} finally {
			closeBroker(fixture.broker);
		}
	});

	test("uses one effective decision set for presentation and person settlement", async () => {
		const cases: ReadonlyArray<{
			readonly name: string;
			readonly offered: readonly unknown[] | null | undefined;
			readonly expected: readonly unknown[];
		}> = [
			{
				name: "omitted",
				offered: undefined,
				expected: ["accept", "decline", "cancel"],
			},
			{
				name: "null",
				offered: null,
				expected: ["accept", "decline", "cancel"],
			},
			{ name: "empty", offered: [], expected: [] },
			{ name: "accept only", offered: ["accept"], expected: ["accept"] },
		];
		for (const entry of cases) {
			const fixture = testBroker();
			try {
				const request =
					entry.offered === undefined
						? commandRequestWithoutAvailableDecisions(fixture.identity, `effective-${entry.name}`)
						: commandRequestWithAvailableDecisions(
								fixture.identity,
								`effective-${entry.name}`,
								entry.offered,
							);
				const pending = fixture.broker.receive(request);
				const card = fixture.broker.toBrowserApproval(pending.requestId);
				expect(card).toMatchObject({ availableDecisions: entry.expected });
				if (entry.name === "empty" || entry.name === "accept only") {
					if (entry.name === "accept only") {
						const settlement = await fixture.broker.resolve({
							requestId: pending.requestId,
							approvalId: pending.approvalId,
							response: { approvalKind: "command_execution", decision: "accept" },
						});
						expect(settlement.outcome).toBe("delivered");
						expect(expectSingleResponse(fixture.port)).toEqual({ result: { decision: "accept" } });
					} else {
						expect(
							await rejected(
								fixture.broker.resolve({
									requestId: pending.requestId,
									approvalId: pending.approvalId,
									response: { approvalKind: "command_execution", decision: "accept" },
								}),
							),
						).toMatchObject({ code: "invalid_response" });
						await fixture.broker.cancel(pending.requestId);
						expect(expectSingleResponse(fixture.port)).toEqual({ result: { decision: "cancel" } });
					}
				} else {
					const settlement = await fixture.broker.resolve({
						requestId: pending.requestId,
						approvalId: pending.approvalId,
						response: { approvalKind: "command_execution", decision: "accept" },
					});
					expect(settlement.outcome).toBe("delivered");
					expect(expectSingleResponse(fixture.port)).toEqual({ result: { decision: "accept" } });
				}
			} finally {
				closeBroker(fixture.broker);
			}
		}
	});

	test("rejects amendments unless the exact amendment is explicitly offered", async () => {
		const cases = [
			{ name: "execpolicy", response: execpolicyResponse },
			{ name: "network", response: networkResponse },
		] as const;
		const offerings: ReadonlyArray<readonly unknown[] | null | undefined> = [
			undefined,
			null,
			[],
			["accept"],
		];
		for (const amendment of cases) {
			for (const offered of offerings) {
				const fixture = testBroker();
				try {
					const label = `amendment-${amendment.name}-${offered === undefined ? "omitted" : "offered"}`;
					const pending = fixture.broker.receive(
						commandRequestWithAvailableDecisions(fixture.identity, label, offered),
					);
					expect(
						await rejected(
							fixture.broker.resolve({
								requestId: pending.requestId,
								approvalId: pending.approvalId,
								response: amendment.response,
							}),
						),
					).toMatchObject({ code: "invalid_response" });
					expect(fixture.broker.get(pending.requestId)?.state).toBe("pending");
					await fixture.broker.cancel(pending.requestId);
					expect(expectSingleResponse(fixture.port)).toEqual({ result: { decision: "cancel" } });
				} finally {
					closeBroker(fixture.broker);
				}
			}
			const fixture = testBroker();
			try {
				const label = `amendment-${amendment.name}-explicit`;
				const pending = fixture.broker.receive(
					commandRequestWithAvailableDecisions(fixture.identity, label, [
						amendment.response.decision,
					]),
				);
				const settlement = await fixture.broker.resolve({
					requestId: pending.requestId,
					approvalId: pending.approvalId,
					response: amendment.response,
				});
				expect(settlement).toMatchObject({ state: "settled", outcome: "delivered" });
				expect(expectSingleResponse(fixture.port)).toEqual({
					result: { decision: amendment.response.decision },
				});
			} finally {
				closeBroker(fixture.broker);
			}
		}
	});

	test("uses protocol-valid forced cancellation for empty and accept-only offerings", async () => {
		for (const operation of ["cancel", "expire"] as const) {
			for (const offered of [[], ["accept"]] as const) {
				const fixture = testBroker();
				try {
					const pending = fixture.broker.receive(
						commandRequestWithAvailableDecisions(
							fixture.identity,
							`forced-${operation}-${offered.length === 0 ? "empty" : "accept-only"}`,
							offered,
						),
					);
					const settlement =
						operation === "cancel"
							? await fixture.broker.cancel(pending.requestId)
							: await fixture.broker.expire(pending.requestId);
					expect(settlement).toMatchObject({
						state: operation === "cancel" ? "cancelled" : "expired",
						outcome: "delivered",
					});
					expect(expectSingleResponse(fixture.port)).toEqual({ result: { decision: "cancel" } });
				} finally {
					closeBroker(fixture.broker);
				}
			}
		}
	});

	test("classifies real pre-enqueue transport errors without retrying", async () => {
		for (const mode of ["ownership_error", "usage_error", "generic_error"] as const) {
			const fixture = testBroker(mode);
			try {
				const pending = fixture.broker.receive(
					commandRequestWithAvailableDecisions(fixture.identity, mode, ["accept"]),
				);
				const response = { approvalKind: "command_execution", decision: "accept" } as const;
				const first = fixture.broker.resolve({
					requestId: pending.requestId,
					approvalId: pending.approvalId,
					response,
				});
				const duplicateResolve = fixture.broker.resolve({
					requestId: pending.requestId,
					approvalId: pending.approvalId,
					response,
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
				const settlement = await first;
				expect(await childExit).toEqual([settlement]);
				expect(settlement).toMatchObject({
					outcome: mode === "generic_error" ? "outcome_unknown" : "not_delivered",
					state: mode === "generic_error" ? "outcome_unknown" : "settled",
				});
				expect(fixture.port.responses).toHaveLength(1);
			} finally {
				closeBroker(fixture.broker);
			}
		}
	});
});
