import { expect, jest, test } from "bun:test";
import { createDynamicAuthorityTokenIssuer } from "#runtime/rules/dynamic-tools/authority/authority-token.ts";
import { type DynamicToolApprovalRequest } from "#runtime/protocol/dynamic-tools/contract.ts";
import { ARCHBOARD_APP_MANIFEST_SHA256 } from "#runtime/protocol/thread-tools/manifest.ts";
import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import { CODEX_APPROVAL_EXPIRY_MS } from "@archboard/timing";
import { createServerDynamicApprovalOwner } from "#server/services/actions/dynamic-approvals.ts";
import { parseTabSessionId } from "@archboard/codex-realtime-voice/server";

const TAB_SESSION = parseTabSessionId("tab-one")!;

test("dynamic approval expiry settles once at the exact production deadline", async () => {
	jest.useFakeTimers();
	try {
		const identity = createIdentityAuthorities();
		const token = createDynamicAuthorityTokenIssuer();
		const threadId = identity.identity.decoder.adoptThreadId("thread-expiry");
		const operationId = String(identity.operation.issuer.mintOperationId());
		let now = 1;
		const request: DynamicToolApprovalRequest = {
			identity: {
				child: identity.identity.validator.childId,
				epoch: identity.identity.validator.epoch,
				threadId,
				turnId: identity.identity.decoder.adoptTurnId("turn-expiry"),
				callId: identity.identity.decoder.adoptDynamicToolCallId("call-expiry"),
				namespace: "archboard_app",
				tool: "create_thread",
				manifestHash: ARCHBOARD_APP_MANIFEST_SHA256,
				operationId,
			},
			effect: {
				tool: "create_thread",
				arguments: { prompt: "expire without mutation" },
				callerAuthority: token.issue(),
				targetAuthority: null,
				contextAuthority: token.issue(),
				effectiveBoundary: null,
				mutationOperationId: operationId,
				initialTurnOperationId: String(identity.operation.issuer.mintOperationId()),
				visualSummary: "Create thread: expire without mutation",
			},
			effectHash: `sha256:${"4".repeat(64)}`,
			createdAtMs: now,
			expiresAtMs: now + CODEX_APPROVAL_EXPIRY_MS,
		};
		const sourceArguments = request.effect.arguments as { prompt: string };
		const owner = createServerDynamicApprovalOwner({
			identity,
			now: () => now,
			bindingForCaller: () => ({
				tabSessionId: TAB_SESSION,
				binding: {
					commandId: identity.identity.issuer.mintBrowserCommandId(),
					paneId: "pane-expiry",
					capturedLink: {
						threadId,
						childId: identity.identity.validator.childId,
						epoch: identity.identity.validator.epoch,
					},
				},
			}),
		});
		owner.port.presentImmutableRequest(request);
		const projected = owner.pending(TAB_SESSION)[0];
		if (projected === undefined) {
			throw new Error("The approval was not projected.");
		}
		expect(projected.request).not.toBe(request);
		expect(projected.request.effect.arguments).not.toBe(sourceArguments);
		expect(projected.binding.paneId).toBe("pane-expiry");
		expect(Object.isFrozen(projected)).toBe(true);
		expect(Object.isFrozen(projected.request)).toBe(true);
		expect(Object.isFrozen(projected.request.effect)).toBe(true);
		expect(Object.isFrozen(projected.request.effect.arguments)).toBe(true);
		expect(Object.isFrozen(projected.binding)).toBe(true);
		expect(Object.isFrozen(projected.binding.capturedLink)).toBe(true);
		expect(projected.request.expiresAtMs - request.createdAtMs).toBe(CODEX_APPROVAL_EXPIRY_MS);
		sourceArguments.prompt = "mutated after presentation";
		expect(request.effect.arguments.prompt).toBe("mutated after presentation");
		expect(projected.request.effect.arguments.prompt).toBe("expire without mutation");
		const mutableOwnerRequest = projected.request as unknown as {
			effect: { arguments: { prompt: string } };
		};
		expect(() => (mutableOwnerRequest.effect.arguments.prompt = "mutated owner")).toThrow();
		let settlements = 0;
		const decision = owner.port.awaitOneExactVisualDecision(request).then((value) => {
			settlements += 1;
			return value;
		});
		jest.advanceTimersByTime(CODEX_APPROVAL_EXPIRY_MS - 1);
		await Promise.resolve();
		expect({ pending: owner.pending(TAB_SESSION).length, settlements }).toEqual({
			pending: 1,
			settlements: 0,
		});
		now = request.expiresAtMs;
		jest.advanceTimersByTime(1);
		expect(await decision).toMatchObject({
			outcome: "expired",
			cause: "deadline_reached",
			identity: projected.request.identity,
			effectHash: projected.request.effectHash,
			decidedAtMs: request.expiresAtMs,
		});
		owner.settleAll("server_shutdown");
		jest.advanceTimersByTime(CODEX_APPROVAL_EXPIRY_MS * 2);
		await Promise.resolve();
		expect(settlements).toBe(1);
	} finally {
		jest.useRealTimers();
	}
});
