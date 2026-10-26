import { expect, test } from "bun:test";
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
	ArchitectureModelRead,
	ArchitectureModuleEditResult,
	ArchitectureClaimResult,
	ArchitectureCheckpointRetain,
} from "@archboard/board/model";
import { createJsonRequester } from "../support/http.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import { runServerCli } from "../support/run-cli.ts";
import {
	browserTestRoots,
	serverTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { initializeSource, fixtureGit, selectReading } from "./support/canonical-model.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 10_000 } as const;

function modelFixture(root: string, model: string, repository: string): string {
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	for (const file of readdirSync(vault, { recursive: true, encoding: "utf8" }).filter((name) =>
		name.endsWith(".json"),
	)) {
		const path = join(vault, file);
		writeFileSync(
			path,
			readFileSync(path, "utf8")
				.replaceAll("Shop", model)
				.replaceAll("acme/shop", `acme/${repository}`),
		);
	}
	initializeSource(root);
	fixtureGit(root, "remote", "set-url", "origin", `https://github.com/acme/${repository}.git`);
	fixtureGit(root, "add", ".");
	fixtureGit(root, "commit", "--quiet", "-m", "test: seed referenced architecture");
	return vault;
}

async function selectGateway(browser: AgentBrowserSession): Promise<void> {
	await pollUntil(
		() =>
			browser.eval<{
				present: boolean;
				url: string;
				error: string | null;
				stage: string | null;
				modules: string[];
			}>(
				`({ present: document.querySelector('[data-slot="module-list"] [data-module-id="Shop#Gateway"]') !== null, url: location.href, error: document.querySelector('[data-slot="model-error"]')?.textContent ?? null, stage: document.querySelector('[data-slot="architecture-model-stage"]')?.getAttribute('data-state') ?? null, modules: [...document.querySelectorAll('[data-slot="module-list"] [data-module-id]')].map(node => node.getAttribute('data-module-id')) })`,
			),
		(value) => value.present,
		"the source module",
		WAIT,
	);
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Gateway"]']);
}

async function followGateway(browser: AgentBrowserSession): Promise<void> {
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-reference"][data-index="0"] [data-slot="module-follow-reference"]')?.matches(':enabled') === true`,
			),
		Boolean,
		"the available foreign module reference",
		WAIT,
	);
	await browser.run([
		"click",
		'[data-slot="module-reference"][data-index="0"] [data-slot="module-follow-reference"]',
	]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-details"][data-module-id="Ledger#Gateway"]') !== null`,
			),
		Boolean,
		"the exact foreign subject",
		WAIT,
	);
}

