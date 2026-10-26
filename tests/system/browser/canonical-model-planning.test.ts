import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
} from "./support/agent-browser.ts";
import { initializeSource, selectReading } from "./support/canonical-model.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 10_000 } as const;

test("planning readings use retained predecessors and preserve unavailable state intent", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "planning-model");
	const vault = vaultIn(root);
	mkdirSync(vault, { recursive: true });
	writeFileSync(
		join(vault, "model.json"),
		JSON.stringify({ schemaVersion: 1, id: "Shop", name: "Future shop", current: null }),
	);
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
	const target = { model: "Shop", state: null };
	const claim = await request<ArchitectureClaimResult>("/api/architecture/claims", {
		method: "POST",
		body: {
			vault,
			target,
			writer: "fixture-agent",
			reason: "Planning architecture",
			subjects: ["Shop"],
		},
	});
	if (!claim.body.success) throw new Error(JSON.stringify(claim.body));
	const created = await request<ArchitectureModuleEditResult>("/api/architecture/module", {
		method: "POST",
		body: {
			vault,
			target,
			expectedRevision: initial.body.revision,
			operationId: "planning-root",
			writer: "fixture-agent",
			doing: "Planning the first service",
			claim: claim.body.claim.id,
			proposal: { type: "create", name: "Plan" },
			changes: [{ type: "add-module", module: { name: "Future API", kind: "service", order: 10 } }],
		},
	});
	await request("/api/architecture/claims/release", {
		method: "POST",
		body: { vault, claim: claim.body.claim.id, writer: "fixture-agent" },
	});
	if (!created.body.success || created.body.target.state === null)
		throw new Error(JSON.stringify(created.body));
	const plan = await request<ArchitectureModelRead>("/api/architecture/model?state=Plan");
	if (!plan.body.success || !plan.body.selectedState || !plan.body.modules[0])
		throw new Error(JSON.stringify(plan.body));
	const plannedModule = plan.body.modules[0].id;
	const predecessor = plan.body.selectedState.id;
	const browser = resources.use(await createAgentBrowser());
	const address = new URL(server.base);
	address.searchParams.set("modelA", "Shop");
	address.searchParams.set("stateA", "Plan");
	await browser.run(["open", address.href]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-diagram"] [data-semantic-id="${plannedModule}"]') !== null && document.querySelector('[data-slot="model-state-details"][data-lifecycle="draft"]') !== null`,
			),
		Boolean,
		"the planning root without an implemented state",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-comparison"]') === null`,
		),
	).toBe(true);
	const emptyBaseline = created.body.checkpoint.request.dependencies[0];
	if (!emptyBaseline) throw new Error("The planning baseline is unavailable");
	address.searchParams.set("againstA", emptyBaseline);
	await browser.run(["open", address.href]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-diagram"] [data-semantic-id="${plannedModule}"][data-semantic-standing="added"]') !== null`,
			),
		Boolean,
		"the planned addition against its exact empty baseline",
		WAIT,
	);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="model-comparison"]')?.getAttribute('data-against') ?? null`,
		),
	).toBe("");
	const childTarget = { model: "Shop", state: predecessor };
	const childClaim = await request<ArchitectureClaimResult>("/api/architecture/claims", {
		method: "POST",
		body: {
			vault,
			target: childTarget,
			writer: "fixture-agent",
			reason: "Planning the next stage",
			subjects: ["Shop", plannedModule],
		},
	});
	if (!childClaim.body.success) throw new Error(JSON.stringify(childClaim.body));
	const child = await request<ArchitectureModuleEditResult>("/api/architecture/module", {
		method: "POST",
		body: {
			vault,
			target: childTarget,
			expectedRevision: plan.body.revision,
			operationId: "planning-child",
			writer: "fixture-agent",
			doing: "Naming the next service",
			claim: childClaim.body.claim.id,
			proposal: { type: "create", name: "Next" },
			changes: [{ type: "edit-module", subject: plannedModule, set: { name: "Next API" } }],
		},
	});
	await request("/api/architecture/claims/release", {
		method: "POST",
		body: { vault, claim: childClaim.body.claim.id, writer: "fixture-agent" },
	});
	if (!child.body.success) throw new Error(JSON.stringify(child.body));
	address.searchParams.set("stateA", "Next");
	address.searchParams.delete("againstA");
	await browser.run(["open", address.href]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-comparison"][data-reason="predecessor"][data-against="${predecessor}"]') !== null && document.querySelector('[data-slot="model-diagram"] [data-semantic-id="${plannedModule}"][data-semantic-standing="changed"]')?.textContent?.includes('Next API') === true`,
			),
		Boolean,
		"the child compared with its retained named predecessor",
		WAIT,
	);
	await browser.run(["click", `[data-slot="module-list"] [data-module-id="${plannedModule}"]`]);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="semantic-inspector-moved"] [data-field="name"]')?.textContent ?? null`,
			),
		(value) => value?.includes("Future API") === true && value.includes("Next API"),
		"the predecessor and child names in the comparison inspector",
		WAIT,
	);
	address.searchParams.set("stateA", "MissingPlan");
	await browser.run(["open", address.href]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-error"][data-code="STATE_NOT_FOUND"]') !== null`,
			),
		Boolean,
		"the explicit unavailable state",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-diagram"]') === null && new URLSearchParams(location.search).get('stateA') === 'MissingPlan' && document.querySelector('[data-slot="model-reading-selector"]')?.textContent?.includes('MissingPlan') === true`,
		),
	).toBe(true);
	await selectReading(browser, child.body.checkpoint.id);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-diagram"] [data-semantic-id="${plannedModule}"][data-semantic-standing="changed"]') !== null`,
			),
		Boolean,
		"the retained child after the unavailable state",
		WAIT,
	);
	const current = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!current.body.success) throw new Error(JSON.stringify(current.body));
	expect(current.body.modules).toEqual([]);
	expect(current.body.selectedState).toBeNull();
}, 60_000);
