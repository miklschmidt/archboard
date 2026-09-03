import { describe, expect, test } from "bun:test";

import type { ApprovalBinding, ApprovalResponse, SpokenEligibilityReason } from "../index.js";
import type { IdentityAuthority } from "../../../shared/codex-workbench-identity/index.js";
import type { TransportServerRequest } from "../../codex-transport/server-requests.js";
import {
	applyPatchRequest,
	commandRequest,
	closeBroker,
	elicitationRequest,
	execCommandRequest,
	expectSingleResponse,
	fileRequest,
	permissionsRequest,
	testBroker,
	userInputRequest,
} from "./support.js";

async function rejected(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
		return new Error("Expected the promise to reject.");
	} catch (error) {
		return error;
	}
}

describe("Codex approval broker", () => {
	test("normalizes and settles every human-interaction family through one response path", async () => {
		const cases: ReadonlyArray<{
			readonly name: string;
			readonly make: (identity: IdentityAuthority, label: string) => TransportServerRequest;
			readonly response: ApprovalResponse;
			readonly expected: unknown;
		}> = [
			{
				name: "command",
				make: commandRequest,
				response: { approvalKind: "command_execution", decision: "accept" },
				expected: { decision: "accept" },
			},
			{
				name: "file",
				make: fileRequest,
				response: { approvalKind: "file_change", decision: "decline" },
				expected: { decision: "decline" },
			},
			{
				name: "user input",
				make: userInputRequest,
				response: { approvalKind: "user_input", answers: { "user-0": { answers: ["yes"] } } },
				expected: { answers: { "user-0": { answers: ["yes"] } } },
			},
			{
				name: "mcp form",
				make: elicitationRequest,
				response: {
					approvalKind: "elicitation",
					action: "accept",
					content: { ok: true },
					_meta: null,
				},
				expected: { action: "accept", content: { ok: true }, _meta: null },
			},
			{
				name: "permissions",
				make: permissionsRequest,
				response: { approvalKind: "permissions", permissions: {}, scope: "turn" },
				expected: { permissions: {}, scope: "turn" },
			},
			{
				name: "legacy patch",
				make: applyPatchRequest,
				response: { approvalKind: "apply_patch", decision: "approved" },
				expected: { decision: "approved" },
			},
			{
				name: "legacy exec",
				make: execCommandRequest,
				response: { approvalKind: "exec_command", decision: "approved" },
				expected: { decision: "approved" },
			},
		];

		for (const [index, entry] of cases.entries()) {
			const fixture = testBroker();
			try {
				const request = entry.make(fixture.identity, `${entry.name}-${index}`);
				const staged = fixture.broker.stage(request);
				expect(staged.state).toBe("staged");
				const pending = fixture.broker.receive(request);
				const family = pending.family;
				expect(pending).toMatchObject({
					kind: "approval",
					state: "pending",
					family: expect.any(String),
				});
				const normalized = fixture.broker.view(pending.requestId).request;
				expect(normalized.identity).toBeDefined();
				if (entry.name === "legacy patch" || entry.name === "legacy exec") {
					expect(normalized.turnId).toBeNull();
					expect(normalized.identity.kind).toBe("legacy");
				}
				const view = fixture.broker.view(pending.requestId);
				expect(view).toMatchObject({ kind: "approval_owner", request: { family } });
				const settlement = await fixture.broker.resolve({
					requestId: pending.requestId,
					approvalId: pending.approvalId,
					response: entry.response,
				});
				expect(settlement).toMatchObject({
					state: "settled",
					outcome: "delivered",
					family,
				});
				expect(expectSingleResponse(fixture.port)).toEqual({ result: entry.expected });
			} finally {
				closeBroker(fixture.broker);
			}
		}
	});

	test("claims one terminal CAS slot for simultaneous cancellation in every family", async () => {
		const makers: ReadonlyArray<{
			readonly name: string;
			readonly make: (identity: IdentityAuthority, label: string) => TransportServerRequest;
		}> = [
			{ name: "command", make: commandRequest },
			{ name: "file", make: fileRequest },
			{ name: "user", make: userInputRequest },
			{ name: "elicitation", make: elicitationRequest },
			{ name: "permissions", make: permissionsRequest },
			{ name: "patch", make: applyPatchRequest },
			{ name: "exec", make: execCommandRequest },
		];
		for (const entry of makers) {
			const fixture = testBroker();
			try {
				const pending = fixture.broker.receive(entry.make(fixture.identity, `race-${entry.name}`));
				const first = fixture.broker.cancel(pending.requestId);
				const second = fixture.broker.cancel(pending.requestId);
				const [left, right] = await Promise.all([first, second]);
				expect(left).toEqual(right);
				expect(left.state).toBe("cancelled");
				expect(fixture.port.responses).toHaveLength(1);
			} finally {
				closeBroker(fixture.broker);
			}
		}
	});

	test("subscribes to transport human requests and child exits", async () => {
		const fixture = testBroker();
		try {
			const request = commandRequest(fixture.identity, "transport-event");
			fixture.port.emit(request);
			expect(fixture.broker.get(request.requestId)?.state).toBe("pending");
			fixture.port.emitExit(fixture.identity);
			await Promise.resolve();
			expect(fixture.broker.get(request.requestId)).toMatchObject({ state: "stale" });
			expect(fixture.port.responses).toHaveLength(1);
		} finally {
			closeBroker(fixture.broker);
		}
	});

	test("keeps a staged request separate until the explicit pending CAS", async () => {
		const fixture = testBroker();
		try {
			const request = commandRequest(fixture.identity, "staged");
			const staged = fixture.broker.stage(request);
			expect(staged.state).toBe("staged");
			expect(fixture.broker.inspect()).toHaveLength(1);
			expect(
				await rejected(
					fixture.broker.resolve({
						requestId: staged.requestId,
						approvalId: staged.approvalId,
						response: { approvalKind: "command_execution", decision: "accept" },
					}),
				),
			).toMatchObject({ code: "invalid_state" });
			expect(fixture.port.responses).toHaveLength(0);
			expect(fixture.broker.pending(staged.requestId).state).toBe("pending");
		} finally {
			closeBroker(fixture.broker);
		}
	});

	test("rejects wrong identity or response without consuming the pending approval", async () => {
		const fixture = testBroker();
		try {
			const request = commandRequest(fixture.identity, "identity");
			const pending = fixture.broker.receive(request);
			const otherApprovalId = fixture.identity.decoder.adoptApprovalId("other-approval");
			expect(
				await rejected(
					fixture.broker.resolve({
						requestId: pending.requestId,
						approvalId: otherApprovalId,
						response: { approvalKind: "command_execution", decision: "accept" },
					}),
				),
			).toMatchObject({ code: "identity_mismatch" });
			expect(
				await rejected(
					fixture.broker.resolve({
						requestId: pending.requestId,
						approvalId: pending.approvalId,
						response: { approvalKind: "file_change", decision: "decline" } as never,
					}),
				),
			).toMatchObject({ code: "invalid_response" });
			expect(fixture.broker.get(pending.requestId)?.state).toBe("pending");
			expect(fixture.port.responses).toHaveLength(0);
		} finally {
			closeBroker(fixture.broker);
		}
	});

	test("sends a safe fallback once when the captured browser effect is stale", async () => {
		const fixture = testBroker();
		try {
			const request = commandRequest(fixture.identity, "captured-effect");
			const pending = fixture.broker.receive(request);
			const settlement = await fixture.broker.resolve({
				requestId: pending.requestId,
				approvalId: pending.approvalId,
				binding: { ...pending.binding, effect: "different-effect" },
				response: { approvalKind: "command_execution", decision: "accept" },
			});
			expect(settlement).toMatchObject({ state: "stale", outcome: "delivered" });
			expect(expectSingleResponse(fixture.port)).toEqual({ result: { decision: "cancel" } });
		} finally {
			closeBroker(fixture.broker);
		}
	});

	test("revalidates a changed live link or effect immediately before responding", async () => {
		let live: ApprovalBindingInputForTest = {
			link: "link-a",
			target: "target-a",
			effect: "effect-a",
		};
		const fixture = testBroker("delivered", { getCurrentBinding: () => live });
		try {
			const request = commandRequest(fixture.identity, "live-binding");
			const pending = fixture.broker.receive(request);
			live = { ...live, link: "link-b" };
			const settlement = await fixture.broker.resolve({
				requestId: pending.requestId,
				approvalId: pending.approvalId,
				response: { approvalKind: "command_execution", decision: "accept" },
			});
			expect(settlement.state).toBe("stale");
			expect(fixture.port.responses).toHaveLength(1);
			expect(fixture.broker.get(pending.requestId)?.state).toBe("stale");
		} finally {
			closeBroker(fixture.broker);
		}
	});

	test("cancels and expires through the same terminal response constructor", async () => {
		for (const [operation, expectedState] of [
			["cancel", "cancelled"],
			["expire", "expired"],
		] as const) {
			const fixture = testBroker();
			try {
				const pending = fixture.broker.receive(commandRequest(fixture.identity, operation));
				const settlement =
					operation === "cancel"
						? await fixture.broker.cancel(pending.requestId)
						: await fixture.broker.expire(pending.requestId);
				expect(settlement).toMatchObject({ state: expectedState, outcome: "delivered" });
				expect(fixture.port.responses).toHaveLength(1);
				expect(fixture.broker.get(pending.requestId)?.state).toBe(expectedState);
			} finally {
				closeBroker(fixture.broker);
			}
		}
	});

	test("marks the matching child epoch stale and never answers twice", async () => {
		const fixture = testBroker();
		try {
			const pending = fixture.broker.receive(commandRequest(fixture.identity, "child-exit"));
			const settlements = await fixture.broker.childExit({
				child: fixture.identity.validator.childId,
				epoch: fixture.identity.validator.epoch,
			});
			expect(settlements).toHaveLength(1);
			expect(settlements[0]).toMatchObject({ state: "stale", outcome: "delivered" });
			const duplicate = await fixture.broker.cancel(pending.requestId);
			expect(duplicate).toEqual(settlements[0]!);
			expect(fixture.port.responses).toHaveLength(1);
		} finally {
			closeBroker(fixture.broker);
		}
	});

	test("keeps a lost response outcome unknown and does not retry a late write", async () => {
		const fixture = testBroker("outcome_unknown");
		try {
			const pending = fixture.broker.receive(commandRequest(fixture.identity, "late-write"));
			const first = fixture.broker.resolve({
				requestId: pending.requestId,
				approvalId: pending.approvalId,
				response: { approvalKind: "command_execution", decision: "accept" },
			});
			const second = fixture.broker.cancel(pending.requestId);
			expect(await first).toMatchObject({ state: "outcome_unknown", outcome: "outcome_unknown" });
			expect(await second).toMatchObject({ state: "outcome_unknown", outcome: "outcome_unknown" });
			expect(fixture.port.responses).toHaveLength(1);
		} finally {
			closeBroker(fixture.broker);
		}
	});

	test("splits not-delivered from unknown without another response attempt", async () => {
		const fixture = testBroker("not_delivered");
		try {
			const pending = fixture.broker.receive(commandRequest(fixture.identity, "backpressure"));
			const settlement = await fixture.broker.cancel(pending.requestId);
			expect(settlement).toMatchObject({ state: "cancelled", outcome: "not_delivered" });
			expect(fixture.port.responses).toHaveLength(1);
		} finally {
			closeBroker(fixture.broker);
		}
	});

	test("keeps dynamic and session-owned reverse requests outside the approval union", () => {
		const fixture = testBroker();
		try {
			const request = commandRequest(fixture.identity, "owner");
			const dynamic = { ...request, method: "currentTime/read", owner: "codex-session" } as never;
			expect(() => fixture.broker.stage(dynamic)).toThrowError(
				expect.objectContaining({ code: "unsupported_request" }),
			);
			expect(fixture.port.responses).toHaveLength(0);
		} finally {
			closeBroker(fixture.broker);
		}
	});
});

