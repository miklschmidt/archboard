import { describe, expect, test } from "bun:test";

import { approvalFor, createDynamicFixture, decisionFor } from "./dynamic-support.js";

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

	test("keeps host authority and login secrets out of browser DTOs", () => {
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
		])
			expect(
				fixture.model.BrowserDynamicApprovalSchema.safeParse({
					...browserApproval,
					effect: { ...browserApproval.effect, [field]: "secret" },
				} as unknown).success,
			).toBeFalse();
		expect(fixture.model.BrowserDtoSchema.safeParse(request as unknown).success).toBeFalse();
		expect(
			fixture.model.BrowserDynamicApprovalSchema.safeParse({
				...browserApproval,
				approvalKind: "command_execution",
			} as unknown).success,
		).toBeFalse();
	});

	test("represents every reviewed pending, terminal, and delivery state", () => {
		const fixture = createDynamicFixture();
		const request = fixture.requests[0]!;
		const approved = decisionFor(request, "approved", "person_approved");
		const declined = decisionFor(request, "declined", "person_declined");
		const expired = decisionFor(request, "expired", "deadline_reached");
		const cancelled = decisionFor(request, "cancelled", "host_shutdown");
		const browserDisconnected = decisionFor(request, "disconnected", "browser_disconnected");
		const childDisconnected = decisionFor(request, "disconnected", "child_disconnected");
		const cases = [
			approvalFor(request, "pending", null, null, null),
			approvalFor(request, "approved", approved, null, null),
			approvalFor(request, "declined", declined, null, "refused:approval_declined"),
			approvalFor(request, "expired", expired, null, "refused:expired"),
			approvalFor(request, "cancelled", cancelled, null, "approval_required"),
			approvalFor(request, "disconnected", browserDisconnected, null, "approval_required"),
			approvalFor(
				request,
				"disconnected",
				childDisconnected,
				"not_delivered",
				"transport_not_delivered",
			),
			approvalFor(request, "stale", approved, null, "refused:invalid_call"),
			approvalFor(request, "delivered", approved, "delivered", null),
			approvalFor(request, "not_delivered", approved, "not_delivered", "transport_not_delivered"),
			approvalFor(request, "outcome_unknown", approved, "outcome_unknown", null),
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
		for (const approval of cases)
			expect(
				fixture.model.BrowserDynamicApprovalSchema.parse(JSON.parse(JSON.stringify(approval))),
			).toEqual(approval);
	});

	test("makes approval_required terminal and never resumable", () => {
		const fixture = createDynamicFixture();
		const request = fixture.requests[0]!;
		const cancelled = approvalFor(
			request,
			"cancelled",
			decisionFor(request, "cancelled", "call_cancelled"),
			null,
			"approval_required",
		);
		expect(cancelled.binding).toBeNull();
		expect(cancelled.resumable).toBeFalse();
		for (const mutation of [
			{ resumable: true },
			{ resumeCommand: "resume_dynamic_call" },
			{ binding: fixture.pending.binding },
		])
			expect(
				fixture.model.BrowserDynamicApprovalSchema.safeParse({
					...cancelled,
					...mutation,
				} as unknown).success,
			).toBeFalse();
	});

	test("rejects hash, identity, effect, expiry, state, and seven-family lookalike drift", () => {
		const fixture = createDynamicFixture();
		const request = fixture.requests[0]!;
		const wrongHash = { ...request, effectHash: "sha256:" + "f".repeat(64) };
		expect(fixture.model.DynamicApprovalRequestSchema.safeParse(wrongHash).success).toBeFalse();
		expect(
			fixture.model.DynamicApprovalRequestSchema.safeParse({
				...request,
				expiresAtMs: request.expiresAtMs + 1,
			}).success,
		).toBeFalse();
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
			} as unknown).success,
		).toBeFalse();
	});

	test("binds response to the lease, pane, captured link, child epoch, call, operation, and hash", () => {
		const fixture = createDynamicFixture();
		const response = fixture.response;
		const pendingResponseSchema = fixture.model.createDynamicApprovalResponseSchema(
			fixture.pending,
		);
		expect(pendingResponseSchema.parse(response)).toEqual(response);
		const swappedTargetIdentity = { ...response.identity, threadId: fixture.other };
		const swappedTargetLink = { ...response.capturedLink, threadId: fixture.other };
		const exactPendingMutations = [
			{ commandId: fixture.authorities.identity.issuer.mintBrowserCommandId() },
			{ paneId: "pane-other" },
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
		for (const mutation of [
			{ capturedLink: { ...response.capturedLink, threadId: fixture.other } },
			{
				capturedLink: {
					...response.capturedLink,
					epoch: fixture.authorities.identity.issuer.mintChildEpoch(),
				},
			},
			{ epoch: fixture.authorities.identity.issuer.mintChildEpoch() },
			{
				identity: {
					...response.identity,
					epoch: fixture.authorities.identity.issuer.mintChildEpoch(),
				},
			},
		])
			expect(
				fixture.model.BrowserDynamicApprovalResponseSchema.safeParse({
					...response,
					...mutation,
				} as unknown).success,
			).toBeFalse();
		for (const extra of [
			{ responses: [response] },
			{ approvalId: fixture.authorities.identity.decoder.adoptApprovalId("ordinary-approval") },
			{ targetThreadId: fixture.other },
		])
			expect(
				fixture.model.BrowserDynamicApprovalResponseSchema.safeParse({
					...response,
					...extra,
				} as unknown).success,
			).toBeFalse();
		const terminal = approvalFor(
			fixture.requests[0]!,
			"declined",
			decisionFor(fixture.requests[0]!, "declined", "person_declined"),
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
				...approvalFor(
					request,
					"declined",
					decisionFor(request, "declined", "person_declined"),
					null,
					"refused:approval_declined",
				),
				delivery: "delivered",
			},
			{
				...approvalFor(
					request,
					"expired",
					decisionFor(request, "expired", "deadline_reached"),
					null,
					"refused:expired",
				),
				delivery: "outcome_unknown",
			},
			{
				...approvalFor(
					request,
					"cancelled",
					decisionFor(request, "cancelled", "host_shutdown"),
					null,
					"approval_required",
				),
				delivery: "delivered",
			},
			{
				...approvalFor(
					request,
					"stale",
					decisionFor(request, "approved", "person_approved"),
					null,
					"refused:invalid_call",
				),
				delivery: "delivered",
			},
			{
				...approvalFor(
					request,
					"outcome_unknown",
					decisionFor(request, "approved", "person_approved"),
					"outcome_unknown",
					null,
				),
				toolResult: "approval_required",
			},
		];
		for (const approval of invalid)
			expect(
				fixture.model.BrowserDynamicApprovalSchema.safeParse(approval as unknown).success,
			).toBeFalse();
	});

	test("rejects stale epochs and fabricated operation or identity domains", () => {
		const fixture = createDynamicFixture();
		const request = fixture.requests[0]!;
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
		const staleEpoch = fixture.authorities.identity.issuer.mintChildEpoch();
		expect(
			fixture.model.DynamicApprovalIdentitySchema.safeParse({
				...request.identity,
				epoch: staleEpoch,
			}).success,
		).toBeFalse();
		expect(
			fixture.model.DynamicApprovalIdentitySchema.safeParse({
				...request.identity,
				operationId: fixture.authorities.identity.issuer.mintBrowserCommandId(),
			} as unknown).success,
		).toBeFalse();
		expect(
			fixture.model.DynamicApprovalIdentitySchema.safeParse({
				...request.identity,
				callId: fixture.authorities.identity.issuer.mintBrowserCommandId(),
			} as unknown).success,
		).toBeFalse();
	});
});
