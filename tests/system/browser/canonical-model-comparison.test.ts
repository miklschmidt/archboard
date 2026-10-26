import { expect, test } from "bun:test";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
	ArchitectureModelRead,
	ArchitectureModuleEditResult,
	ArchitectureClaimResult,
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

const WAIT = { timeoutMs: 10_000 } as const;

async function selectComparison(browser: AgentBrowserSession, id: string): Promise<void> {
	await browser.run(["click", '[data-slot="model-comparison-selector"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`(() => { const item = document.querySelector('[data-against-id="${id}"]'); if (!item) return false; const r = item.getBoundingClientRect(); return r.height > 0 && item.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })()`,
			),
		Boolean,
		"the comparison base choice",
		WAIT,
	);
	await browser.run(["click", `[data-against-id="${id}"]`]);
}

test("proposal comparison draws removed definitions from its coherent base and explains changed fields", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "compared-model");
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
	if (!initial.body.success || initial.body.manifest.current === null)
		throw new Error(JSON.stringify(initial.body));
	const target = { model: initial.body.manifest.id, state: initial.body.manifest.current.id };
	const claimed = await request<ArchitectureClaimResult>("/api/architecture/claims", {
		method: "POST",
		body: {
			vault,
			target,
			writer: "fixture-agent",
			reason: "Comparing queued architecture",
			subjects: [
				"Shop",
				...initial.body.modules.map((module) => module.id),
				...initial.body.relationships.map((edge) => edge.id),
			],
		},
	});
	if (!claimed.body.success) throw new Error(JSON.stringify(claimed.body));
	const created = await request<ArchitectureModuleEditResult>("/api/architecture/module", {
		method: "POST",
		body: {
			vault,
			target,
			expectedRevision: initial.body.revision,
			operationId: "replace-worker",
			writer: "fixture-agent",
			doing: "Proposing queued architecture",
			claim: claimed.body.claim.id,
			proposal: { type: "create", name: "Queue replacement" },
			changes: [
				{ type: "remove-module", subject: "Shop#Worker" },
				{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Queued gateway" } },
				{ type: "add-module", module: { name: "Queue", kind: "service", order: 30 } },
				{
					type: "add-relationship",
					source: "Shop#Gateway",
					relationship: { to: "Queue", kind: "call", order: 20, label: "Enqueue" },
				},
			],
		},
	});
	await request("/api/architecture/claims/release", {
		method: "POST",
		body: { vault, claim: claimed.body.claim.id, writer: "fixture-agent" },
	});
	if (!created.body.success || created.body.target.state === null)
		throw new Error(JSON.stringify(created.body));
	const selected = await request<ArchitectureModelRead>(
		`/api/architecture/model?state=${created.body.target.state}`,
	);
	const current = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!selected.body.success || !current.body.success)
		throw new Error("The authored states are unavailable");
	const queue = selected.body.modules.find((module) => module.name === "Queue");
	if (queue === undefined) throw new Error("The draft did not add its queue");
	const browser = resources.use(await createAgentBrowser());
	const address = new URL(server.base);
	address.searchParams.set("modelA", "Shop");
	address.searchParams.set("stateA", created.body.target.state);
	await browser.run(["open", address.href]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Worker"][data-semantic-standing="removed"]') !== null`,
			),
		Boolean,
		"the removed worker from the comparison base",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-diagram"] [data-semantic-id="${queue.id}"][data-semantic-standing="added"]') !== null && document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Gateway"][data-semantic-standing="changed"]') !== null && document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Dispatch"][data-semantic-standing="removed"]') !== null`,
		),
	).toBe(true);
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Worker"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-details"][data-module-id="Shop#Worker"]') !== null && document.querySelector('[data-slot="semantic-inspector-standing"][data-standing="removed"]') !== null`,
			),
		Boolean,
		"the removed module's base definition",
		WAIT,
	);
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Gateway"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="semantic-inspector-moved"] [data-field="name"]') !== null`,
			),
		Boolean,
		"the actual changed field",
		WAIT,
	);
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="semantic-inspector-moved"] [data-field="name"]').textContent`,
		),
	).toContain("Queued gateway");
	const after = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!after.body.success) throw new Error(JSON.stringify(after.body));
	expect(after.body.revision).toEqual(current.body.revision);
	expect(after.body.modules.map((module) => module.id)).toContain("Shop#Worker");
	expect(after.body.modules.map((module) => module.id)).not.toContain(queue.id);
	const otherClaim = await request<ArchitectureClaimResult>("/api/architecture/claims", {
		method: "POST",
		body: {
			vault,
			target,
			writer: "fixture-agent",
			reason: "Comparing an independent alternative",
			subjects: ["Shop", "Shop#Worker"],
		},
	});
	if (!otherClaim.body.success) throw new Error(JSON.stringify(otherClaim.body));
	const alternative = await request<ArchitectureModuleEditResult>("/api/architecture/module", {
		method: "POST",
		body: {
			vault,
			target,
			expectedRevision: after.body.revision,
			operationId: "worker-alternative",
			writer: "fixture-agent",
			doing: "Naming an independent alternative",
			claim: otherClaim.body.claim.id,
			proposal: { type: "create", name: "Other worker" },
			changes: [
				{ type: "edit-module", subject: "Shop#Worker", set: { name: "Alternative worker" } },
			],
		},
	});
	await request("/api/architecture/claims/release", {
		method: "POST",
		body: { vault, claim: otherClaim.body.claim.id, writer: "fixture-agent" },
	});
	if (!alternative.body.success || alternative.body.target.state === null)
		throw new Error(JSON.stringify(alternative.body));
	const alternativeId = alternative.body.target.state;
	await selectComparison(browser, alternativeId);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-comparison"][data-against="${alternativeId}"][data-reason="explicit"]') !== null && document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Worker"]')?.textContent?.includes('Alternative worker') === true`,
			),
		Boolean,
		"the independent proposal as the explicit base",
		WAIT,
	);
	expect(
		await browser.eval<string | null>(`new URLSearchParams(location.search).get('againstA')`),
	).toBe(alternativeId);
	await browser.run(["reload"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-comparison"][data-against="${alternativeId}"]') !== null && document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Worker"]')?.textContent?.includes('Alternative worker') === true`,
			),
		Boolean,
		"the explicit base after reload",
		WAIT,
	);
	await selectComparison(browser, "current");
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-comparison"][data-against="Current"][data-reason="explicit"]') !== null`,
			),
		Boolean,
		"the explicit current base",
		WAIT,
	);
	const workerPath = join(vault, "worker.module.json");
	const worker = JSON.parse(readFileSync(workerPath, "utf8"));
	worker.name = "Current worker revised";
	writeFileSync(workerPath, JSON.stringify(worker));
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-error"][data-code="PREDECESSOR_CHANGED"]') !== null && document.querySelector('[data-slot="model-comparison-unavailable"]') !== null`,
			),
		Boolean,
		"the changed predecessor and unavailable comparison",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Worker"][data-semantic-standing="removed"]') === null`,
		),
	).toBe(true);
	await selectReading(browser, created.body.checkpoint.id);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Worker"][data-semantic-standing="removed"]')?.textContent?.includes('Current worker revised') === true`,
			),
		Boolean,
		"the retained draft against the verified newer current base",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-state-details"][data-lifecycle="draft"]') !== null && document.querySelector('[data-slot="model-comparison-unavailable"]') === null`,
		),
	).toBe(true);
}, 60_000);