describe("Codex approval presentation and spoken policy", () => {
	test("derives an immutable spoken effect presentation from the command approval", async () => {
		const fixture = testBroker();
		try {
			const pending = fixture.broker.receive(commandRequest(fixture.identity, "spoken"));
			const presentation = fixture.broker.spokenEffectPresentation(pending.requestId);
			expect(presentation).toMatchObject({
				requestId: pending.requestId,
				family: "command_execution",
				effectSummary: "Run echo spoken in /workspace",
				binding: pending.binding,
			});
			expect(Object.isFrozen(presentation)).toBe(true);
			expect(fixture.broker.spokenEffectPresentation(pending.requestId)).toBe(presentation);
		} finally {
			closeBroker(fixture.broker);
		}
	});

	test("allows only a current, narrow command approval to be spoken-eligible", async () => {
		const eligible = testBroker();
		try {
			const pending = eligible.broker.receive(commandRequest(eligible.identity, "spoken"));
			expect(eligible.broker.spokenEligibility(pending.requestId)).toEqual({
				eligible: true,
				reason: "eligible",
			});
			await eligible.broker.cancel(pending.requestId);
			expect(eligible.broker.spokenEligibility(pending.requestId)).toEqual({
				eligible: false,
				reason: "not_pending",
			});
		} finally {
			closeBroker(eligible.broker);
		}

		const cases: ReadonlyArray<{
			readonly name: string;
			readonly request: (
				identity: ReturnType<typeof testBroker>["identity"],
				label: string,
			) => TransportServerRequest;
			readonly reason: SpokenEligibilityReason;
		}> = [
			{ name: "file", request: fileRequest, reason: "broader_grant" },
			{
				name: "multi-question",
				request: (identity, label) => userInputRequest(identity, label, 2),
				reason: "multi_question",
			},
			{
				name: "secret",
				request: (identity, label) => userInputRequest(identity, label, 1, true),
				reason: "secret",
			},
			{
				name: "form",
				request: (identity, label) => elicitationRequest(identity, label, "form"),
				reason: "form",
			},
			{
				name: "url",
				request: (identity, label) => elicitationRequest(identity, label, "url"),
				reason: "url",
			},
			{ name: "permissions", request: permissionsRequest, reason: "permission_scope" },
			{ name: "patch", request: applyPatchRequest, reason: "not_binary" },
			{ name: "exec", request: execCommandRequest, reason: "not_binary" },
			{
				name: "session grant",
				request: (identity, label) =>
					commandRequest(identity, label, ["accept", "acceptForSession", "decline"]),
				reason: "broader_grant",
			},
		];
		for (const entry of cases) {
			const fixture = testBroker();
			try {
				const pending = fixture.broker.receive(
					entry.request(fixture.identity, `ineligible-${entry.name}`),
				);
				expect(fixture.broker.spokenEligibility(pending.requestId)).toEqual({
					eligible: false,
					reason: entry.reason,
				});
				await fixture.broker.cancel(pending.requestId);
			} finally {
				closeBroker(fixture.broker);
			}
		}
	});

	test("reports stale ownership instead of arming a changed target", () => {
		let live: ApprovalBindingInputForTest = { target: "target-a", effect: "effect-a" };
		const fixture = testBroker("delivered", { getCurrentBinding: () => live });
		try {
			const pending = fixture.broker.receive(commandRequest(fixture.identity, "stale-spoken"));
			live = { target: "target-b", effect: "effect-b" };
			expect(fixture.broker.spokenEligibility(pending.requestId)).toEqual({
				eligible: false,
				reason: "stale_ownership",
			});
		} finally {
			closeBroker(fixture.broker);
		}
	});
});

type ApprovalBindingInputForTest = Partial<ApprovalBinding>;
