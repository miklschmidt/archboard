import { expect, test } from "bun:test";
import { cpSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import { createJsonRequester } from "../support/http.ts";
import type { ArchitectureModelRead } from "@archboard/board/model";
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

async function scopeOf(browser: AgentBrowserSession): Promise<string | null> {
	return browser.eval<string | null>(
		`document.querySelector('[data-slot="model-reading"]')?.getAttribute('data-scope') ?? null`,
	);
}

async function openModule(browser: AgentBrowserSession, id: string): Promise<void> {
	await browser.run(["click", `[data-slot="module-list"] [data-module-id="${id}"]`]);
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('[data-slot="module-open"]') !== null`),
		Boolean,
		"the module opening action",
		WAIT,
	);
	await browser.run(["click", '[data-slot="module-open"]']);
	await pollUntil(
		() => scopeOf(browser),
		(scope) => scope === id,
		"the selected scope",
		WAIT,
	);
}

test("module decomposition follows breadcrumbs and browser history without changing architecture", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "recursive-model");
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
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const before = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!before.body.success) throw new Error(JSON.stringify(before.body));
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-list"] [data-module-id="Shop#Gateway"]') !== null`,
			),
		Boolean,
		"the root modules",
		WAIT,
	);
	await openModule(browser, "Shop#Gateway");
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-slot="module-list"] [data-module-id]')].map(node => node.getAttribute('data-module-id'))`,
		),
	).toEqual(["Shop#Handler"]);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="module-list"] [data-module-id="Shop#Decode"]') === null`,
		),
	).toBe(true);
	await openModule(browser, "Shop#Handler");
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-slot="model-breadcrumbs"] [data-scope-id]')].map(node => node.getAttribute('data-scope-id'))`,
		),
	).toEqual(["", "Shop#Gateway", "Shop#Handler"]);
	await browser.eval("window.history.back()");
	await pollUntil(
		() => scopeOf(browser),
		(scope) => scope === "Shop#Gateway",
		"the previous scope",
		WAIT,
	);
	await browser.eval("window.history.forward()");
	await pollUntil(
		() => scopeOf(browser),
		(scope) => scope === "Shop#Handler",
		"the next scope",
		WAIT,
	);
	await browser.run(["reload"]);
	await pollUntil(
		() => scopeOf(browser),
		(scope) => scope === "Shop#Handler",
		"the reloaded scope",
		WAIT,
	);
	await browser.run(["click", '[data-slot="model-breadcrumbs"] [data-scope-id=""]']);
	await pollUntil(
		() => scopeOf(browser),
		(scope) => scope === "",
		"the repository scope",
		WAIT,
	);
	const after = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!after.body.success) throw new Error(after.body.error);
	expect(after.body.revision).toEqual(before.body.revision);
}, 60_000);
