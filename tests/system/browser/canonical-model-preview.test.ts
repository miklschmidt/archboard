import { expect, test } from "bun:test";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { ArchitectureModelRead } from "@archboard/board/model";
import { readLegacyInventory } from "@archboard/board/store-read";
import { saveLegacyMappingPlan } from "@archboard/board/store-write";
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
import { fixtureGit, initializeSource } from "./support/canonical-model.ts";
import { clickNavigatorRow } from "./support/shell-dom.ts";
import { serverPath, type PanesBody } from "./support/navigator-support.ts";

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
	if (preview.planRevision === null)
		throw new Error("This fixture requires its saved mapping plan.");
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

test("preview module code opens through the existing local opener", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "preview-code");
	const vault = vaultIn(root);
	cpSync(join(import.meta.dir, "fixtures/legacy-preview"), vault, { recursive: true });
	initializeSource(root);
	mkdirSync(join(root, "src"), { recursive: true });
	const source = join(root, "src/api.ts");
	writeFileSync(source, "export const save = () => true;\n");
	fixtureGit(root, "add", ".");
	fixtureGit(root, "commit", "--quiet", "-m", "test: author the preview source");
	const capture = join(root, "opened-code.txt");
	const opener = join(root, "capture-opener.ts");
	writeFileSync(
		opener,
		'import { writeFileSync } from "node:fs"; writeFileSync(process.argv[2]!, process.argv[3]!);\n',
	);
	const server = await startOwnedServer({
		serverPath,
		vault,
		env: serverTestEnvironment({ ARCHBOARD_OPENER_CONFIG: join(root, "opener.json") }),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const configured = await fetch(`${server.base}/api/settings/opener`, {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
			Origin: server.base,
			"Sec-Fetch-Site": "same-origin",
		},
		body: JSON.stringify({
			version: 1,
			kind: "custom",
			executable: process.execPath,
			argv: [opener, capture, "{path}"],
		}),
	});
	if (!configured.ok) throw new Error(await configured.text());
	const browser = resources.use(await createAgentBrowser());
	const address = new URL(server.base);
	for (const [key, value] of Object.entries({
		modelA: "Shop",
		previewA: "Shop",
		scopeA: "Shop/System#Shop",
		subjectA: "Shop/System#Api",
	}))
		address.searchParams.set(key, value);
	await browser.run(["open", address.href]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await visible(browser, '[data-slot="module-open-code"]:enabled');
	await browser.run(["click", '[data-slot="module-open-code"]']);
	await pollUntil(
		async () => existsSync(capture),
		Boolean,
		"the preview binding in the local opener",
		WAIT,
	);
	expect(readFileSync(capture, "utf8")).toBe(source);
});

test("a missing preview plan recovers to an explicit planned-only reading", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "planned-preview");
	const vault = vaultIn(root);
	cpSync(join(import.meta.dir, "fixtures/legacy-preview"), vault, { recursive: true });
	initializeSource(root);
	for (const file of [
		"Details.semantic.json",
		"Shop.semantic.json",
		".archboard/migration-plan.json",
	])
		rmSync(join(vault, file));
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/?modelA=Shop&previewA=Shop`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await visible(browser, '[data-slot="model-error"][data-code="MAPPING_REQUIRED"]');
	const inventory = readLegacyInventory(vault, "Shop");
	if (!inventory.success) throw new Error(JSON.stringify(inventory));
	const saved = await saveLegacyMappingPlan(vault, {
		plan: inventory.plan,
		expectedPlan: inventory.planRevision,
		doing: "Keep the planned-only source outside implemented architecture",
	});
	if (!saved.success) throw new Error(JSON.stringify(saved));
	const before = authoredBytes(vault);
	await browser.run(["click", '[data-slot="model-refresh"]']);
	await visible(browser, '[data-slot="model-reading"]');
	expect(
		await browser.eval<boolean>(
			`(() => { const node = document.querySelector('[data-slot="preview-empty"]'); if (!node) return false; const r = node.getBoundingClientRect(); return node.checkVisibility() && node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })()`,
		),
	).toBe(true);
	expect(
		await browser.eval<number>(
			`document.querySelectorAll('[data-slot="module-list"] [data-module-id]').length`,
		),
	).toBe(0);
	await browser.run(["click", '[data-slot="model-migration-preview"] summary']);
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-preview-planned]')].map(node => node.getAttribute('data-preview-planned'))`,
		),
	).toEqual(["Shop/Future#Draft"]);
	await visible(browser, '[data-slot="model-empty-diagram"]');
	expect(authoredBytes(vault)).toEqual(before);
});

test("preview and legacy navigation preserve deliberate history across repeated visits", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "preview-history");
	const vault = vaultIn(root);
	cpSync(join(import.meta.dir, "fixtures/legacy-preview"), vault, { recursive: true });
	initializeSource(root);
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/?modelA=Shop&previewA=Shop`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await visible(browser, '[data-slot="model-migration-preview"]');
	const request = createJsonRequester(server);
	await pollUntil(
		async () => (await request<PanesBody>("/api/panes")).body,
		(panes) => panes.paneCount === 1,
		"the connected preview pane",
		WAIT,
	);
	for (let visit = 0; visit < 2; visit += 1) {
		await pollUntil(
			() => clickNavigatorRow(browser, "details"),
			Boolean,
			"the legacy source in the navigator",
			WAIT,
		);
		await pollUntil(
			() =>
				browser.eval<{ address: string; pane: string | null; notices: string[] }>(
					`({address: window.location.search, pane: new URLSearchParams(window.location.search).get('paneA'), notices: [...document.querySelectorAll('[role="alert"]')].map(node => node.textContent)})`,
				),
			(value) => value.pane === "details",
			`the deliberate legacy address on visit ${visit + 1}`,
			WAIT,
		);

		expect(
			await browser.eval<boolean>(
				`document.querySelector('[data-slot="architecture-model-stage"]') === null`,
			),
		).toBe(true);
		await browser.eval("window.history.back()");
		await visible(browser, '[data-slot="architecture-model-stage"][data-preview="Shop"]');
		expect(
			await browser.eval<string | null>(`new URLSearchParams(location.search).get('previewA')`),
		).toBe("Shop");
	}
});
