import { expect, test } from "bun:test";

import { CODEX_SERVER_REQUEST_METHODS } from "@archboard/codex-app-server/contract";

import { composeCodexWorkbenchGeneration } from "#server/services/generation/compose.ts";
import {
	CODEX_WORKBENCH_COMPONENT_ORDER,
	createCodexWorkbenchGenerationFixture,
} from "#tests/server/support/generation/generation-fixture.ts";

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
	// The generation opens no tab session itself; this one is the fixture's, as a pane's would be.
	expect(events.filter((event) => event === "create:tabSession")).toHaveLength(1);
	expect(events.indexOf("identity:install")).toBeLessThan(events.indexOf("ready"));
	expect(events.indexOf("router:install")).toBeLessThan(events.indexOf("ready"));
	expect(events.indexOf("approval-projection:install")).toBeLessThan(events.indexOf("ready"));
	expect(events.indexOf("browser:install")).toBeLessThan(events.indexOf("ready"));
	const route = fixture.requestListeners.at(-1);
	if (route === undefined) {
		throw new Error("missing private production router");
	}
	// The generated union is the authority. A new reverse request fails this
	// owner at compile time through the satisfies clause and at run time here.
	expect(Object.keys(ROUTED_OWNERS).toSorted()).toEqual(
		[...CODEX_SERVER_REQUEST_METHODS].toSorted(),
	);
	const routed: string[] = [];
	for (const [method, owners] of Object.entries(ROUTED_OWNERS)) {
		for (const owner of owners) {
			// A coordinator tool call reaches the tab session that started the calling thread.
			route({ method, owner, params: { threadId: fixture.claimedThread } } as never);
			routed.push(`${EVENT_PREFIX[owner]}:${method}`);
		}
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
	for (const listener of fixture.requestListeners) {
		listener({} as never);
	}
	for (const listener of fixture.notificationListeners) {
		listener({} as never);
	}
	await stopping;
	generation.finishStop();
	const shutdownOrder = [
		"browser:remove",
		"gateway:dispose",
		"realtime:dispose",
		"publisher:dispose",
		"queue:stop",
		"dynamic:cancel:server_shutdown",
		"ordinary:settle:server_shutdown",
		"session:dispose",
		"callbacks:dispose",
		"spoken:dispose",
		"semantic:dispose",
		"coordinator-tools:dispose",
		"dynamic:dispose",
		"transport:shutdown",
	];
	expect(events.filter((event) => shutdownOrder.includes(event))).toEqual(shutdownOrder);
	expect(events.filter((event) => event === "approval-projection:remove")).toHaveLength(1);
	expect(events.filter((event) => event === "epoch:close")).toHaveLength(1);
});

test("a generation without domain tools becomes ready and shuts down", async () => {
	const events: string[] = [];
	const fixture = createCodexWorkbenchGenerationFixture(events);
	const generation = await composeCodexWorkbenchGeneration({
		identityLedger: fixture.identityLedger,
		factories: { ...fixture.factories, dynamicTools: () => null },
		hooks: fixture.hooks,
	});
	expect(events).toContain("ready");
	await generation.stop("shutdown");
	generation.finishStop();
	expect(events).toContain("transport:shutdown");
	expect(events).not.toContain("dynamic:dispose");
});
