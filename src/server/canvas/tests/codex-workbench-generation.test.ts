import { expect, test } from "bun:test";

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
