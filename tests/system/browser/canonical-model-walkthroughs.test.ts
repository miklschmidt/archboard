import { openModelSidebar } from "./support/canonical-page.ts";
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
import { initializeSource } from "./support/canonical-model.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 10_000 } as const;

async function beat(browser: AgentBrowserSession, index: number, grammar: string): Promise<void> {
	await pollUntil(
		() =>
			browser.eval<boolean>(`(() => {
			const surface = document.querySelector('[data-slot="model-walkthrough"]');
			const heading = surface?.querySelector('[data-slot="semantic-presentation-heading"]');
			return heading != null && getComputedStyle(heading).opacity === "1" && surface?.getAttribute('data-grammar') === '${grammar}' &&
				surface?.querySelector('[data-slot="semantic-presentation"]')?.getAttribute('data-step') === '${index}' &&
				surface?.querySelector('[data-slot="model-diagram"] svg') !== null;
		})()`),
		Boolean,
		`walkthrough beat ${index}`,
		WAIT,
	);
}

async function selected(browser: AgentBrowserSession): Promise<string[]> {
	return browser.eval<string[]>(
		`[...new Set([...document.querySelectorAll('[data-slot="model-walkthrough"] [data-semantic-id].is-selected')].map(node => node.getAttribute('data-semantic-id')))]`,
	);
}

