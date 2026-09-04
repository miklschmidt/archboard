import { expect, jest, test } from "bun:test";

import {
	createDynamicAuthorityTokenIssuer,
	type DynamicToolApprovalRequest,
} from "../../../runtime/codex-dynamic-tools/index.js";
import { ARCHBOARD_APP_MANIFEST_SHA256 } from "../../../runtime/codex-thread-tools/index.js";
import { CODEX_SERVER_REQUEST_METHODS } from "../../../shared/codex-app-server-contract/index.js";
import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { CODEX_APPROVAL_EXPIRY_MS } from "../../../shared/timing/timing.js";
import { createCanvasDynamicApprovalOwner } from "../codex-workbench-adapters.js";
import { composeCodexWorkbenchGeneration } from "../codex-workbench-generation.js";
import {
	CODEX_WORKBENCH_COMPONENT_ORDER,
	createCodexWorkbenchGenerationFixture,
} from "./support/codex-workbench-generation-fixture.js";

/** Every generated reverse request and the sole reviewed owner it reaches. */
const ROUTED_OWNERS = {
	"item/commandExecution/requestApproval": ["codex-approvals"],
	"item/fileChange/requestApproval": ["codex-approvals"],
	"item/tool/requestUserInput": ["codex-approvals"],
	"mcpServer/elicitation/request": ["codex-approvals"],
	"item/permissions/requestApproval": ["codex-approvals"],
	applyPatchApproval: ["codex-approvals"],
	execCommandApproval: ["codex-approvals"],
	"item/tool/call": ["codex-dynamic-tools", "codex-coordinator-tools"],
	"currentTime/read": ["codex-session"],
	"account/chatgptAuthTokens/refresh": ["codex-session"],
	"attestation/generate": ["codex-session"],
} satisfies Record<(typeof CODEX_SERVER_REQUEST_METHODS)[number], readonly string[]>;

const EVENT_PREFIX: Record<string, string> = {
	"codex-approvals": "approval",
	"codex-dynamic-tools": "dynamic",
	"codex-coordinator-tools": "coordinator",
	"codex-session": "session",
};

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
	// The generated union is the authority. A new reverse request fails this
	// owner at compile time through the satisfies clause and at run time here.
	expect(Object.keys(ROUTED_OWNERS).toSorted()).toEqual(
		[...CODEX_SERVER_REQUEST_METHODS].toSorted(),
	);
	const routed: string[] = [];
	for (const [method, owners] of Object.entries(ROUTED_OWNERS))
		for (const owner of owners) {
			route({ method, owner } as never);
			routed.push(`${EVENT_PREFIX[owner]}:${method}`);
		}
	await Promise.resolve();
	expect(events.filter((event) => routed.includes(event)).toSorted()).toEqual(routed.toSorted());
	await generation.retireChild({
		child: "child" as never,
		epoch: "epoch" as never,
		code: 1,
		signal: null,
	});
	expect(events).toContain("semantic:child-exit");
	// Child-exit settlement, not shutdown, is what retires the dynamic wait and
	// quarantine owner: this holds before any stop has run.
	expect(events).toContain("dynamic:child-exit:child:epoch");
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
		const sourceArguments = request.effect.arguments as { prompt: string };
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
		const projected = owner.pending()[0];
		if (projected === undefined) throw new Error("The approval was not projected.");
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
		expect({ pending: owner.pending().length, settlements }).toEqual({
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
		owner.settleAll("host_shutdown");
		jest.advanceTimersByTime(CODEX_APPROVAL_EXPIRY_MS * 2);
		await Promise.resolve();
		expect(settlements).toBe(1);
	} finally {
		jest.useRealTimers();
	}
});
