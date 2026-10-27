import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { exportArchitectureModel, importArchitectureModel } from "@archboard/board/store-write";
import { readArchitectureModel } from "@archboard/board/store-read";
import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import {
	browserTestRoots,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	serverTestEnvironment,
} from "./support/agent-browser.ts";
import { fixtureGit, initializeSource, selectReading } from "./support/canonical-model.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 10_000 } as const;

test("imported planning models remain readable through exact history and comparison", async () => {
	await using resources = new AsyncDisposableStack();
	const source = join(browserTestRoots().ownerRoot, "portable-source");
	const sourceVault = vaultIn(source);
	mkdirSync(join(sourceVault, ".archboard"), { recursive: true });
	writeFileSync(
		join(sourceVault, "model.json"),
		JSON.stringify({ schemaVersion: 1, id: "Shop", name: "Future shop", current: null }),
	);
	writeFileSync(
		join(sourceVault, ".archboard/config.yaml"),
		Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY),
	);
	initializeSource(source);
	fixtureGit(source, "config", "commit.gpgsign", "false");
	const exported = await exportArchitectureModel(sourceVault);
	if (!exported.success) throw new Error(JSON.stringify(exported));
	const target = join(browserTestRoots().ownerRoot, "portable-target");
	const vault = vaultIn(target);
	mkdirSync(vault, { recursive: true });
	initializeSource(target);
	fixtureGit(target, "config", "commit.gpgsign", "false");
	const imported = await importArchitectureModel(vault, {
		bundle: exported.bundle,
		expectedRevision: {
			files: [],
			digest: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
		},
		operationId: "visible-planning-import",
		writer: "fixture",
		doing: "Restore planning architecture",
	});
	if (!imported.success) throw new Error(JSON.stringify(imported));
	expect(imported.checkpoint.state).toBeNull();
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/?modelA=Shop`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-state-details"][data-lifecycle="none"]') !== null`,
			),
		Boolean,
		"the imported model without an implemented state",
		WAIT,
	);
	await selectReading(browser, imported.checkpoint.id);
	expect(
		await browser.eval<string>(`new URLSearchParams(location.search).get('checkpointA')`),
	).toBe(imported.checkpoint.id);
	await browser.run(["click", '[data-slot="model-comparison-selector"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`(() => { const choice = document.querySelector('[data-against-id="${imported.checkpoint.id}"]'); if (!choice) return false; const r = choice.getBoundingClientRect(); return r.height > 0 && choice.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })()`,
			),
		Boolean,
		"the planning checkpoint as a comparison base",
		WAIT,
	);
	await browser.run(["click", `[data-against-id="${imported.checkpoint.id}"]`]);
	await pollUntil(
		() => browser.eval<string | null>(`new URLSearchParams(location.search).get('againstA')`),
		(id) => id === imported.checkpoint.id,
		"the exact imported comparison address",
		WAIT,
	);
	await browser.run(["reload"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-state-details"][data-lifecycle="none"]') !== null`,
			),
		Boolean,
		"the imported planning reading after reload",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(`document.querySelector('[data-slot="model-error"]') === null`),
	).toBe(true);
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	expect(current.manifest.current).toBeNull();
}, 60_000);
