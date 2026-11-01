import { expect, test } from "bun:test";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ArchitectureModelRead } from "@archboard/board/model";
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
import { pick } from "./support/canonical-page.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 10_000 } as const;

const FILTER = '[data-slot="model-legend-filter"]';

async function filtering(browser: AgentBrowserSession): Promise<boolean> {
	return browser.eval<boolean>(
		`document.querySelector('${FILTER}')?.getAttribute('aria-pressed') === 'true' && document.querySelector('[data-filter-kind="call"]') !== null`,
	);
}

async function openFilters(browser: AgentBrowserSession): Promise<void> {
	await browser.run(["click", FILTER]);
	await pollUntil(() => filtering(browser), Boolean, "the opened filter controls", WAIT);
}

async function closeFilters(browser: AgentBrowserSession): Promise<void> {
	await browser.run(["click", FILTER]);
	await pollUntil(async () => !(await filtering(browser)), Boolean, "the put away filters", WAIT);
}

test("reading filters preserve selection and authored meaning with an explicit reveal action", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "filtered-model");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	const workerPath = join(vault, "worker.module.json");
	const worker = JSON.parse(readFileSync(workerPath, "utf8"));
	worker.groups = ["public"];
	writeFileSync(workerPath, JSON.stringify(worker));
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const before = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!before.body.success) throw new Error(before.body.error);
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-diagram"] svg') !== null && document.querySelector('[data-slot="model-diagram"] [data-semantic-kind="group-region"]') === null`,
			),
		Boolean,
		"a first picture with its groups off",
		WAIT,
	);
	expect(
		await browser.eval<{ tags: number; switches: number }>(`(() => {
			const groups = document.querySelector('[data-slot="model-legend-groups"]');
			return { tags: groups.children.length, switches: groups.querySelectorAll('[role="switch"]').length };
		})()`),
	).toEqual({ tags: 1, switches: 0 });
	await pick(browser, "Shop#Dispatch");
	await openFilters(browser);
	await browser.run(["click", '[data-filter-kind="call"]']);
	await closeFilters(browser);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-hidden-selection"]')?.getAttribute('data-count') === '1' && document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Dispatch"]') === null && document.querySelector('[data-slot="model-legend-hidden"]') !== null`,
			),
		Boolean,
		"the hidden selected connection, and the count of what is hidden",
		WAIT,
	);
	expect(
		await browser.eval<number>(
			`Number(document.querySelector('[data-slot="model-selection-count"]')?.getAttribute('data-count'))`,
		),
	).toBe(1);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-connection-details"]') !== null`,
		),
	).toBe(true);
	expect(
		await browser.eval<string[]>(
			`[...new Set([...document.querySelectorAll('[data-slot="model-diagram"] [data-semantic-kind="node"]')].map(node => node.getAttribute('data-semantic-id')))].sort()`,
		),
	).toEqual(["Shop#Gateway", "Shop#Worker"]);
	await browser.run(["click", '[data-slot="model-reveal-selection"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-hidden-selection"]') === null && document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Dispatch"]') !== null`,
			),
		Boolean,
		"the revealed selection",
		WAIT,
	);
	await openFilters(browser);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-filter-kind="call"]')?.getAttribute('aria-checked') === 'true'`,
		),
	).toBe(true);
	await closeFilters(browser);
	await browser.eval("window.history.back()");
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-hidden-selection"]')?.getAttribute('data-count') === '1'`,
			),
		Boolean,
		"the preceding filtered reading",
		WAIT,
	);
	await browser.run(["reload"]);
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('${FILTER}') !== null`),
		Boolean,
		"restored filter controls",
		WAIT,
	);
	await openFilters(browser);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-filter-kind="call"]')?.getAttribute('aria-checked') === 'false' && document.querySelector('[data-slot="model-diagram"] svg') !== null`,
			),
		Boolean,
		"restored filters",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Dispatch"]') === null`,
		),
	).toBe(true);
	const after = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!after.body.success) throw new Error(after.body.error);
	expect(after.body.revision).toEqual(before.body.revision);
}, 60_000);
