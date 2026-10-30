// The owner of the left column's workflow: a reader finds a module, enters it, walks its
// siblings, opens a flow and adds a pane, and all of it works from the keyboard alone.

import { expect, test } from "bun:test";
import { cpSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import {
	browserTestRoots,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	serverTestEnvironment,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { initializeSource } from "./support/canonical-model.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 10_000 } as const;

/**
 * One more module for the fixture.
 * @param vault The vault.
 * @param name Its name, which also names its identity and its file.
 * @param parent The module that holds it.
 */
function addModule(vault: string, name: string, parent: string): void {
	writeFileSync(
		join(vault, `${name.toLowerCase()}.module.json`),
		JSON.stringify({
			schemaVersion: 1,
			id: `Shop#${name}`,
			name,
			kind: "module",
			parent,
			order: 40,
			outgoing: [],
		}),
	);
}

/**
 * What the reader reads now.
 * @param browser The page.
 * @returns The open module and the grammar.
 */
function reading(browser: AgentBrowserSession) {
	return browser.eval<{ scope: string | null; grammar: string | null }>(`(() => {
		const reading = document.querySelector('[data-slot="model-reading"]');
		return { scope: reading?.getAttribute('data-scope') ?? null, grammar: reading?.getAttribute('data-grammar') ?? null };
	})()`);
}

/**
 * Wait for a scope to be read.
 * @param browser The page.
 * @param scope The module, or nothing for the roots.
 */
async function reads(browser: AgentBrowserSession, scope: string): Promise<void> {
	await pollUntil(
		() => reading(browser),
		(now) => now.scope === scope,
		`the reading of ${scope}`,
		WAIT,
	);
}

/**
 * The module rows of the tree.
 * @param browser The page.
 * @returns The modules the rows open, in order.
 */
function treeRows(browser: AgentBrowserSession) {
	return browser.eval<string[]>(
		`[...document.querySelectorAll('[data-slot="model-tree"] [data-module-row]')].map(row => row.getAttribute('data-module-row'))`,
	);
}

test("every move of the left column has a keyboard route, also in a presented pane", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "reader-column");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	addModule(vault, "Decode", "Shop#Handler");
	addModule(vault, "Encode", "Shop#Handler");
	addModule(vault, "Sibling", "Shop#Gateway");
	writeFileSync(
		join(vault, "requests.flows.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Behavior",
			name: "Requests",
			flows: [
				{
					id: "Shop#Request",
					name: "Handle request",
					participants: ["Shop#Gateway", "Shop#Handler"],
					steps: [
						{
							id: "Shop#Invoke",
							from: "Shop#Gateway",
							to: "Shop#Handler",
							kind: "sync",
							label: "Handle",
						},
					],
				},
			],
		}),
	);
	initializeSource(root);
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", server.base]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => treeRows(browser),
		(rows) => rows.includes("Shop#Gateway"),
		"the tree of the roots",
		WAIT,
	);

	// Find selects, and Enter enters what it selected.
	await browser.run(["press", "Control+k"]);
	await browser.run(["keyboard", "type", "decode"]);
	await browser.run(["press", "Enter"]);
	await reads(browser, "Shop#Handler");
	await browser.run(["press", "Enter"]);
	await reads(browser, "Shop#Decode");

	// The tree opens the path to the open module and lights its row.
	const rows = await treeRows(browser);
	expect(rows).toEqual(
		expect.arrayContaining(["Shop#Gateway", "Shop#Handler", "Shop#Decode", "Shop#Encode"]),
	);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="model-tree"] [aria-current="location"]')?.getAttribute('data-module-row') ?? null`,
		),
	).toBe("Shop#Decode");

	// The siblings, and up.
	await browser.run(["press", "]"]);
	await reads(browser, "Shop#Encode");
	await browser.run(["press", "["]);
	await reads(browser, "Shop#Decode");
	await browser.run(["press", "Backspace"]);
	await reads(browser, "Shop#Handler");

	// Flows stay listed while a flow is read, and the representation comes second.
	await browser.run(["click", '[data-destination="flows"]']);
	await browser.run(["click", '[data-flow-id="Shop#Request"]']);
	await pollUntil(
		() => reading(browser),
		(now) => now.grammar === "sequence",
		"the sequence of the flow",
		WAIT,
	);
	await browser.run(["click", '[data-slot="model-grammar-selector"] [data-choice="flowchart"]']);
	await pollUntil(
		() => reading(browser),
		(now) => now.grammar === "flowchart",
		"the flowchart of the flow",
		WAIT,
	);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-flow-id="Shop#Request"]')?.getAttribute('aria-current') ?? null`,
		),
	).toBe("location");
	await browser.run(["press", "Backspace"]);
	await pollUntil(
		() => reading(browser),
		(now) => now.grammar === "architecture" && now.scope === "Shop#Handler",
		"the structure again",
		WAIT,
	);

	// A second pane opens the repository in front of the reader, and the column follows focus.
	const repository = await browser.eval<string | null>(
		`document.querySelector('[data-slot="repository-switcher"]')?.getAttribute('title') ?? null`,
	);
	await browser.run(["click", '[aria-label="Open a second pane"]']);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="repository-switcher"]')?.getAttribute('title') ?? null`,
			),
		(name) => name === repository,
		"the second pane in the same repository",
		WAIT,
	);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-pane="B"] [data-slot="model-reading"]')?.getAttribute('data-scope') === '' && document.querySelector('[data-slot="model-tree"] [aria-current="location"]') === null`,
			),
		Boolean,
		"a column that speaks for the new pane",
		WAIT,
	);
	await browser.run(["click", '[aria-label="Close pane B"]']);
	await reads(browser, "Shop#Handler");

	// A presented pane has no tree, so the same keys reach every card: Enter selects the
	// first card, `]` the next, and Enter opens it.
	await browser.run(["press", "Backspace"]);
	await reads(browser, "Shop#Gateway");
	await browser.run(["press", "Backspace"]);
	await reads(browser, "");
	await browser.run(["click", '[aria-label="Present fullscreen"]']);
	await pollUntil(
		// Enter belongs to a button while the button still has focus.
		() =>
			browser.eval<boolean>(
				`document.fullscreenElement !== null && document.activeElement === document.body`,
			),
		Boolean,
		"the presented pane",
		WAIT,
	);
	await browser.run(["press", "Enter"]);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="model-selection-count"]')?.getAttribute('data-count') ?? null`,
			),
		(count) => count === "1",
		"the first card selected",
		WAIT,
	);
	await browser.run(["press", "Enter"]);
	await reads(browser, "Shop#Gateway");
	await browser.run(["press", "Backspace"]);
	await reads(browser, "");
	expect(await browser.run(["errors"])).toBe("");
}, 60_000);
