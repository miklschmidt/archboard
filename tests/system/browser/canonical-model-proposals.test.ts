import { expect, test } from "bun:test";
import { cpSync, writeFileSync } from "node:fs";
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
} from "./support/agent-browser.ts";
import { initializeSource, selectReading, selectState } from "./support/canonical-model.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 10_000 } as const;

test("proposal readings keep draft lifecycle and module flow changes separate from current", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "proposal-model");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	writeFileSync(
		join(vault, "requests.flows.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Behavior",
			name: "Requests",
			flows: [
				{
					id: "Shop#Request",
					name: "Request",
					participants: ["Shop#Gateway", "Shop#Worker"],
					steps: [
						{
							id: "Shop#Send",
							from: "Shop#Gateway",
							to: "Shop#Worker",
							kind: "sync",
							label: "Dispatch",
						},
					],
				},
			],
		}),
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
	if (!initial.body.success || initial.body.manifest.current === null)
		throw new Error(JSON.stringify(initial.body));
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-list"] [data-module-id="Shop#Gateway"]') !== null`,
			),
		Boolean,
		"the current architecture",
		WAIT,
	);
	const target = { model: initial.body.manifest.id, state: initial.body.manifest.current.id };
	const claimed = await request<ArchitectureClaimResult>("/api/architecture/claims", {
		method: "POST",
		body: {
			vault,
			target,
			writer: "fixture-agent",
			reason: "Proposing queued delivery",
			subjects: ["Shop", "Shop#Gateway", "Shop#Worker", "Shop#Request", "Shop#Send"],
		},
	});
	if (!claimed.body.success) throw new Error(JSON.stringify(claimed.body));
	const created = await request<ArchitectureModuleEditResult>("/api/architecture/module", {
		method: "POST",
		body: {
			vault,
			target,
			expectedRevision: initial.body.revision,
			operationId: "queued-proposal",
			writer: "fixture-agent",
			doing: "Proposing queued delivery",
			claim: claimed.body.claim.id,
			proposal: { type: "create", name: "Queued delivery", summary: "Queue accepted work" },
			changes: [
				{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Queued API" } },
				{ type: "edit-step", subject: "Shop#Send", set: { kind: "async", label: "Enqueue" } },
			],
		},
	});
	await request("/api/architecture/claims/release", {
		method: "POST",
		body: { vault, claim: claimed.body.claim.id, writer: "fixture-agent" },
	});
	if (!created.body.success || created.body.target.state === null)
		throw new Error(JSON.stringify(created.body));
	const draft = created.body.target.state;
	await selectState(browser, draft);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="module-list"] [data-module-id="Shop#Gateway"] > span')?.textContent ?? null`,
			),
		(name) => name === "Queued API",
		"the draft module definition",
		WAIT,
	);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="model-comparison"]')?.getAttribute('data-against') ?? null`,
		),
	).toBe("Current");
	expect(
		await browser.eval<string | null>(`new URLSearchParams(location.search).get('stateA')`),
	).toBe(draft);
	const selected = await request<ArchitectureModelRead>(`/api/architecture/model?state=${draft}`);
	if (!selected.body.success) throw new Error(JSON.stringify(selected.body));
	const draftTarget = { model: "Shop", state: draft };
	const editClaim = await request<ArchitectureClaimResult>("/api/architecture/claims", {
		method: "POST",
		body: {
			vault,
			target: draftTarget,
			writer: "fixture-agent",
			reason: "Refining queued delivery",
			subjects: ["Shop", draft, "Shop#Gateway", "Shop#Worker", "Shop#Request", "Shop#Send"],
		},
	});
	if (!editClaim.body.success) throw new Error(JSON.stringify(editClaim.body));
	const draftClaimId = editClaim.body.claim.id;
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="model-claim"][data-claim-id="${draftClaimId}"]')?.textContent ?? null`,
			),
		(text) => text?.includes("Queued delivery") === true,
		"the claim naming its draft state",
		WAIT,
	);
	const parallelClaim = await request<ArchitectureClaimResult>("/api/architecture/claims", {
		method: "POST",
		body: {
			vault,
			target,
			writer: "parallel-agent",
			reason: "Explaining the handler",
			subjects: ["Shop#Handler"],
		},
	});
	if (!parallelClaim.body.success) throw new Error(JSON.stringify(parallelClaim.body));
	const parallelId = parallelClaim.body.claim.id;
	await pollUntil(
		() =>
			browser.eval<string[]>(
				`[...document.querySelectorAll('[data-slot="working-now"] [data-claim-id]')].map(node => node.getAttribute('data-claim-id'))`,
			),
		(ids) => ids.includes(draftClaimId) && ids.includes(parallelId),
		"concurrent subject claims in the repository activity",
		WAIT,
	);
	await request("/api/architecture/claims/release", {
		method: "POST",
		body: { vault, claim: parallelId, writer: "parallel-agent" },
	});
	await pollUntil(
		() =>
			browser.eval<string[]>(
				`[...document.querySelectorAll('[data-slot="working-now"] [data-claim-id]')].map(node => node.getAttribute('data-claim-id'))`,
			),
		(ids) => ids.includes(draftClaimId) && !ids.includes(parallelId),
		"the remaining writer after one subject claim ends",
		WAIT,
	);
	const edited = await request<ArchitectureModuleEditResult>("/api/architecture/module", {
		method: "POST",
		body: {
			vault,
			target: draftTarget,
			expectedRevision: selected.body.revision,
			operationId: "refine-proposal",
			writer: "fixture-agent",
			doing: "Refining queued delivery",
			claim: editClaim.body.claim.id,
			proposal: { type: "edit", set: { name: "Queued delivery revised" } },
			changes: [
				{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Queued API revised" } },
				{ type: "edit-step", subject: "Shop#Send", set: { label: "Enqueue later" } },
			],
		},
	});
	await request("/api/architecture/claims/release", {
		method: "POST",
		body: { vault, claim: editClaim.body.claim.id, writer: "fixture-agent" },
	});
	if (!edited.body.success) throw new Error(JSON.stringify(edited.body));
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="module-list"] [data-module-id="Shop#Gateway"] > span')?.textContent ?? null`,
			),
		(name) => name === "Queued API revised",
		"the live selected draft update",
		WAIT,
	);
	const flowAddress = new URL(await browser.eval<string>("location.href"));
	flowAddress.searchParams.set("grammarA", "sequence");
	flowAddress.searchParams.set("flowA", "Shop#Request");
	await browser.run(["open", flowAddress.href]);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="model-flow-steps"] [data-step-id="Shop#Send"]')?.textContent ?? null`,
			),
		(text) => text?.includes("Enqueue later") === true,
		"the draft flow after reload",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-state-details"][data-selected-state="${draft}"][data-lifecycle="draft"]') !== null`,
		),
	).toBe(true);
	await selectReading(browser, "current");
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="model-flow-steps"] [data-step-id="Shop#Send"]')?.textContent ?? null`,
			),
		(text) => text?.includes("Dispatch") === true,
		"the unchanged current flow",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-comparison"]') === null && document.querySelector('[data-slot="model-state-details"][data-selected-state="Current"][data-lifecycle="current"]') !== null`,
		),
	).toBe(true);
	await selectReading(browser, created.body.checkpoint.id);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-state-details"][data-selected-state="${draft}"][data-lifecycle="draft"]') !== null`,
			),
		Boolean,
		"the retained draft identity",
		WAIT,
	);
	expect(
		await browser.eval<string | null>(`new URLSearchParams(location.search).get('stateA')`),
	).toBeNull();
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="model-flow-steps"] [data-step-id="Shop#Send"] > span')?.textContent ?? null`,
			),
		(label) => label === "Enqueue",
		"the original flow in the retained draft",
		WAIT,
	);
	const current = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!current.body.success) throw new Error(JSON.stringify(current.body));
	expect(current.body.modules.find((module) => module.id === "Shop#Gateway")?.name).toBe("Gateway");
	expect(current.body.collections[0]?.flows[0]?.steps[0]).toMatchObject({
		id: "Shop#Send",
		kind: "sync",
		label: "Dispatch",
	});
}, 60_000);
