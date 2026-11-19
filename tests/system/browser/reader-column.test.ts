// The owner of the left column's workflow: a reader finds a module, enters it, walks its
// siblings, folds a section of the one list, opens a flow and adds a pane, and all of it works
// from the keyboard alone.

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
import { seedCanonicalModel } from "./support/canonical-page.ts";
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
 * Click a control that the reading draws after its address changes.
 * @param browser The page.
 * @param selector The control.
 */
async function clickWhenDrawn(browser: AgentBrowserSession, selector: string): Promise<void> {
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector(${JSON.stringify(selector)}) !== null`),
		Boolean,
		selector,
		WAIT,
	);
	await browser.run(["click", selector]);
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
					summary: "The gateway hands a request to the handler.",
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
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.activeElement?.matches('[data-slot="model-find"] input')`),
		Boolean,
		"the palette's input",
		WAIT,
	);
	await browser.run(["keyboard", "type", "decode"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-find-id][aria-selected="true"]') !== null`,
			),
		Boolean,
		"the first thing found",
		WAIT,
	);
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

	// The modules and the flows are sections of one list. A section's head folds its rows away
	// and brings them back, and the keys reach it as a button.
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-slot="model-sections"] [data-column-section]')].map(section => section.getAttribute('data-column-section'))`,
		),
	).toEqual(["modules", "flows"]);
	const modulesHead = '[data-column-section="modules"] [aria-expanded]';
	await browser.run(["focus", modulesHead]);
	await browser.run(["press", "Enter"]);
	await pollUntil(
		() => treeRows(browser),
		(now) => now.length === 0,
		"the folded modules",
		WAIT,
	);
	await browser.run(["press", "Enter"]);
	await pollUntil(
		() => treeRows(browser),
		(now) => now.includes("Shop#Decode"),
		"the modules again",
		WAIT,
	);

	// Flows stay listed while a flow is read, and the representation comes second.
	await clickWhenDrawn(browser, '[data-flow-id="Shop#Request"]');
	await pollUntil(
		() => reading(browser),
		(now) => now.grammar === "sequence",
		"the sequence of the flow",
		WAIT,
	);
	await clickWhenDrawn(browser, '[data-slot="model-grammar-selector"] [data-choice="flowchart"]');
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
	expect(
		await browser.eval<number>(
			`document.querySelectorAll('[data-slot="model-tree"] [aria-current="location"], [data-slot="model-tree"] [aria-selected="true"]').length`,
		),
	).toBe(0);

	// A flow says what it belongs to, in the panel, and no crumb claims it.
	expect(
		await pollUntil(
			() =>
				browser.eval<{ home: string | null; section: boolean; onTrail: boolean }>(`({
			home: document.querySelector('[data-slot="model-flow-home"]')?.textContent ?? null,
			section: document.querySelector('[data-tree-section="Requests"] [data-flow-id="Shop#Request"]') !== null,
			onTrail: document.querySelector('[data-slot="model-breadcrumbs"] [data-slot="model-reading-name"]') !== null,
		})`),
			(now) => now.home?.includes("Requests") === true,
			"the panel to name the flow's section",
			WAIT,
		),
	).toMatchObject({ section: true, onTrail: false });
	await browser.run(["press", "Backspace"]);
	await pollUntil(
		() => reading(browser),
		(now) => now.grammar === "architecture" && now.scope === "Shop#Handler",
		"the structure again",
		WAIT,
	);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="model-tree"] [aria-current="location"]')?.getAttribute('data-module-row') ?? null`,
		),
	).toBe("Shop#Handler");

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
				`document.fullscreenElement !== null && document.activeElement?.closest('button') === null`,
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

