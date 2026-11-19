import { describe, expect, test } from "bun:test";

import { createDynamicFixture } from "#tests/shared/support/dynamic-approval.ts";

describe("dynamic coordination approval browser contract", () => {
	test("round-trips the three immutable dynamic effects and their safe projection", () => {
		const fixture = createDynamicFixture();
		for (const request of fixture.requests) {
			const parsedRequest = fixture.model.DynamicApprovalRequestSchema.parse(
				JSON.parse(JSON.stringify(request)),
			);
			expect(parsedRequest).toEqual(request);
			expect(fixture.model.DynamicApprovalIdentitySchema.parse(request.identity)).toEqual(
				request.identity,
			);
		}
		expect(fixture.requests.map(({ identity }) => identity.tool)).toEqual([
			"create_thread",
			"fork_thread",
			"send_message_to_thread",
		]);
		expect(fixture.pending).toEqual(
			fixture.model.BrowserDynamicApprovalSchema.parse(JSON.parse(JSON.stringify(fixture.pending))),
		);
		expect(fixture.response).toEqual(
			fixture.model.BrowserDynamicApprovalResponseSchema.parse(
				JSON.parse(JSON.stringify(fixture.response)),
			),
		);
	});

	test("keeps server authority and login secrets out of browser DTOs", () => {
		const fixture = createDynamicFixture();
		const request = fixture.requests[0]!;
		const browserApproval = fixture.pending;
		expect(JSON.stringify(browserApproval)).not.toContain("caller-authority");
		expect(JSON.stringify(browserApproval)).not.toContain("context-authority");
		for (const field of [
			"callerAuthority",
			"targetAuthority",
			"contextAuthority",
			"apiKey",
			"secretAccessKey",
		]) {
			expect(
				fixture.model.BrowserDynamicApprovalSchema.safeParse({
					...browserApproval,
					effect: { ...browserApproval.effect, [field]: "secret" },
				}).success,
			).toBeFalse();
		}
		expect(fixture.model.BrowserDtoSchema.safeParse(request as unknown).success).toBeFalse();
		expect(
			fixture.model.BrowserDynamicApprovalSchema.safeParse({
				...browserApproval,
				approvalKind: "command_execution",
			}).success,
		).toBeFalse();
	});

	test("represents every reviewed pending, terminal, and delivery state", () => {
		const fixture = createDynamicFixture();
		const request = fixture.requests[0]!;
		const approved = fixture.decisionFor(request, "approved", "person_approved");
		const declined = fixture.decisionFor(request, "declined", "person_declined");
		const expired = fixture.decisionFor(request, "expired", "deadline_reached");
		const cancelled = fixture.decisionFor(request, "cancelled", "server_shutdown");
		const browserDisconnected = fixture.decisionFor(
			request,
			"disconnected",
			"browser_disconnected",
		);
		const childDisconnected = fixture.decisionFor(request, "disconnected", "child_disconnected");
		const cases = [
			fixture.approvalFor(request, "pending", null, null, null),
			fixture.approvalFor(request, "approved", approved, null, null),
			fixture.approvalFor(request, "declined", declined, null, "refused:approval_declined"),
			fixture.approvalFor(request, "expired", expired, null, "refused:expired"),
			fixture.approvalFor(request, "cancelled", cancelled, null, "approval_required"),
			fixture.approvalFor(request, "disconnected", browserDisconnected, null, "approval_required"),
			fixture.approvalFor(
				request,
				"disconnected",
				childDisconnected,
				"not_delivered",
				"transport_not_delivered",
			),
			fixture.approvalFor(request, "stale", approved, null, "refused:invalid_call"),
			fixture.approvalFor(request, "delivered", approved, "delivered", null),
			fixture.approvalFor(
				request,
				"not_delivered",
				approved,
				"not_delivered",
				"transport_not_delivered",
			),
			fixture.approvalFor(request, "outcome_unknown", approved, "outcome_unknown", null),
		];
		expect(cases.map(({ state }) => state)).toEqual([
			"pending",
			"approved",
			"declined",
			"expired",
			"cancelled",
			"disconnected",
			"disconnected",
			"stale",
			"delivered",
			"not_delivered",
			"outcome_unknown",
		]);
		for (const approval of cases) {
			expect(
				fixture.model.BrowserDynamicApprovalSchema.parse(JSON.parse(JSON.stringify(approval))),
			).toEqual(approval);
		}
	});

	test("makes approval_required terminal and never resumable", () => {
		const fixture = createDynamicFixture();
		const request = fixture.requests[0]!;
		const cancelled = fixture.approvalFor(
			request,
			"cancelled",
			fixture.decisionFor(request, "cancelled", "call_cancelled"),
			null,
			"approval_required",
		);
		expect(cancelled.binding).toBeNull();
		expect(cancelled.resumable).toBeFalse();
		for (const mutation of [
			{ resumable: true },
			{ resumeCommand: "resume_dynamic_call" },
			{ binding: fixture.pending.binding },
		]) {
			expect(
				fixture.model.BrowserDynamicApprovalSchema.safeParse({
					...cancelled,
					...mutation,
				}).success,
			).toBeFalse();
		}
	});

	test("rejects hash, identity, effect, expiry, state, and seven-family lookalike drift", () => {
		const fixture = createDynamicFixture();
		const request = fixture.requests[0]!;
		const wrongHash = { ...request, effectHash: `sha256:${"f".repeat(64)}` };
		expect(fixture.model.DynamicApprovalRequestSchema.safeParse(wrongHash).success).toBeFalse();
		// Expiry is a bounded window after creation, not the constant exactly:
		// inside it parses, at or before creation and past it do not.
		expect(
			fixture.model.DynamicApprovalRequestSchema.safeParse({
				...request,
				expiresAtMs: request.expiresAtMs + 1,
			}).success,
		).toBeFalse();
		expect(
			fixture.model.DynamicApprovalRequestSchema.safeParse({
				...request,
				expiresAtMs: request.createdAtMs,
			}).success,
		).toBeFalse();
		expect(
			fixture.model.DynamicApprovalRequestSchema.safeParse({
				...request,
				expiresAtMs: request.expiresAtMs - 1,
			}).success,
		).toBeTrue();
		expect(
			fixture.model.DynamicApprovalRequestSchema.safeParse({
				...request,
				identity: { ...request.identity, tool: "fork_thread" },
			}).success,
		).toBeFalse();
		expect(
			fixture.model.DynamicApprovalRequestSchema.safeParse({
				...request,
				effect: { ...request.effect, visualSummary: "changed" },
			}).success,
		).toBeFalse();
		expect(
			fixture.model.DynamicApprovalRequestSchema.safeParse({
				...request,
				approvalKind: "command_execution",
			}).success,
		).toBeFalse();
	});

	test("binds response to the lease, chat, captured link, call, operation, and hash", () => {
		const fixture = createDynamicFixture();
		const response = fixture.response;
		const pendingResponseSchema = fixture.model.createDynamicApprovalResponseSchema(
			fixture.pending,
		);
		expect(pendingResponseSchema.parse(response)).toEqual(response);
		const swappedTargetIdentity = { ...response.identity, threadId: fixture.other };
		const swappedTargetLink = { ...response.capturedLink, threadId: fixture.other };
		const exactPendingMutations = [
			{ commandId: fixture.ids.browserCommand() },
			{ chatId: "chat-other" },
			{ capturedLink: swappedTargetLink, identity: swappedTargetIdentity },
			{ identity: fixture.requests[2]!.identity },
			{ effectHash: fixture.requests[2]!.effectHash },
		];
		for (const mutation of exactPendingMutations) {
			const candidate = { ...response, ...mutation };
			expect(
				fixture.model.BrowserDynamicApprovalResponseSchema.safeParse(candidate).success,
			).toBeTrue();
			expect(pendingResponseSchema.safeParse(candidate).success).toBeFalse();
		}
		expect(
			fixture.model.BrowserDynamicApprovalResponseSchema.safeParse({
				...response,
				capturedLink: { ...response.capturedLink, threadId: fixture.other },
			}).success,
		).toBeFalse();
		for (const extra of [
			{ responses: [response] },
			{ approvalId: fixture.ids.approval("ordinary-approval") },
			{ targetThreadId: fixture.other },
		]) {
			expect(
				fixture.model.BrowserDynamicApprovalResponseSchema.safeParse({
					...response,
					...extra,
				}).success,
			).toBeFalse();
		}
		const terminal = fixture.approvalFor(
			fixture.requests[0]!,
			"declined",
			fixture.decisionFor(fixture.requests[0]!, "declined", "person_declined"),
			null,
			"refused:approval_declined",
		);
		expect(() => fixture.model.createDynamicApprovalResponseSchema(terminal)).toThrow();
		expect(() => fixture.model.parseDynamicApprovalResponse(terminal, response)).toThrow();
	});

	test("rejects cross-state terminal and delivery combinations", () => {
		const fixture = createDynamicFixture();
		const request = fixture.requests[0]!;
		const invalid = [
			{
				...fixture.approvalFor(
					request,
					"declined",
					fixture.decisionFor(request, "declined", "person_declined"),
					null,
					"refused:approval_declined",
				),
				delivery: "delivered",
			},
			{
				...fixture.approvalFor(
					request,
					"expired",
					fixture.decisionFor(request, "expired", "deadline_reached"),
					null,
					"refused:expired",
				),
				delivery: "outcome_unknown",
			},
			{
				...fixture.approvalFor(
					request,
					"cancelled",
					fixture.decisionFor(request, "cancelled", "server_shutdown"),
					null,
					"approval_required",
				),
				delivery: "delivered",
			},
			{
				...fixture.approvalFor(
					request,
					"stale",
					fixture.decisionFor(request, "approved", "person_approved"),
					null,
					"refused:invalid_call",
				),
				delivery: "delivered",
			},
			{
				...fixture.approvalFor(
					request,
					"outcome_unknown",
					fixture.decisionFor(request, "approved", "person_approved"),
					"outcome_unknown",
					null,
				),
				toolResult: "approval_required",
			},
		];
		for (const approval of invalid) {
			expect(
				fixture.model.BrowserDynamicApprovalSchema.safeParse(approval as unknown).success,
			).toBeFalse();
		}
	});

	test("refuses an initial turn that reuses its mutation operation", () => {
		const fixture = createDynamicFixture();
		const createEffect = fixture.effects[0]!;
		const forkEffect = fixture.effects[1]!;
		expect(
			fixture.model.DynamicApprovalEffectSchema.safeParse({
				...createEffect,
				initialTurnOperationId: createEffect.mutationOperationId,
			}).success,
		).toBeFalse();
		expect(
			fixture.model.DynamicApprovalEffectSchema.safeParse({
				...forkEffect,
				initialTurnOperationId: forkEffect.mutationOperationId,
			}).success,
		).toBeFalse();
	});
});
