import { openAbout, openDiagram, pick } from "./support/canonical-page.ts";
import { expect, test } from "bun:test";
import { cpSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ArchitectureModelRead } from "@archboard/model/contract";
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

/** What a selection must not change: where the picture stands, and its camera. */
async function pictureFrame(browser: AgentBrowserSession): Promise<string> {
	return browser.eval<string>(`(() => {
		const diagram = document.querySelector('[data-slot="model-diagram"]');
		const { x, y, width, height } = diagram.getBoundingClientRect();
		const { transform } = diagram.querySelector('[data-slot="semantic-board-surface"]').style;
		return JSON.stringify({ x, y, width, height, transform });
	})()`);
}

async function subjectShown(browser: AgentBrowserSession): Promise<boolean> {
	return browser.eval<boolean>(
		`document.querySelector('[data-slot="model-panel"] [data-slot="model-panel-scope"]') === null`,
	);
}

/** Whether the legend stands whole on screen, beside the picture, with no click. */
async function legendInView(browser: AgentBrowserSession): Promise<boolean> {
	return browser.eval<boolean>(`(() => {
		const legend = document.querySelector('[data-slot="model-legend"]');
		const box = legend?.getBoundingClientRect();
		const picture = document.querySelector('[data-slot="model-diagram"]').getBoundingClientRect();
		return box !== undefined && legend.querySelector('[data-slot="model-legend-kinds"] li') !== null
			&& box.top >= 0 && box.bottom <= innerHeight && box.left >= picture.right;
	})()`);
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
			browser.eval<boolean>(
				`document.querySelector('[data-slot="semantic-board-surface"]:not([data-picture-motion]) svg') !== null`,
			),
		Boolean,
		"the landed scene",
		WAIT,
	);
	const history = await browser.eval<number>("window.history.length");
	await browser.eval(
		`document.querySelector('[data-slot="model-diagram"] svg').setAttribute('data-test-scene', 'kept')`,
	);
	expect(await subjectShown(browser)).toBe(false);
	expect(await legendInView(browser)).toBe(true);
	const frame = await pictureFrame(browser);
	await pick(browser, "Shop#Gateway");
	await pollUntil(() => subjectShown(browser), Boolean, "the panel of the selection", WAIT);
	expect(await pictureFrame(browser)).toBe(frame);
	expect(await legendInView(browser)).toBe(true);
	await pick(browser, "Shop#Worker", { toggle: true });
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
	await pick(browser, "Shop#Gateway", { toggle: true });
	await pollUntil(
		() => selectedCount(browser),
		(count) => count === 1,
		"the toggled selection",
		WAIT,
	);
	await openAbout(browser);
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
	await openAbout(browser, "selection");
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="module-details"]')?.getAttribute('data-module-id') ?? null`,
		),
	).toBe("Shop#Worker");
	expect(
		await browser.eval<boolean>(`document.querySelector('[data-slot="model-legend"]') === null`),
	).toBe(true);
	await openAbout(browser);
	await openDiagram(browser);
	await pollUntil(() => subjectShown(browser), Boolean, "the selection back in the panel", WAIT);
	await browser.run(["focus", '[data-slot="model-diagram"]']);
	await browser.run(["press", "Escape"]);
	await pollUntil(
		() => selectedCount(browser),
		(count) => count === 0,
		"Escape clearing selection",
		WAIT,
	);
	await pollUntil(async () => !(await subjectShown(browser)), Boolean, "the open module", WAIT);
	expect(await pictureFrame(browser)).toBe(frame);
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
