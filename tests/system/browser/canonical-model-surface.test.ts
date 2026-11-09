import { expect, test } from "bun:test";
import { cpSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
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
import { initializeSource } from "./support/canonical-model.ts";
import { openModule, settledOn } from "./support/canonical-page.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 10_000 } as const;

async function cameraOf(browser: AgentBrowserSession): Promise<string> {
	return browser.eval<string>(
		`document.querySelector('[data-slot="canvas-surface"]').style.transform`,
	);
}

test("one surface outlives each reading, and Back returns the camera of that reading", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "one-surface");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	writeFileSync(
		join(vault, "decode.module.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop#Decode",
			name: "Decode",
			kind: "module",
			parent: "Shop#Handler",
			order: 40,
			outgoing: [],
		}),
	);
	writeFileSync(
		join(vault, "sibling.module.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop#Sibling",
			name: "Sibling",
			kind: "module",
			parent: "Shop#Gateway",
			order: 41,
			outgoing: [],
		}),
	);
	initializeSource(root);
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Gateway"]') !== null`,
			),
		Boolean,
		"the root picture",
		WAIT,
	);
	await browser.eval(
		`window.held = ["pane-header", "model-reading", "model-diagram", "canvas-surface"].map((slot) => document.querySelector('[data-slot="' + slot + '"]')); true`,
	);
	await openModule(browser, "Shop#Gateway");
	const fitted = await cameraOf(browser);
	await browser.eval(
		`document.querySelector('[data-slot="model-diagram"]').dispatchEvent(new WheelEvent("wheel", { deltaY: -240, ctrlKey: true, clientX: 900, clientY: 500, bubbles: true, cancelable: true })); true`,
	);
	const left = await pollUntil(
		() => cameraOf(browser),
		(camera) => camera !== fitted,
		"the reader's own camera",
		WAIT,
	);
	await openModule(browser, "Shop#Handler");
	await pollUntil(
		() => cameraOf(browser),
		(camera) => camera !== left,
		"the camera of the next reading",
		WAIT,
	);
	await browser.eval("window.history.back()");
	await settledOn(browser, "Shop#Gateway");
	await pollUntil(
		() => cameraOf(browser),
		(camera) => camera === left,
		"the camera of that reading",
		WAIT,
	);
	await browser.run(["click", '[data-filter-kind="call"]']);
	await pollUntil(
		() => browser.eval<boolean>(`new URLSearchParams(location.search).has('hideKindsA')`),
		Boolean,
		"the filtered reading",
		WAIT,
	);
	await settledOn(browser, "Shop#Gateway");
	expect(
		await browser.eval<boolean>(`document.querySelector('[data-filter-kind="call"]') !== null`),
	).toBe(true);
	expect(await browser.eval<boolean>(`window.held.every((part) => part.isConnected)`)).toBe(true);
	const address = new URLSearchParams({
		scopeA: "Shop#Gateway",
		subjectA: "Shop#Handler",
		grammarA: "sequence",
		flowA: "Shop#Request",
	});
	await browser.run(["open", `${server.base}/?${address}`]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-breadcrumbs"] [data-scope-id=""]') !== null`,
			),
		Boolean,
		"the crumbs",
		WAIT,
	);
	await browser.run(["click", '[data-slot="model-breadcrumbs"] [data-scope-id=""]']);
	await settledOn(browser, "");
	expect(
		await browser.eval<string[]>(`[...new URLSearchParams(location.search).keys()]`),
	).not.toContainValues(["subjectA", "flowA", "grammarA"]);
});
