import { expect, jest, test } from "bun:test";

import {
	createDynamicAuthorityTokenIssuer,
	type DynamicToolApprovalRequest,
} from "../../../runtime/codex-dynamic-tools/index.js";
import { ARCHBOARD_APP_MANIFEST_SHA256 } from "../../../runtime/codex-thread-tools/index.js";
import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { CODEX_APPROVAL_EXPIRY_MS } from "../../../shared/timing/timing.js";
import { createCanvasDynamicApprovalOwner } from "../codex-workbench-adapters.js";

test("dynamic approval expiry settles once at the exact authored deadline", async () => {
	jest.useFakeTimers();
	try {
		const identity = createIdentityAuthorities();
		const token = createDynamicAuthorityTokenIssuer();
		const thread = identity.identity.decoder.adoptThreadId("thread-expiry");
		const turn = identity.identity.decoder.adoptTurnId("turn-expiry");
		const call = identity.identity.decoder.adoptDynamicToolCallId("call-expiry");
		const operationId = String(identity.operation.issuer.mintOperationId());
		let now = 1;
		const request: DynamicToolApprovalRequest = {
			identity: {
				child: identity.identity.validator.childId,
				epoch: identity.identity.validator.epoch,
				threadId: thread,
				turnId: turn,
				callId: call,
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
		const owner = createCanvasDynamicApprovalOwner({
			identity,
			now: () => now,
			bindingForCaller: () => ({
				commandId: identity.identity.issuer.mintBrowserCommandId(),
				paneId: "pane-expiry",
				capturedLink: {
					threadId: thread,
					childId: identity.identity.validator.childId,
					epoch: identity.identity.validator.epoch,
				},
			}),
		});
		owner.port.presentImmutableRequest(request);
		const projected = owner.browser.pending()[0];
		if (!projected) throw new Error("The approval owner did not project its pending request.");
		expect(projected.expiresAtMs - projected.createdAtMs).toBe(90_000);
		let settlements = 0;
		const decision = owner.port.awaitOneExactVisualDecision(request).then((value) => {
			settlements += 1;
			return value;
		});
		jest.advanceTimersByTime(CODEX_APPROVAL_EXPIRY_MS - 1);
		await Promise.resolve();
		expect({ pending: owner.browser.pending().length, settlements }).toEqual({
			pending: 1,
			settlements: 0,
		});
		now = request.expiresAtMs;
		jest.advanceTimersByTime(1);
		expect(await decision).toMatchObject({
			outcome: "expired",
			cause: "deadline_reached",
			decidedAtMs: request.expiresAtMs,
		});
		expect(owner.browser.pending()).toEqual([]);
		owner.settleAll("host_shutdown");
		jest.advanceTimersByTime(CODEX_APPROVAL_EXPIRY_MS * 2);
		await Promise.resolve();
		expect(settlements).toBe(1);
	} finally {
		jest.useRealTimers();
	}
});
