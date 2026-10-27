import { expect, test } from "bun:test";
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ArchitectureModelRead } from "@archboard/board/model";
import { startOwnedServer } from "../support/owned-server.ts";
import { createJsonRequester } from "../support/http.ts";
import { vaultIn } from "../support/test-vault.ts";
import {
	browserTestRoots,
	serverTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { initializeSource } from "./support/canonical-model.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 10_000 } as const;

async function visible(browser: AgentBrowserSession, selector: string): Promise<void> {
	await pollUntil(
		() =>
			browser.eval<{ present: boolean; url: string; text: string }>(
				`({present: document.querySelector(${JSON.stringify(selector)}) !== null, url: location.href, text: document.querySelector('[data-slot="architecture-model-stage"]')?.textContent ?? document.body.innerText})`,
			),
		(value) => value.present,
		selector,
		WAIT,
	);
}

function authoredBytes(vault: string) {
	return Object.fromEntries(
		readdirSync(vault, { recursive: true, encoding: "utf8" })
			.filter((path) => path.endsWith(".json") || path.endsWith(".yaml"))
			.map((path) => [path, readFileSync(join(vault, path), "utf8")]),
	);
}

test("migration preview preserves its source while readers navigate modules and flows and recover stale mappings", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "migration-preview");
	const vault = vaultIn(root);
	cpSync(join(import.meta.dir, "fixtures/legacy-preview"), vault, { recursive: true });
	initializeSource(root);
	mkdirSync(join(root, "src"), { recursive: true });
	writeFileSync(join(root, "src/api.ts"), "export const save = () => true;\n");
	const before = authoredBytes(vault);
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const candidate = await request<ArchitectureModelRead>("/api/architecture/model?preview=Shop");
	if (!candidate.body.success || !candidate.body.migrationPreview)
		throw new Error(JSON.stringify(candidate));
	const preview = candidate.body.migrationPreview;
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/?modelA=Shop&previewA=Shop`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await visible(browser, '[data-slot="model-migration-preview"]');
	await visible(browser, '[data-slot="module-list"] [data-module-id="Shop/System#Shop"]');
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-reading-selector"], [data-slot="model-state-details"], [data-slot="model-explain"]') === null`,
		),
	).toBe(true);
	await browser.run(["click", '[data-slot="model-migration-preview"] summary']);
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="preview-source"]').textContent`,
		),
	).toBe(preview.source.digest);
	expect(
		await browser.eval<string>(`document.querySelector('[data-slot="preview-plan"]').textContent`),
	).toBe(preview.planRevision);
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-preview-planned]')].map(node => node.getAttribute('data-preview-planned'))`,
		),
	).toEqual(["Shop/Future#Draft"]);
	await browser.run(["click", '[data-slot="model-migration-preview"] summary']);
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop/System#Shop"]']);
	await visible(browser, '[data-slot="module-open"]');
	await browser.run(["click", '[data-slot="module-open"]']);
	await visible(browser, '[data-slot="model-reading"][data-scope="Shop/System#Shop"]');
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-slot="module-list"] [data-module-id]')].map(node => node.getAttribute('data-module-id'))`,
		),
	).toEqual(["Shop/System#Db", "Shop/System#Api"]);
	await visible(browser, '[data-slot="model-diagram"] [data-semantic-id="Shop/System#Api"]');
	await browser.run(["reload"]);
	await visible(browser, '[data-slot="model-reading"][data-scope="Shop/System#Shop"]');
	expect(await browser.eval<string>(`new URLSearchParams(location.search).get('previewA')`)).toBe(
		"Shop",
	);
	await browser.run(["click", '[data-slot="model-grammar-selector"]']);
	await visible(browser, '[data-grammar="sequence"][role="option"]');
	await browser.run(["click", '[data-grammar="sequence"][role="option"]']);
	await browser.run(["click", '[data-slot="model-flow-selector"]']);
	await visible(browser, '[data-flow-id="Shop/System#Buy"]');
	await browser.run(["click", '[data-flow-id="Shop/System#Buy"]']);
	await visible(
		browser,
		'[data-slot="model-reading"][data-grammar="sequence"] [data-slot="model-diagram"] svg',
	);
	expect(authoredBytes(vault)).toEqual(before);
	const live = await request<ArchitectureModelRead>("/api/architecture/model");
	expect(live.body).toMatchObject({ success: false, code: "LEGACY_AUTHORITY" });
	const source = join(vault, "Shop.semantic.json");
	writeFileSync(source, `${before["Shop.semantic.json"]}\n`);
	await browser.run(["click", '[data-slot="model-refresh"]']);
	await visible(browser, '[data-slot="model-error"][data-code="MAPPING_STALE"]');
	expect(
		await browser.eval<boolean>(`document.querySelector('[data-slot="model-reading"]') === null`),
	).toBe(true);
	writeFileSync(source, before["Shop.semantic.json"]!);
	await browser.run(["click", '[data-slot="model-refresh"]']);
	await visible(
		browser,
		'[data-slot="model-reading"][data-grammar="sequence"] [data-slot="model-diagram"] svg',
	);
	expect(await browser.eval<string>(`new URLSearchParams(location.search).get('flowA')`)).toBe(
		"Shop/System#Buy",
	);
	expect(authoredBytes(vault)).toEqual(before);
});
