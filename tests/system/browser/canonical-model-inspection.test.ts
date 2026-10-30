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
} from "./support/agent-browser.ts";
import { serverPath } from "./support/navigator-support.ts";
import { partSearchState } from "./support/semantic-page.ts";

test("browser keyboard input keeps trusted keys, modifiers, and native focus", async () => {
	interface KeySnapshot {
		count: number;
		keys: { type: string; key: string; ctrl: boolean; shift: boolean; trusted: boolean }[];
	}
	await using browser = await createAgentBrowser();
	await browser.run(["open", "about:blank"]);
	await browser.eval(`document.body.innerHTML = '<input id="first"><input id="second">';
		window.keys = []; window.keyCount = 0;
		for (const type of ['keydown', 'keyup']) window.addEventListener(type, event => {
			window.keyCount += 1;
			if (window.keys.length < 4) window.keys.push({ type, key: event.key, ctrl: event.ctrlKey, shift: event.shiftKey, trusted: event.isTrusted });
		});
		document.querySelector('#first').focus(); true`);
	await browser.run(["press", "Escape"]);
	expect(
		await browser.eval<KeySnapshot>("({ count: window.keyCount, keys: window.keys })"),
	).toEqual({
		count: 2,
		keys: [
			{ type: "keydown", key: "Escape", ctrl: false, shift: false, trusted: true },
			{ type: "keyup", key: "Escape", ctrl: false, shift: false, trusted: true },
		],
	});
	await browser.eval("window.keys = []; window.keyCount = 0; true");
	await browser.run(["press", "Control+Shift+K"]);
	expect(
		await browser.eval<KeySnapshot>("({ count: window.keyCount, keys: window.keys })"),
	).toEqual({
		count: 2,
		keys: [
			{ type: "keydown", key: "K", ctrl: true, shift: true, trusted: true },
			{ type: "keyup", key: "K", ctrl: true, shift: true, trusted: true },
		],
	});
	await browser.run(["press", "Tab"]);
	expect(await browser.eval<string>("document.activeElement.id")).toBe("second");
	await browser.run(["keyboard", "type", "board"]);
	expect(await browser.eval<string>("document.querySelector('#second').value")).toBe("board");
});

const WAIT = { timeoutMs: 8_000 } as const;

test("module search restores the sidebar and finds hidden modules without writing architecture", async () => {
	await using resources = new AsyncDisposableStack();
	const vault = vaultIn(join(browserTestRoots().ownerRoot, "module-inspection"));
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
	await browser.run(["open", server.base]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector('[data-slot="model-diagram"] svg') !== null`),
		Boolean,
		"the architecture drawing",
		WAIT,
	);
	const searching = () => partSearchState(browser.eval.bind(browser));
	await browser.run(["click", '[data-slot="semantic-sidebar-toggle"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector('[data-slot="semantic-sidebar"]') === null`),
		Boolean,
		"the hidden sidebar",
		WAIT,
	);
	await browser.run(["press", "Control+Shift+K"]);
	await pollUntil(
		searching,
		(state) => state.focused,
		"the search shortcut to focus the field",
		WAIT,
	);
	await browser.run(["keyboard", "type", "handler"]);
	await pollUntil(
		searching,
		(state) => state.value === "handler" && state.listed && state.controls === "list",
		"the hidden module in search",
		WAIT,
	);
	expect((await searching()).fullNames).toBe(true);
	await browser.run(["press", "Escape"]);
	await pollUntil(
		searching,
		(state) => state.value === "" && state.focused && !state.listed,
		"Escape to clear the search",
		WAIT,
	);
	await browser.run(["press", "Escape"]);
	await pollUntil(searching, (state) => !state.focused, "Escape to leave the empty field", WAIT);
	expect((await searching()).controls).toBeNull();
	await browser.run(["press", "Control+Shift+K"]);
	await browser.run(["keyboard", "type", "handler"]);
	await pollUntil(searching, (state) => state.listed, "the matching hidden module", WAIT);
	await browser.run(["press", "Enter"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.activeElement?.getAttribute('data-tab') === 'selection' && document.querySelector('[data-slot="module-details"]')?.getAttribute('data-module-id') === 'Shop#Handler' && document.querySelector('[data-slot="model-reading"]')?.getAttribute('data-scope') === 'Shop#Gateway'`,
			),
		Boolean,
		"the chosen module and its containing scope",
		WAIT,
	);
	expect(await searching()).toMatchObject({ listed: false, controls: null });
	expect(
		await pollUntil(
			() =>
				browser.eval<boolean>(
					`document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Handler"].is-selected') !== null`,
				),
			Boolean,
			"the chosen hidden module in the new scope drawing",
			WAIT,
		),
	).toBe(true);
	const after = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!after.body.success) throw new Error(after.body.error);
	expect(after.body.revision).toEqual(before.body.revision);
}, 60_000);