test("foreign references preserve explicit addresses and recover pinned architecture without changing ownership", async () => {
	await using resources = new AsyncDisposableStack();
	const home = join(browserTestRoots().ownerRoot, "reference-models");
	const local = join(home, "shop"),
		foreign = join(home, "ledger");
	const vault = modelFixture(local, "Shop", "shop");
	const foreignVault = modelFixture(foreign, "Ledger", "ledger");
	const server = await startOwnedServer({
		serverPath,
		vault,
		env: serverTestEnvironment({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	for (const root of [local, foreign]) {
		const registered = runServerCli({
			repoRoot: resolve(import.meta.dir, "../../.."),
			server,
			args: ["repo", "add", root],
			input: undefined,
		});
		if (registered.status !== 0) throw new Error(registered.stderr);
	}
	const request = createJsonRequester(server);
	const foreignReading = await request<ArchitectureModelRead>("/api/architecture/model", {
		vault: foreignVault,
	});
	if (!foreignReading.body.success) throw new Error(JSON.stringify(foreignReading.body));
	const retained = await request<ArchitectureCheckpointRetain>("/api/architecture/checkpoints", {
		method: "POST",
		vault: foreignVault,
		body: {
			vault: foreignVault,
			target: "current",
			operationId: "retain-foreign",
			writer: "fixture-agent",
			doing: "Retaining the referenced architecture",
			expectedRevision: foreignReading.body.revision.digest,
			dependencies: [],
		},
	});
	if (!retained.body.success) throw new Error(JSON.stringify(retained.body));
	const initial = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!initial.body.success || initial.body.manifest.current === null)
		throw new Error(JSON.stringify(initial.body));
	const target = { model: "Shop", state: initial.body.manifest.current.id };
	const claim = await request<ArchitectureClaimResult>("/api/architecture/claims", {
		method: "POST",
		body: {
			vault,
			target,
			writer: "fixture-agent",
			reason: "Explaining a foreign reference",
			subjects: ["Shop#Gateway"],
		},
	});
	if (!claim.body.success) throw new Error(JSON.stringify(claim.body));
	const edited = await request<ArchitectureModuleEditResult>("/api/architecture/module", {
		method: "POST",
		body: {
			vault,
			target,
			expectedRevision: initial.body.revision,
			claim: claim.body.claim.id,
			operationId: "reference-ledger",
			writer: "fixture-agent",
			doing: "Linking explicit foreign architecture",
			changes: [
				{
					type: "edit-module",
					subject: "Shop#Gateway",
					clear: ["binding"],
					set: {
						references: [
							{
								repo: "github.com/acme/ledger",
								model: "Ledger",
								subject: "Ledger#Gateway",
								state: "current",
							},
						],
					},
				},
			],
		},
	});
	await request("/api/architecture/claims/release", {
		method: "POST",
		body: { vault, claim: claim.body.claim.id, writer: "fixture-agent" },
	});
	if (!edited.body.success) throw new Error(JSON.stringify(edited.body));
	const before = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!before.body.success) throw new Error(JSON.stringify(before.body));
	const browser = resources.use(await createAgentBrowser());
	const address = new URL(server.base);
	address.searchParams.set("modelA", "Shop");
	address.searchParams.set("repoA", "github.com/acme/shop");
	await browser.run(["open", address.href]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await selectGateway(browser);
	await followGateway(browser);
	expect(
		await browser.eval<unknown>(
			`Object.fromEntries(['repoA','modelA','stateA','subjectA'].map(key => [key,new URLSearchParams(location.search).get(key)]))`,
		),
	).toEqual({
		repoA: "github.com/acme/ledger",
		modelA: "Ledger",
		stateA: "Current",
		subjectA: "Ledger#Gateway",
	});
	await browser.run(["reload"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-details"][data-module-id="Ledger#Gateway"]') !== null`,
			),
		Boolean,
		"the foreign subject after reload",
		WAIT,
	);
	await browser.run(["back"]);
	await selectGateway(browser);
	expect(
		await browser.eval<string | null>(`new URLSearchParams(location.search).get('modelA')`),
	).toBe("Shop");
	rmSync(join(foreignVault, "model.json"));
	await browser.run(["reload"]);
	await selectGateway(browser);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-reference"][data-index="0"][data-status="unavailable"]') !== null`,
			),
		Boolean,
		"the explicit unavailable foreign model",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="module-reference"][data-index="0"] [data-slot="module-follow-reference"]')?.matches(':disabled') === true && document.querySelector('[data-slot="module-details"][data-module-id="Shop#Gateway"]') !== null`,
		),
	).toBe(true);
	await selectReading(browser, edited.body.checkpoint.id);
	await selectGateway(browser);
	await followGateway(browser);
	expect(
		await browser.eval<string | null>(`new URLSearchParams(location.search).get('checkpointA')`),
	).toBe(retained.body.checkpoint.id);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-state-details"][data-lifecycle="historical"]') !== null`,
		),
	).toBe(true);
	expect(existsSync(join(foreignVault, "model.json"))).toBe(false);
	const after = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!after.body.success) throw new Error(JSON.stringify(after.body));
	expect(after.body.revision).toEqual(before.body.revision);
}, 60_000);