test("walkthrough beats change readings while one revision stays captured until restart", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "model-walkthrough");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	initializeSource(root);
	writeFileSync(
		join(vault, "request.flows.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Requests",
			name: "Requests",
			flows: [
				{
					id: "Shop#Request",
					name: "Handle request",
					participants: ["Shop#Gateway", "Shop#Handler", "Shop#Worker"],
					steps: [
						{
							id: "Shop#Invoke",
							from: "Shop#Gateway",
							to: "Shop#Handler",
							kind: "sync",
							label: "Handle",
						},
						{
							id: "Shop#Send",
							from: "Shop#Handler",
							to: "Shop#Worker",
							kind: "async",
							label: "Dispatch",
						},
					],
				},
			],
		}),
	);
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
					title: "The services",
					narrative: "Start at the service boundary.",
					reading: { grammar: "architecture", selection: ["Shop#Gateway"] },
				},
				{
					id: "Shop#Inside",
					title: "The handler",
					narrative: "Open the gateway implementation.",
					reading: {
						grammar: "architecture",
						scope: "Shop#Gateway",
						focus: ["Shop#Handler"],
						selection: ["Shop#Handler"],
						filters: { relationships: ["call"], groups: ["public"] },
					},
				},
				{
					id: "Shop#Seq",
					title: "One request",
					narrative: "Follow the ordered messages.",
					reading: { grammar: "sequence", flow: "Shop#Request", selection: ["Shop#Send"] },
				},
				{
					id: "Shop#Flow",
					title: "The path",
					narrative: "Read the same authored behavior as a flowchart.",
					reading: { grammar: "flowchart", flow: "Shop#Request" },
				},
				{
					id: "Shop#Lost",
					title: "Missing detail",
					narrative: "This part is unavailable.",
					reading: { grammar: "architecture", scope: "Shop#Gone" },
				},
				{
					id: "Shop#End",
					title: "Back outside",
					narrative: "Return to the repository roots.",
					reading: { grammar: "architecture" },
				},
			],
		}),
	);
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const initial = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!initial.body.success) throw new Error(initial.body.error);
	const browser = resources.use(await createAgentBrowser());
	const address = new URL(server.base);
	address.searchParams.set("modelA", "Shop");
	address.searchParams.set("scopeA", "Shop#Gateway");
	await browser.run(["open", address.href]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector('[data-slot="model-walkthroughs"]') !== null`),
		Boolean,
		"available walkthroughs",
		WAIT,
	);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-list"] [data-module-id="Shop#Handler"]') !== null`,
			),
		Boolean,
		"the original handler selection",
		WAIT,
	);
	await openModelSidebar(browser);
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Handler"]']);
	await openModelSidebar(browser);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`(() => { const item = document.querySelector('[data-walkthrough-id="Shop#Tour"]'); return item !== null && item.getBoundingClientRect().height > 0; })()`,
			),
		Boolean,
		"the walkthrough choice",
		WAIT,
	);
	await browser.run(["click", '[data-walkthrough-id="Shop#Tour"]']);
	await beat(browser, 0, "architecture");
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="semantic-sidebar-toggle"]')?.getAttribute('aria-disabled') ?? null`,
		),
	).toBe("true");
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="semantic-sidebar-toggle"]')?.getAttribute('aria-expanded') ?? null`,
		),
	).toBe("false");
	expect(await selected(browser)).toContain("Shop#Gateway");
	expect(
		await browser.eval<number>(
			`[...document.querySelectorAll('[data-walkthrough-id]')].filter(node => node.checkVisibility()).length`,
		),
	).toBe(0);
	const revision = await browser.eval<string>(
		`document.querySelector('[data-slot="model-walkthrough"]').getAttribute('data-revision')`,
	);
	const reported = await pollUntil(
		async () => (await (await fetch(`${server.base}/api/panes`)).json()).panes[0],
		(pane) => pane?.architecture?.selection?.walkthrough === "Shop#Tour",
		"the captured walkthrough in the pane report",
		WAIT,
	);
	expect(reported).toMatchObject({
		board: null,
		architecture: {
			model: "Shop",
			expectedRevision: revision,
			expectedSourceRevision: revision,
			subjects: ["Shop#Gateway"],
			selection: { walkthrough: "Shop#Tour" },
			reading: { grammar: "architecture" },
		},
	});
	const gatewayFile = join(vault, "gateway.module.json");
	const gateway = JSON.parse(readFileSync(gatewayFile, "utf8")) as Record<string, unknown>;
	writeFileSync(gatewayFile, JSON.stringify({ ...gateway, name: "Updated gateway" }));
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-walkthrough-restart"]') !== null`,
			),
		Boolean,
		"an explicit newer-revision choice",
		WAIT,
	);
	await browser.run(["click", '[data-slot="semantic-presentation-next"]']);
	await beat(browser, 1, "architecture");
	expect(await selected(browser)).toContain("Shop#Handler");
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="model-walkthrough"]').getAttribute('data-scope')`,
		),
	).toBe("Shop#Gateway");
	await browser.run(["click", '[data-slot="semantic-presentation-next"]']);
	await beat(browser, 2, "sequence");
	expect(await selected(browser)).toContain("Shop#Send");
	await browser.run(["click", '[data-slot="semantic-presentation-next"]']);
	await beat(browser, 3, "flowchart");
	expect(await selected(browser)).toEqual([]);
	await browser.run(["click", '[data-slot="semantic-presentation-next"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-walkthrough-unavailable"]') !== null`,
			),
		Boolean,
		"the unavailable beat",
		WAIT,
	);
	expect(
		await browser.eval<number>(
			`document.querySelectorAll('[data-slot="model-walkthrough"] [data-slot="model-diagram"]').length`,
		),
	).toBe(0);
	await browser.run(["click", '[data-slot="semantic-presentation-next"]']);
	await beat(browser, 5, "architecture");
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="semantic-presentation-heading"]').textContent`,
		),
	).toBe("Back outside");

	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="model-walkthrough"]').getAttribute('data-revision')`,
		),
	).toBe(revision);
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="model-walkthrough"]').getAttribute('data-scope')`,
		),
	).toBe("");
	await browser.run(["click", '[data-slot="model-walkthrough-restart"]']);
	await beat(browser, 0, "architecture");
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="model-walkthrough"]').getAttribute('data-revision')`,
		),
	).not.toBe(revision);
	await browser.run(["click", '[data-slot="semantic-presentation-leave"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-walkthrough"]') === null && document.querySelector('[data-slot="model-reading"][data-scope="Shop#Gateway"]') !== null`,
			),
		Boolean,
		"the original scope",
		WAIT,
	);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="semantic-sidebar-toggle"]')?.getAttribute('aria-disabled') ?? null`,
		),
	).toBeNull();
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="semantic-sidebar-toggle"]')?.getAttribute('aria-expanded') ?? null`,
		),
	).toBe("true");
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="model-selection-count"]').getAttribute('data-count')`,
		),
	).toBe("1");
	const after = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!after.body.success) throw new Error(after.body.error);
	expect(after.body.walkthroughs).toEqual(initial.body.walkthroughs);
}, 60_000);
