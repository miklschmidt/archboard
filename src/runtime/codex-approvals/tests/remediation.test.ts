import { describe, expect, test } from "bun:test";

import { classifyResponseFailure } from "../index.js";
import type { ApprovalBinding, BrowserApprovalResponse } from "../index.js";
import {
	closeBroker,
	commandRequestWithAvailableDecisions,
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

	test("classifies zero-write local failures as not delivered", () => {
		expect(classifyResponseFailure(new Error("local validation failed"), false)).toBe(
			"not_delivered",
		);
		expect(classifyResponseFailure({ accepted: true, reason: "write-error" }, false)).toBe(
			"not_delivered",
		);
		expect(classifyResponseFailure({ accepted: false, reason: "backpressure" }, true)).toBe(
			"not_delivered",
		);
		expect(classifyResponseFailure({ accepted: true, reason: "write-error" }, true)).toBe(
			"outcome_unknown",
		);
	});
});
