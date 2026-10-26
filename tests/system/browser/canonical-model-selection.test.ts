import { expect, test } from "bun:test";
import { cpSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ArchitectureModelRead } from "@archboard/board/model";
import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import { createJsonRequester } from "../support/http.ts";
import {
	browserTestRoots,
	serverTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { serverPath } from "./support/navigator-support.ts";
import { editingModifier } from "./support/keyboard.ts";

const WAIT = { timeoutMs: 10_000 } as const;

async function selectedCount(browser: AgentBrowserSession): Promise<number> {
	return browser.eval<number>(
		`Number(document.querySelector('[data-slot="model-selection-count"]')?.getAttribute('data-count') ?? 0)`,
	);
}

async function toggleModule(browser: AgentBrowserSession, id: string): Promise<void> {
	await browser.eval(
		`document.querySelector('[data-slot="module-list"] [data-module-id="${id}"]').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }))`,
	);
}

test("module selection supports modifiers and keyboard without layout or history changes", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "selected-model");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
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
			browser.eval<boolean>(`document.querySelector('[data-slot="model-diagram"] svg') !== null`),
		Boolean,
		"the selectable scene",
		WAIT,
	);
	const history = await browser.eval<number>("window.history.length");
	await browser.eval(
		`document.querySelector('[data-slot="model-diagram"] svg').setAttribute('data-test-scene', 'kept')`,
	);
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Gateway"]']);
	await toggleModule(browser, "Shop#Worker");
	await pollUntil(
		() => selectedCount(browser),
		(count) => count === 2,
		"both selected modules",
		WAIT,
	);
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-slot="model-selected-subjects"] [data-subject-id]')].map(node => node.getAttribute('data-subject-id')).sort()`,
		),
	).toEqual(["Shop#Gateway", "Shop#Worker"]);
	expect(
		await browser.eval<string[]>(
			`[...new Set([...document.querySelectorAll('[data-slot="model-diagram"] [data-semantic-kind="node"].is-selected')].map(node => node.getAttribute('data-semantic-id')))].sort()`,
		),
	).toEqual(["Shop#Gateway", "Shop#Worker"]);
	await toggleModule(browser, "Shop#Gateway");
	await pollUntil(
		() => selectedCount(browser),
		(count) => count === 1,
		"the toggled selection",
		WAIT,
	);
	await browser.run(["focus", '[data-slot="module-list"] [data-module-id="Shop#Gateway"]']);
	await browser.run(["press", `${editingModifier}+Enter`]);
	await pollUntil(
		() => selectedCount(browser),
		(count) => count === 2,
		"the keyboard selection",
		WAIT,
	);
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Worker"]']);
	await pollUntil(
		() => selectedCount(browser),
		(count) => count === 1,
		"normal selection replacing the set",
		WAIT,
	);
	await browser.run(["press", "Escape"]);
	await pollUntil(
		() => selectedCount(browser),
		(count) => count === 0,
		"Escape clearing selection",
		WAIT,
	);
	expect(await browser.eval<number>("window.history.length")).toBe(history);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="model-diagram"] svg')?.getAttribute('data-test-scene') ?? null`,
		),
	).toBe("kept");
	const after = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!after.body.success) throw new Error(after.body.error);
	expect(after.body.revision).toEqual(before.body.revision);
}, 60_000);
