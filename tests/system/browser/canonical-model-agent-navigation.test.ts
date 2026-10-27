import { expect, test } from "bun:test";
import { cpSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startOwnedServer } from "../support/owned-server.ts";
import { holderOf, vaultIn } from "../support/test-vault.ts";
import { createJsonRequester } from "../support/http.ts";
import {
	browserTestRoots,
	serverTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	runServerCli,
} from "./support/agent-browser.ts";
import { serverPath } from "./support/navigator-support.ts";
import { initializeSource } from "./support/canonical-model.ts";

import { startVoiceServer } from "./support/voice-box-page.ts";
import { seedCanonicalModel, modelAddress } from "./support/canonical-page.ts";

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

test("repository filtering opens canonical roots by keyboard and in the other pane", async () => {
	await using resources = new AsyncDisposableStack();
	const { server } = await startVoiceServer(resources, "shop");
	const shop = await seedCanonicalModel(server.vault, "Storefront");
	const ordersVault = vaultIn(join(browserTestRoots().ownerRoot, "orders"));
	const orders = await seedCanonicalModel(ordersVault, "Orders");
	runServerCli(server, ["repo", "add", holderOf(ordersVault)]);
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${modelAddress(server.base, shop)}&repoA=shop`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	const request = createJsonRequester(server);
	await pollUntil(
		() => request<{ panes: { paneId: string }[] }>("/api/panes"),
		(result) => result.body.panes.some((pane) => pane.paneId === "A"),
		"the repository navigator's registered pane",
		WAIT,
	);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="repository-model-open"][title="Open Orders"]') !== null`,
			),
		Boolean,
		"both repository readings",
		WAIT,
	);
	await browser.run(["fill", 'input[aria-label="Find a repository"]', "orders"]);
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="navigator"] output')?.textContent ?? ''`,
		),
	).toBe("1/2");
	await browser.run(["press", "Enter"]);
	await pollUntil(
		() => browser.eval<string | null>(`new URLSearchParams(location.search).get('modelA')`),
		(id) => id === orders.manifest.id,
		"the first matching repository opened by Enter",
		WAIT,
	);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[role="treeitem"][aria-selected="true"]')?.getAttribute('data-row-id') ?? null`,
			),
		(id) => id === "repository:orders",
		"the active repository selected in the navigator",
		WAIT,
	);
	await browser.run(["fill", 'input[aria-label="Find a repository"]', "shop"]);
	await browser.run(["press", "Alt+Enter"]);
	await pollUntil(
		() => browser.eval<string | null>(`new URLSearchParams(location.search).get('modelB')`),
		(id) => id === shop.manifest.id,
		"the other repository in a new adjacent pane",
		WAIT,
	);
	expect(
		await browser.eval<string | null>(`new URLSearchParams(location.search).get('modelA')`),
	).toBe(orders.manifest.id);
	expect(
		await browser.eval<string>(`new URLSearchParams(location.search).get('pane') ?? 'A'`),
	).toBe("A");
	await browser.run(["fill", 'input[aria-label="Find a repository"]', "orders"]);
	await browser.run(["press", "ArrowDown"]);
	await browser.run(["press", "Alt+Enter"]);
	await pollUntil(
		() => browser.eval<string | null>(`new URLSearchParams(location.search).get('modelB')`),
		(id) => id === orders.manifest.id,
		"the focused repository row opened beside",
		WAIT,
	);
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-row-id="repository:orders"] [data-pane-letter]')].map(node => node.getAttribute('data-pane-letter'))`,
		),
	).toEqual(["A", "B"]);
	expect(await browser.run(["errors"])).toBe("");
}, 60_000);
