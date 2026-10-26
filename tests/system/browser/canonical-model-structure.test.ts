import { expect, test } from "bun:test";
import { cpSync } from "node:fs";
import { join, resolve } from "node:path";
import type { z } from "zod";
import type {
	ArchitectureModelRead,
	ArchitectureModuleEditSchema,
	ArchitectureModuleEditResult,
	ArchitectureClaimResult,
	ArchitectureCheckpointRetain,
} from "@archboard/board/model";
import { createJsonRequester } from "../support/http.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import {
	browserTestRoots,
	serverTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { initializeSource, selectReading } from "./support/canonical-model.ts";
import { serverPath } from "./support/navigator-support.ts";

type Changes = Extract<
	z.input<typeof ArchitectureModuleEditSchema>,
	{ changes: unknown }
>["changes"];
const WAIT = { timeoutMs: 8_000 } as const;

async function edit(
	request: ReturnType<typeof createJsonRequester>,
	vault: string,
	operationId: string,
	changes: Changes,
) {
	const current = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!current.body.success || current.body.manifest.current === null)
		throw new Error(JSON.stringify(current.body));
	const target = { model: current.body.manifest.id, state: current.body.manifest.current.id };
	const claimed = await request<ArchitectureClaimResult>("/api/architecture/claims", {
		method: "POST",
		body: {
			vault,
			target,
			writer: "fixture-agent",
			reason: "Explain module boundaries",
			subjects: [
				target.model,
				...current.body.modules.map((module) => module.id),
				...current.body.relationships.map((edge) => edge.id),
			],
		},
	});
	if (!claimed.body.success) throw new Error(JSON.stringify(claimed.body));
	const edited = await request<ArchitectureModuleEditResult>("/api/architecture/module", {
		method: "POST",
		body: {
			vault,
			target,
			expectedRevision: current.body.revision,
			operationId,
			writer: "fixture-agent",
			doing: "Changing module structure",
			claim: claimed.body.claim.id,
			changes,
		},
	});
	await request("/api/architecture/claims/release", {
		method: "POST",
		body: { vault, claim: claimed.body.claim.id, writer: "fixture-agent" },
	});
	if (!edited.body.success) throw new Error(JSON.stringify(edited.body));
	return edited.body;
}

async function roots(browser: AgentBrowserSession): Promise<string[]> {
	return browser.eval<string[]>(
		`[...document.querySelectorAll('[data-slot="module-list"] [data-module-id]')].map(row => row.getAttribute('data-module-id'))`,
	);
}

async function selectedName(browser: AgentBrowserSession): Promise<string | null> {
	return browser.eval<string | null>(
		`document.querySelector('[data-slot="module-details"] h3')?.textContent ?? null`,
	);
}

test("structural writes refresh current modules while exact history and selected identities stay explicit", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "structural-model");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	initializeSource(root);
	const server = await startOwnedServer({
		serverPath,
		vault,
		env: serverTestEnvironment({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const initial = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!initial.body.success) throw new Error(JSON.stringify(initial.body));
	const retained = await request<ArchitectureCheckpointRetain>("/api/architecture/checkpoints", {
		method: "POST",
		body: {
			vault,
			target: "current",
			operationId: "before-structure",
			writer: "fixture-agent",
			doing: "Retaining original module boundaries",
			expectedRevision: initial.body.revision.digest,
			dependencies: [],
		},
	});
	if (!retained.body.success) throw new Error(JSON.stringify(retained.body));
	const baseline = retained.body.checkpoint.id;
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => roots(browser),
		(ids) => ids.includes("Shop#Gateway"),
		"the current root modules",
		WAIT,
	);
	await selectReading(browser, baseline);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="architecture-model-stage"]')?.getAttribute('data-state') ?? null`,
			),
		(state) => state === "ready",
		"the retained architecture",
		WAIT,
	);
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Gateway"]']);
	await pollUntil(
		() => selectedName(browser),
		(name) => name === "Gateway",
		"the selected historical module",
		WAIT,
	);
	const changed = await edit(request, vault, "rename-and-transfer", [
		{ type: "add-module", module: { name: "Cache", kind: "service", order: 40 } },
		{ type: "edit-module", subject: "Shop#Gateway", set: { name: "API" } },
		{
			type: "edit-relationship",
			subject: "Shop#Dispatch",
			source: "Shop#Worker",
			set: { to: "Shop#Gateway" },
		},
		{
			type: "add-relationship",
			source: "Cache",
			relationship: { to: "Shop#Worker", kind: "call", label: "Read cached result", order: 20 },
		},
	]);
	await browser.run(["click", '[data-slot="model-reading-selector"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-reading-id="${changed.checkpoint.id}"]') !== null`,
			),
		Boolean,
		"the completion event to refresh history",
		WAIT,
	);
	expect(await selectedName(browser)).toBe("Gateway");
	expect(await roots(browser)).toEqual(["Shop#Worker", "Shop#Gateway"]);
	await browser.run(["click", '[data-reading-id="current"]']);
	await pollUntil(
		() => selectedName(browser),
		(name) => name === "API",
		"the renamed current module",
		WAIT,
	);
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="module-details"] [aria-label="Incoming connections"]').textContent`,
		),
	).toContain("Dispatch request");
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="module-details"] [aria-label="Outgoing connections"]').textContent`,
		),
	).not.toContain("Dispatch request");
	const after = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!after.body.success) throw new Error(JSON.stringify(after.body));
	const cache = after.body.modules.find((module) => module.name === "Cache");
	if (cache === undefined) throw new Error("The structural write did not add Cache.");
	expect(await roots(browser)).toContain(cache.id);
	await edit(request, vault, "contain-api", [
		{ type: "edit-module", subject: "Shop#Gateway", set: { parent: "Shop#Worker" } },
	]);
	await pollUntil(
		() => roots(browser),
		(ids) => !ids.includes("Shop#Gateway"),
		"the reparented module to leave the roots",
		WAIT,
	);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="module-parent"]')?.textContent ?? null`,
			),
		(name) => name === "Worker",
		"the selected module's new parent",
		WAIT,
	);
	expect(await selectedName(browser)).toBe("API");
	await browser.run([
		"screenshot",
		"/home/msc/.local/state/archboard-implementation/task-549/task-549.04-structural-parent.png",
	]);
	await browser.run(["click", `[data-slot="module-list"] [data-module-id="${cache.id}"]`]);
	await edit(request, vault, "remove-cache", [{ type: "remove-module", subject: cache.id }]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-missing-selection"]') !== null && document.querySelector('[data-slot="module-details"]') === null`,
			),
		Boolean,
		"the removed selection without a replacement",
		WAIT,
	);
	expect(await roots(browser)).toEqual(["Shop#Worker"]);
	await selectReading(browser, baseline);
	expect(await roots(browser)).toEqual(["Shop#Worker", "Shop#Gateway"]);
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Gateway"]']);
	expect(await selectedName(browser)).toBe("Gateway");
}, 90_000);
