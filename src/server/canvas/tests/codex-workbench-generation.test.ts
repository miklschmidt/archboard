import { expect, jest, test } from "bun:test";

import {
	createDynamicAuthorityTokenIssuer,
	type DynamicToolApprovalRequest,
} from "../../../runtime/codex-dynamic-tools/index.js";
import { ARCHBOARD_APP_MANIFEST_SHA256 } from "../../../runtime/codex-thread-tools/index.js";
import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { CODEX_APPROVAL_EXPIRY_MS } from "../../../shared/timing/timing.js";
import { createCanvasDynamicApprovalOwner } from "../codex-workbench-adapters.js";
import { composeCodexWorkbenchGeneration } from "../codex-workbench-generation.js";
import {
	CODEX_WORKBENCH_COMPONENT_ORDER,
	createCodexWorkbenchGenerationFixture,
} from "./support/codex-workbench-generation-fixture.js";

test("the production generation creates every owner once before readiness and shuts down in order", async () => {
	const events: string[] = [];
	const fixture = createCodexWorkbenchGenerationFixture(events);
	const generation = await composeCodexWorkbenchGeneration({
		identityLedger: fixture.identityLedger,
		factories: fixture.factories,
		hooks: fixture.hooks,
	});
	expect(Object.fromEntries(fixture.calls)).toEqual(
		Object.fromEntries(CODEX_WORKBENCH_COMPONENT_ORDER.map((name) => [name, 1])),
	);
	expect(events.indexOf("identity:install")).toBeLessThan(events.indexOf("ready"));
	expect(events.indexOf("router:install")).toBeLessThan(events.indexOf("ready"));
	expect(events.indexOf("approval-projection:install")).toBeLessThan(events.indexOf("ready"));
	expect(events.indexOf("browser:install")).toBeLessThan(events.indexOf("ready"));
	const route = fixture.requestListeners.at(-1);
	if (route === undefined) throw new Error("missing private production router");
	for (const method of [
		"item/commandExecution/requestApproval",
		"item/fileChange/requestApproval",
		"item/tool/requestUserInput",
		"mcpServer/elicitation/request",
		"item/permissions/requestApproval",
		"applyPatchApproval",
		"execCommandApproval",
	] as const)
		route({ method, owner: "codex-approvals" } as never);
	route({ method: "item/tool/call", owner: "codex-dynamic-tools" } as never);
	route({ method: "item/tool/call", owner: "codex-coordinator-tools" } as never);
	for (const method of [
		"currentTime/read",
		"account/chatgptAuthTokens/refresh",
		"attestation/generate",
	] as const)
		route({ method, owner: "codex-session" } as never);
	await Promise.resolve();
	expect(events.filter((event) => event.startsWith("approval:"))).toHaveLength(7);
	expect(events).toContain("dynamic:item/tool/call");
	expect(events).toContain("coordinator:item/tool/call");
	expect(events.filter((event) => event.startsWith("session:"))).toHaveLength(3);
	await generation.retireChild({
		child: "child" as never,
		epoch: "epoch" as never,
		code: 1,
		signal: null,
	});
	expect(events).toContain("semantic:child-exit");
	const stopping = generation.stop("shutdown");
	for (const listener of fixture.requestListeners) listener({} as never);
	for (const listener of fixture.notificationListeners) listener({} as never);
	await stopping;
	generation.finishStop();
	expect(events.indexOf("browser:remove")).toBeLessThan(events.indexOf("gateway:dispose"));
	expect(events.indexOf("gateway:dispose")).toBeLessThan(events.indexOf("realtime:stop"));
	expect(events.indexOf("realtime:stop")).toBeLessThan(events.indexOf("queue:stop"));
	expect(events).toContain("dynamic:cancel:host_shutdown");
	expect(events).toContain("ordinary:settle:host_shutdown");
	expect(events.filter((event) => event === "transport:shutdown")).toHaveLength(1);
	expect(events.indexOf("ordinary:settle:host_shutdown")).toBeLessThan(
		events.indexOf("transport:shutdown"),
	);
	expect(events.filter((event) => event === "approval-projection:remove")).toHaveLength(1);
	expect(events.filter((event) => event === "epoch:close")).toHaveLength(1);
});

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
		const owner = createCanvasDynamicApprovalOwner({
			identity,
			now: () => now,
			bindingForCaller: () => ({
				commandId: identity.identity.issuer.mintBrowserCommandId(),
				paneId: "pane-expiry",
				capturedLink: {
					threadId,
					childId: identity.identity.validator.childId,
					epoch: identity.identity.validator.epoch,
				},
			}),
		});
		owner.port.presentImmutableRequest(request);
		const projected = owner.browser.pending()[0];
		if (projected === undefined) throw new Error("The approval was not projected.");
		expect(projected.expiresAtMs - request.createdAtMs).toBe(CODEX_APPROVAL_EXPIRY_MS);
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
		owner.settleAll("host_shutdown");
		jest.advanceTimersByTime(CODEX_APPROVAL_EXPIRY_MS * 2);
		await Promise.resolve();
		expect(settlements).toBe(1);
	} finally {
		jest.useRealTimers();
	}
});
