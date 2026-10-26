import { expect, test } from "bun:test";
import { cpSync } from "node:fs";
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
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 10_000 } as const;

async function cameraTransform(browser: AgentBrowserSession): Promise<string> {
	return browser.eval<string>(
		`document.querySelector('[data-slot="model-diagram"] [data-slot="semantic-board-surface"]')?.style.transform ?? ''`,
	);
}

async function selectedIds(browser: AgentBrowserSession): Promise<string[]> {
	return browser.eval<string[]>(
		`[...document.querySelectorAll('[data-slot="model-selected-subjects"] [data-subject-id]')].map(node => node.getAttribute('data-subject-id')).sort()`,
	);
}

async function drag(
	browser: AgentBrowserSession,
	x: number,
	y: number,
	button: "left" | "middle",
): Promise<void> {
	await browser.run(["mouse", "move", String(x), String(y)]);
	await browser.run(["mouse", "down", button]);
	await browser.run(["mouse", "move", String(x + 32), String(y + 24)]);
	await browser.run(["mouse", "up", button]);
}

test("empty-canvas dragging selects while middle and Space dragging pan", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "gesture-model");
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
		"the scene for selection",
		WAIT,
	);
	const rectangle = await browser.eval<{
		left: number;
		top: number;
		right: number;
		bottom: number;
	}>(`document.querySelector('[data-slot="model-diagram"]').getBoundingClientRect().toJSON()`);
	const history = await browser.eval<number>("window.history.length");
	const originalCamera = await cameraTransform(browser);
	await browser.eval(
		`document.querySelector('[data-slot="model-diagram"] svg').setAttribute('data-test-scene', 'kept')`,
	);
	await browser.run(["mouse", "move", String(rectangle.left + 4), String(rectangle.bottom - 4)]);
	await browser.run(["mouse", "down", "left"]);
	await browser.run(["mouse", "move", String(rectangle.right - 4), String(rectangle.top + 4)]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-selection-rectangle"]') !== null`,
			),
		Boolean,
		"the immediate selection rectangle",
		WAIT,
	);
	await browser.run(["mouse", "up", "left"]);
	await pollUntil(
		() => selectedIds(browser),
		(ids) => ids.length === 3,
		"the intersected canonical subjects",
		WAIT,
	);
	expect(await selectedIds(browser)).toEqual(["Shop#Dispatch", "Shop#Gateway", "Shop#Worker"]);
	expect(await cameraTransform(browser)).toBe(originalCamera);
	await drag(browser, rectangle.left + 8, rectangle.top + 8, "middle");
	await pollUntil(
		() => cameraTransform(browser),
		(transform) => transform !== originalCamera,
		"the middle-button pan",
		WAIT,
	);
	const middleCamera = await cameraTransform(browser);
	await browser.eval(
		`document.querySelector('[data-slot="model-diagram"]').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }))`,
	);
	await drag(browser, rectangle.left + 8, rectangle.top + 8, "left");
	await browser.eval(
		`document.querySelector('[data-slot="model-diagram"]').dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }))`,
	);
	await pollUntil(
		() => cameraTransform(browser),
		(transform) => transform !== middleCamera,
		"the Space pan",
		WAIT,
	);
	expect(await selectedIds(browser)).toEqual(["Shop#Dispatch", "Shop#Gateway", "Shop#Worker"]);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="model-diagram"] svg')?.getAttribute('data-test-scene') ?? null`,
		),
	).toBe("kept");
	expect(await browser.eval<number>("window.history.length")).toBe(history);
	await browser.run(["press", "Escape"]);
	await pollUntil(
		() =>
			browser.eval<number>(
				`Number(document.querySelector('[data-slot="model-selection-count"]')?.getAttribute('data-count') ?? 0)`,
			),
		(count) => count === 0,
		"Escape clearing a canvas selection",
		WAIT,
	);
	const after = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!after.body.success) throw new Error(after.body.error);
	expect(after.body.revision).toEqual(before.body.revision);
}, 60_000);
