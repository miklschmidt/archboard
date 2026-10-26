import { expect, test } from "bun:test";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
	ArchitectureModelRead,
	ArchitectureModuleEdit,
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
import { initializeSource, selectReading, selectState } from "./support/canonical-model.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 10_000 } as const;
type Intent = Pick<Extract<ArchitectureModuleEdit, { changes: unknown }>, "changes"> &
	Partial<Pick<Extract<ArchitectureModuleEdit, { proposal: unknown }>, "proposal">>;

async function edit(
	request: ReturnType<typeof createJsonRequester>,
	state: string,
	intent: Intent,
) {
	const reading = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!reading.body.success) throw new Error(JSON.stringify(reading.body));
	const model = reading.body;
	const target = { model: model.manifest.id, state };
	const claim = await request<ArchitectureClaimResult>("/api/architecture/claims", {
		method: "POST",
		body: {
			vault: request.vault,
			target,
			writer: "fixture-agent",
			reason: "Reconciling the proposal family",
			subjects: [
				model.manifest.id,
				...model.modules.map((module) => module.id),
				...model.proposals.map((proposal) => proposal.id),
			],
		},
	});
	if (!claim.body.success) throw new Error(JSON.stringify(claim.body));
	try {
		const result = await request<ArchitectureModuleEditResult>("/api/architecture/module", {
			method: "POST",
			body: {
				vault: request.vault,
				target,
				expectedRevision: model.revision,
				claim: claim.body.claim.id,
				operationId: crypto.randomUUID(),
				writer: "fixture-agent",
				doing: "Updating the coherent proposal family",
				...intent,
			},
		});
		if (!result.body.success) throw new Error(JSON.stringify(result.body));
		return result.body;
	} finally {
		await request("/api/architecture/claims/release", {
			method: "POST",
			body: { vault: request.vault, claim: claim.body.claim.id, writer: "fixture-agent" },
		});
	}
}

async function standing(browser: AgentBrowserSession, value: string): Promise<void> {
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="model-state-details"]')?.getAttribute('data-standing') ?? null`,
			),
		(actual) => actual === value,
		`the ${value} proposal standing`,
		WAIT,
	);
}

test("proposal conflicts preserve coherent content, blocked ancestry, live settlement, and exact retained standing", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "reconciliation-model");
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
	const draft = await edit(request, "Current", {
		proposal: { type: "create", name: "Queued delivery" },
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "Queues accepted work." },
			},
		],
	});
	const draftId = draft.target.state!;
	const child = await edit(request, draftId, {
		proposal: { type: "create", name: "Batch delivery" },
		changes: [{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Batch gateway" } }],
	});
	const childId = child.target.state!;
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/?modelA=Shop&stateA=${draftId}`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-list"] [data-module-id="Shop#Gateway"]') !== null`,
			),
		Boolean,
		"the selected proposal",
		WAIT,
	);
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Gateway"]']);
	await edit(request, "Current", {
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "Dispatches work immediately.", responsibility: "Accepts public work" },
			},
		],
	});
	await standing(browser, "conflicted");
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="module-details"]')?.textContent ?? ''`,
		),
	).toContain("Accepts public work");
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="module-details"]')?.textContent ?? ''`,
		),
	).toContain("Queues accepted work.");
	await browser.run(["click", '[data-slot="model-reconciliation"] summary']);
	expect(
		await browser.eval<unknown>(
			`(() => { const issue = document.querySelector('[data-slot="model-reconciliation"] [data-subject-id="Shop#Gateway"][data-field="description"]'); return {mine: issue?.querySelector('[data-value="mine"]')?.textContent, theirs: issue?.querySelector('[data-value="theirs"]')?.textContent}; })()`,
		),
	).toEqual({ mine: "Queues accepted work.", theirs: "Dispatches work immediately." });
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="model-reconciliation"] [data-subject-id="Shop#Gateway"]')?.textContent ?? ''`,
		),
	).toContain("Gateway");
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('[data-slot="model-stale"]') === null`),
		Boolean,
		"the confirmed conflicted reading",
		WAIT,
	);
	const retained = await edit(request, draftId, { proposal: { type: "edit" }, changes: [] });
	await selectState(browser, childId);
	await standing(browser, "blocked");
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="model-blocked-ancestor"]')?.getAttribute('data-state-id') ?? null`,
		),
	).toBe(draftId);
	await browser.run(["click", '[data-slot="model-blocked-ancestor"]']);
	await standing(browser, "conflicted");
	expect(
		await browser.eval<string | null>(`new URLSearchParams(location.search).get('stateA')`),
	).toBe(draftId);
	await edit(request, draftId, {
		proposal: {
			type: "settle",
			resolutions: [{ subject: "Shop#Gateway", field: "description", take: "mine" }],
		},
		changes: [],
	});
	await standing(browser, "settled");
	await selectState(browser, childId);
	await standing(browser, "settled");
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Gateway"]']);
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="module-details"]')?.textContent ?? ''`,
		),
	).toContain("Accepts public work");
	await selectReading(browser, retained.checkpoint.id);
	await standing(browser, "conflicted");
	expect(
		await browser.eval<string | null>(`new URLSearchParams(location.search).get('checkpointA')`),
	).toBe(retained.checkpoint.id);
	await selectState(browser, draftId);
	await standing(browser, "settled");
	const path = join(vault, "gateway.module.json");
	const external = JSON.parse(readFileSync(path, "utf8"));
	external.responsibility = "Accepts external work";
	writeFileSync(path, JSON.stringify(external));
	await browser.run(["reload"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-error"][data-code="PREDECESSOR_CHANGED"]') !== null`,
			),
		Boolean,
		"the explicit changed-predecessor refusal",
		WAIT,
	);
	expect(
		await browser.eval<string | null>(`new URLSearchParams(location.search).get('stateA')`),
	).toBe(draftId);
	await edit(request, "Current", { proposal: { type: "reconcile" }, changes: [] });
	await browser.run(["reload"]);
	await standing(browser, "settled");
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Gateway"]']);
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="module-details"]')?.textContent ?? ''`,
		),
	).toContain("Accepts external work");
}, 60_000);