test("Code shows the focused pane's addressed file again after a mode or focus change", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "code-address");
	const vault = vaultIn(root);
	const model = await seedCanonicalModel(vault, "Shop", {
		nodes: [
			{
				name: "Gateway",
				kind: "module",
				binding: { repo: "github.com/acme/shop", path: "gateway.ts" },
			},
			{ name: "Handler", kind: "module", parent: "Gateway" },
		],
	});
	initializeSource(root);
	for (const name of ["gateway", "notes", "orders"])
		writeFileSync(join(root, `${name}.ts`), "export {};");
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const browser = resources.use(await createAgentBrowser());
	const search = new URLSearchParams({
		modelA: model.manifest.id,
		modelB: model.manifest.id,
		scopeB: model.modules.find((module) => module.name === "Gateway")!.id,
		fileB: "notes.ts",
		pane: "B",
	});
	await browser.run(["open", `${server.base}/?${search}`]);
	await browser.run(["set", "viewport", "1920", "1080"]);

	const navigator = '[data-slot="navigator-destinations"]';
	const viewer = '[data-slot="code-view"]';
	const switcher = '[data-slot="navigator-mode"]';
	/**
	 * Wait for the focused pane's tree and file to fill their shell slots.
	 * @param pane The focused pane.
	 * @param file Its addressed file.
	 */
	const showsFile = async (pane: string, file: string): Promise<void> => {
		await pollUntil(
			() =>
				browser.eval<string | null>(
					`document.querySelector('${viewer} [data-slot="code-lines"]')?.closest('[data-slot="code-source"]')?.getAttribute('aria-label') ?? null`,
				),
			(label) => label === `Code of ${file}`,
			`pane ${pane}'s file ${file} in the viewer`,
			WAIT,
		);
		expect(
			await browser.eval<number>(
				`document.querySelectorAll('${navigator} [data-slot="code-tree"]').length`,
			),
		).toBe(1);
		expect(
			await browser.eval<number>(
				`document.querySelectorAll('${viewer} [data-slot="code-source"]').length`,
			),
		).toBe(1);
		// The address follows the open file a moment later, so it is waited for too.
		await pollUntil(
			async () =>
				new URLSearchParams(await browser.eval<string>("window.location.search")).get(
					`file${pane}`,
				),
			(addressed) => addressed === file,
			`pane ${pane}'s file ${file} in the address`,
			WAIT,
		);
	};
	/**
	 * Focus a pane through the stage's pointer handler and wait for its tree to take over.
	 * @param pane The pane to focus.
	 */
	const focus = async (pane: string): Promise<void> => {
		const section = `section[aria-label="Pane ${pane}"]`;
		await browser.eval(
			`document.querySelector(${JSON.stringify(section)}).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`,
		);
		await browser.run([
			"wait",
			"--fn",
			`document.querySelector(${JSON.stringify(`${section}[aria-current="true"]`)}) !== null`,
		]);
	};
	await showsFile("B", "notes.ts");
	await browser.run(["click", `${switcher} [data-choice="architecture"]`]);
	await browser.run(["wait", "--fn", `!document.querySelector('${viewer}')`]);
	expect(
		new URLSearchParams(await browser.eval<string>("window.location.search")).get("fileB"),
	).toBe("notes.ts");
	await browser.run(["click", `${switcher} [data-choice="code"]`]);
	await showsFile("B", "notes.ts");
	await focus("A");
	const orderRow = `document.querySelector('[data-slot="code-tree"]')?.shadowRoot?.querySelector('[data-item-path="orders.ts"]')`;
	await browser.run(["wait", "--fn", `Boolean(${orderRow})`]);
	await browser.eval(`${orderRow}.click()`);
	await showsFile("A", "orders.ts");
	await focus("B");
	await showsFile("B", "notes.ts");

	const handle = '[role="separator"][aria-label="Code view width"]';
	const { x, y } = await browser.eval<{ x: number; y: number }>(`(() => {
		const box = document.querySelector('${handle}').getBoundingClientRect();
		return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
	})()`);
	await browser.run(["mouse", "move", String(x), String(y)]);
	await browser.run(["mouse", "down", "left"]);
	await browser.run(["mouse", "move", String(x - 500), String(y)]);
	await browser.run(["mouse", "up", "left"]);
	await browser.run(["wait", `${switcher} [data-choice="architecture"][aria-pressed="true"]`]);
	await browser.run(["wait", "--fn", `!document.querySelector('${viewer}')`]);
	expect(await browser.eval<string>("localStorage.getItem('archboard.navigator.mode')")).toBe(
		"architecture",
	);
	expect(await browser.eval<string>("new URLSearchParams(location.search).get('fileB')")).toBe(
		"notes.ts",
	);
}, 45_000);
