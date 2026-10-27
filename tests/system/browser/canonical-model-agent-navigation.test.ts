import { expect, test } from "bun:test";
import { cpSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import { createJsonRequester } from "../support/http.ts";
import {
	browserTestRoots,
	serverTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
} from "./support/agent-browser.ts";
import { serverPath } from "./support/navigator-support.ts";
import { initializeSource } from "./support/canonical-model.ts";

const WAIT = { timeoutMs: 10_000 } as const;

test("agent navigation opens the requested canonical pane without moving its neighbor", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "addressed-model");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	initializeSource(root);
	writeFileSync(
		join(vault, "tour.walkthrough.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop#Tour",
			name: "Request tour",
			target: { state: "current" },
			beats: [
				{
					id: "Shop#Roots",
					title: "Services",
					narrative: "Start at the service boundary.",
					reading: { grammar: "architecture", selection: ["Shop#Gateway"] },
				},
				{
					id: "Shop#Inside",
					title: "Handler",
					narrative: "Open the gateway implementation.",
					reading: { grammar: "architecture", scope: "Shop#Gateway", selection: ["Shop#Handler"] },
				},
			],
		}),
	);
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const browser = resources.use(await createAgentBrowser());
	await browser.run([
		"open",
		`${server.base}/?modelA=Shop&modelB=Shop&scopeB=Shop%23Gateway&pane=A`,
	]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-pane="B"] [data-slot="model-reading"][data-scope="Shop#Gateway"]') !== null`,
			),
		Boolean,
		"the addressed canonical panes",
		WAIT,
	);
	await pollUntil(
		() => request<{ panes: { paneId: string }[] }>("/api/panes"),
		(result) => result.body.panes.some((pane) => pane.paneId === "B"),
		"the addressed pane registration",
		WAIT,
	);
	const shown = await request<{ success: boolean }>("/api/panes/show", {
		method: "POST",
		body: { pane: "B", agent: true, reading: { model: "Shop", scope: "Shop#Handler" } },
	});
	if (!shown.body.success) throw new Error(JSON.stringify(shown.body));
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-pane="B"] [data-slot="model-reading"][data-scope="Shop#Handler"]') !== null`,
			),
		Boolean,
		"agent navigation in the named pane",
		WAIT,
	);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-pane="A"] [data-slot="model-reading"]')?.getAttribute('data-scope') ?? null`,
		),
	).toBe("");
	expect(
		await browser.eval<string | null>(`new URLSearchParams(location.search).get('scopeB')`),
	).toBe("Shop#Handler");
	await browser.run(["reload"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-pane="B"] [data-slot="model-reading"][data-scope="Shop#Handler"]') !== null`,
			),
		Boolean,
		"the requested canonical pane after reload",
		WAIT,
	);
	await pollUntil(
		() => request<{ panes: { paneId: string }[] }>("/api/panes"),
		(result) => result.body.panes.some((pane) => pane.paneId === "B"),
		"the restored pane registration",
		WAIT,
	);
	const presented = await request<{ success: boolean }>("/api/browser/show", {
		method: "POST",
		body: { pane: "B", agent: true, reading: { model: "Shop", walkthrough: "Shop#Tour", beat: 1 } },
	});
	if (!presented.body.success) throw new Error(JSON.stringify(presented.body));
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-pane="B"] [data-slot="model-walkthrough"][data-scope="Shop#Gateway"] [data-slot="semantic-presentation"][data-step="1"]') !== null`,
			),
		Boolean,
		"the requested walkthrough beat in the named pane",
		WAIT,
	);
	expect(
		await browser.eval<string>(`new URLSearchParams(location.search).get('pane') ?? 'A'`),
	).toBe("A");
	await browser.run(["click", '[data-pane="B"] [data-slot="semantic-presentation-leave"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector('[data-slot="model-walkthrough"]') === null`),
		Boolean,
		"leaving the requested walkthrough",
		WAIT,
	);
}, 60_000);
