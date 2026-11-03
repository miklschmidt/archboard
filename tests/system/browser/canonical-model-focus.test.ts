import { expect, test } from "bun:test";
import {
	openAbout,
	openModule,
	pick,
	openDiagram,
	pressInPanel,
} from "./support/canonical-page.ts";
import type { z } from "zod";
import type { SemanticPaneContextSchema } from "@archboard/model/pane-context";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ArchitectureModelRead } from "@archboard/model/contract";
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

async function drawnModules(browser: AgentBrowserSession): Promise<string[]> {
	return browser.eval<string[]>(
		`[...new Set([...document.querySelectorAll('[data-slot="model-diagram"] [data-semantic-kind="node"], [data-slot="model-diagram"] [data-semantic-kind="region"]')].map(node => node.getAttribute('data-semantic-id')))].sort()`,
	);
}

test("focus draws the selected subjects, with the rest as doors", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "focused-model");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	const gatewayPath = join(vault, "gateway.module.json");
	const gateway = JSON.parse(readFileSync(gatewayPath, "utf8"));
	gateway.outgoing.push({
		id: "Shop#Handle",
		to: "Shop#Handler",
		kind: "call",
		order: 20,
		label: "Handle",
	});
	writeFileSync(gatewayPath, JSON.stringify(gateway));
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
		join(vault, "hidden.module.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop#Hidden",
			name: "Hidden",
			kind: "module",
			parent: "Shop#Gateway",
			order: 50,
			outgoing: [
				{ id: "Shop#Private", to: "Shop#Hidden", kind: "call", order: 60, label: "Internal only" },
			],
		}),
	);
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
				`document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Gateway"]') !== null`,
			),
		Boolean,
		"the root modules",
		WAIT,
	);
	await openModule(browser, "Shop#Gateway");
	await openModule(browser, "Shop#Handler");
	await pick(browser, "Shop#Gateway", { toggle: true });
	await pick(browser, "Shop#Decode", { toggle: true });
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-focus"]')?.disabled === false`,
			),
		Boolean,
		"the focus action for the selected subjects",
		WAIT,
	);
	await pressInPanel(browser, '[data-slot="model-focus"]');
	await pollUntil(
		() => drawnModules(browser),
		(ids) => ids.join() === "Shop#Decode,Shop#Gateway,Shop#Worker",
		"the focused context",
		WAIT,
	);
	const focusedReport = await pollUntil(
		() =>
			request<{ panes: z.infer<typeof SemanticPaneContextSchema>[] }>(
				"/api/panes/semantic-context",
			),
		(result) =>
			result.body.panes.some((pane) => pane.architecture?.reading.focus.includes("Shop#Decode")),
		"the focused reading to reach the local agent context",
		WAIT,
	);
	expect(focusedReport.body.panes.find((pane) => pane.paneId === "A")?.byUser).toContain("view");
	expect(await drawnModules(browser)).toEqual(["Shop#Decode", "Shop#Gateway", "Shop#Worker"]);
	await openAbout(browser, "selection");
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-slot="model-about"] [data-slot="model-selected-subjects"] [data-subject-id]')].map(node => node.getAttribute('data-subject-id')).sort()`,
		),
	).toEqual(["Shop#Decode", "Shop#Gateway"]);
	await openAbout(browser);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-connections"] [data-connection-id="Shop#Private"]') === null`,
		),
	).toBe(true);
	await openDiagram(browser);
	expect(
		await browser.eval<string[]>(
			`(new URLSearchParams(location.search).get('focusA') ?? '').split(',').sort()`,
		),
	).toEqual(["Shop#Decode", "Shop#Gateway"]);
	await browser.eval("window.history.back()");
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`!new URLSearchParams(location.search).has('focusA') && document.querySelector('[data-slot="model-reading"][data-scope="Shop#Handler"]') !== null`,
			),
		Boolean,
		"the reading before focus",
		WAIT,
	);
	await browser.eval("window.history.forward()");
	await pollUntil(
		() => drawnModules(browser),
		(ids) => ids.join() === "Shop#Decode,Shop#Gateway,Shop#Worker",
		"the restored focused reading",
		WAIT,
	);
	await browser.run(["reload"]);
	await pollUntil(
		() => drawnModules(browser),
		(ids) => ids.join() === "Shop#Decode,Shop#Gateway,Shop#Worker",
		"the focused reading after reload",
		WAIT,
	);
	expect(await drawnModules(browser)).toEqual(["Shop#Decode", "Shop#Gateway", "Shop#Worker"]);
	const partial = new URL(server.base);
	partial.searchParams.set("modelA", "Shop");
	partial.searchParams.set("scopeA", "Shop#Handler");
	partial.searchParams.set("focusA", "Shop#Decode,Shop#Missing");
	await browser.run(["open", partial.href]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-focus-missing"]') !== null && document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Decode"]') !== null`,
			),
		Boolean,
		"the partial focus without a replacement subject",
		WAIT,
	);
	expect(await drawnModules(browser)).toEqual(["Shop#Decode"]);
	partial.searchParams.set("focusA", "Shop#Missing");
	await browser.run(["open", partial.href]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-focus-missing"]') !== null && document.querySelector('[data-slot="model-empty-diagram"]') !== null`,
			),
		Boolean,
		"the unavailable focused reading",
		WAIT,
	);
	expect(await drawnModules(browser)).toEqual([]);
	await browser.run(["click", '[data-slot="model-whole-scope"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-focus-missing"]') === null && document.querySelector('[data-slot="model-reading"][data-scope="Shop#Handler"]') !== null`,
			),
		Boolean,
		"the underlying scope after clearing missing focus",
		WAIT,
	);
	partial.searchParams.set("focusA", "Shop#Private");
	await browser.run(["open", partial.href]);
	await openAbout(browser);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-connections"] [data-connection-id="Shop#Private"]') !== null`,
			),
		Boolean,
		"the explicitly focused authored self-connection",
		WAIT,
	);
	await pollUntil(
		() => drawnModules(browser),
		(ids) => ids.includes("Shop#Hidden"),
		"the self-connection scene",
		WAIT,
	);
	expect(await drawnModules(browser)).toEqual(["Shop#Hidden"]);
	const after = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!after.body.success) throw new Error(after.body.error);
	expect(after.body.revision).toEqual(before.body.revision);
}, 60_000);
