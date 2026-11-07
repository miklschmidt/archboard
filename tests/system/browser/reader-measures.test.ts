// The owner of where to look across the model: a selection reads the code history with no button,
// and the Measures dialog shows each of its views from its selector. A table holds every module
// with its counts, sorts from its column heads and selects a module on its picture, from the
// keyboard too, and the findings walk one at a time and select each subject.

import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { COLUMN_MS } from "@archboard/timing";
import type { ArchitectureModelRead } from "@archboard/model/contract";
import type { RememberedFindings } from "@archboard/code-intel/code-check";
import { browserTestRoots, pollUntil, type AgentBrowserSession } from "./support/agent-browser.ts";
import { fixtureGit } from "./support/canonical-model.ts";
import { openAbout, pick, settledOn } from "./support/canonical-page.ts";
import { WAIT, drawn, openReader } from "./support/reader-page.ts";

const ROW = (id: string): string => `[data-measure-row="${id}"]`;
const DIALOG = '[data-slot="model-measures-dialog"]';

/**
 * Open the Measures dialog on one of its views, from the key in the column.
 * @param browser The page.
 * @param view The view.
 */
async function openMeasures(
	browser: AgentBrowserSession,
	view: "code" | "interface" | "changes",
): Promise<void> {
	await browser.run(["click", '[data-column-dialog="measures"]']);
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('${DIALOG}') !== null`),
		Boolean,
		"the Measures dialog",
		WAIT,
	);
	await browser.run(["click", `[data-measures-tab="${view}"]`]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-measures-tab="${view}"]')?.getAttribute('aria-selected') === 'true'`,
			),
		Boolean,
		`the ${view} view`,
		WAIT,
	);
}

/**
 * How many times the page asked for the code history.
 * @param browser The page.
 * @returns The count.
 */
function reads(browser: AgentBrowserSession): Promise<number> {
	return browser.eval<number>(
		`performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/api/architecture/locality')).length`,
	);
}

/**
 * What the open table shows.
 * @param browser The page.
 * @returns How its history stands, and each row with its sorted count.
 */
function list(browser: AgentBrowserSession) {
	return browser.eval<{ history: string | null; rows: (readonly [string, string | null])[] }>(`({
		history: document.querySelector('[data-slot="model-measures"]')?.getAttribute('data-history') ?? null,
		rows: [...document.querySelectorAll('[data-measure-row]')].map((row) => [
			row.getAttribute('data-measure-row'),
			row.querySelector('[data-sorted]')?.textContent ?? null,
		]),
	})`);
}

/**
 * Commit a change of the file that the fixture's Gateway binds.
 * @param root The repository.
 * @param times How many commits.
 */
function commitCode(root: string, times: number): void {
	mkdirSync(join(root, "src"), { recursive: true });
	for (let time = 1; time <= times; time += 1) {
		writeFileSync(join(root, "src/gateway.ts"), `export const gateway = ${time};\n`);
		fixtureGit(root, "add", "src/gateway.ts");
		fixtureGit(root, "commit", "--quiet", "-m", `Change ${time}`);
	}
}

test("a selection reads the history, and the Measures dialog shows every module and selects one", async () => {
	await using resources = new AsyncDisposableStack();
	const browser = await openReader(resources, "measures", () => undefined);
	commitCode(join(browserTestRoots().ownerRoot, "measures"), 2);

	await pick(browser, "Shop#Gateway");
	await pollUntil(
		() => reads(browser),
		(count) => count === 1,
		"the read of a selection",
		WAIT,
	);
	await openAbout(browser, "selection");
	await pollUntil(
		() =>
			browser.eval<number>(
				`document.querySelectorAll('[data-slot="semantic-inspector-commit-list"] [data-commit]').length`,
			),
		(commits) => commits === 2,
		"the history on About with no button",
		WAIT,
	);
	await openMeasures(browser, "interface");
	await browser.eval(`document.querySelector('${ROW("Shop#Gateway")} button').focus()`);
	await browser.run(["press", "Enter"]);
	await pollUntil(
		() =>
			browser.eval<{ dialog: boolean; about: boolean; focus: string | null }>(
				`({ dialog: document.querySelector('${DIALOG}') !== null, about: document.querySelector('[data-slot="model-about"]') !== null, focus: document.activeElement?.getAttribute('data-slot') })`,
			),
		(state) => !state.dialog && !state.about && state.focus === "model-diagram",
		"the chosen module on its picture after leaving About",
		WAIT,
	);
	await pick(browser, "Shop#Worker");
	await pick(browser, "Shop#Gateway");
	expect(await reads(browser)).toBe(1);

	await openMeasures(browser, "changes");
	await pollUntil(
		() => list(browser),
		(shown) => shown.history === "read",
		"the table",
		WAIT,
	);
	await browser.run(["click", '[data-measure-head="commits"]']);
	const byCommits = await pollUntil(
		() => list(browser),
		(shown) => shown.rows[0]?.[1] === "2",
		"the table by its commits",
		WAIT,
	);
	expect(byCommits.rows.map(([id]) => id).toSorted()).toEqual([
		"Shop#Gateway",
		"Shop#Handler",
		"Shop#Worker",
	]);
	expect(byCommits.rows[0]).toEqual(["Shop#Gateway", "2"]);
	expect(await reads(browser)).toBe(1);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('${ROW("Shop#Worker")} [data-not-read]')?.getAttribute('data-not-read') ?? null`,
		),
	).toBe("unbound");

	await openView(browser, "interface");
	await browser.eval(`document.querySelector('[data-slot="model-measure-show"]').focus()`);
	await browser.run(["press", "Enter"]);
	// A key pressed before the list holds the focus does not reach it.
	await pollUntil(
		() => browser.eval<boolean>(`document.activeElement?.closest('[role="listbox"]') != null`),
		Boolean,
		"the choices of what is on show",
		WAIT,
	);
	// Base UI holds the transition off for the first frame of an open popover.
	await pollUntil(
		() =>
			browser.eval<string>(
				`getComputedStyle(document.querySelector('[data-slot="select-content"]')).transitionDuration`,
			),
		(eases) => eases === `${COLUMN_MS.popoverIn / 1000}s, ${COLUMN_MS.popoverIn / 1000}s`,
		"the popover to ease for its duration",
		WAIT,
	);
	await browser.run(["press", "ArrowDown"]);
	await browser.run(["press", "Enter"]);
	await pollUntil(
		() => list(browser),
		(shown) => shown.rows.length === 1 && shown.rows[0]?.[0] === "Shop#Gateway",
		"only the module with parts",
		WAIT,
	);
	await browser.eval(`document.querySelector('[data-slot="model-measure-show"]').focus()`);
	await browser.run(["press", "Enter"]);
	await pollUntil(
		() => browser.eval<boolean>(`document.activeElement?.closest('[role="listbox"]') != null`),
		Boolean,
		"the choices again",
		WAIT,
	);
	await browser.run(["press", "Home"]);
	await browser.run(["press", "Enter"]);
	await pollUntil(
		() => list(browser),
		(shown) => shown.rows.length === 3,
		"every module again",
		WAIT,
	);

	await browser.eval(`document.querySelector('${ROW("Shop#Gateway")} button').focus()`);
	await browser.run(["press", "End"]);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.activeElement?.closest('[data-measure-row]')?.getAttribute('data-measure-row') ?? null`,
			),
		(row) => row !== "Shop#Gateway" && row !== null,
		"the keys to walk the rows",
		WAIT,
	);
	await browser.eval(`document.querySelector('${ROW("Shop#Handler")} button').focus()`);
	await browser.run(["press", "Enter"]);
	await settledOn(browser, "Shop#Gateway");
	await drawn(browser);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('${DIALOG}') === null && document.querySelector('[data-slot="module-details"]')?.getAttribute('data-module-id') === 'Shop#Handler' && document.activeElement?.getAttribute('data-slot') === 'model-diagram'`,
			),
		Boolean,
		"the module selected on its picture, with the keys there",
		WAIT,
	);
	await openMeasures(browser, "interface");
	expect(
		await browser.eval<string | null>(
			`document.querySelector('${ROW("Shop#Handler")} button')?.getAttribute('aria-current') ?? null`,
		),
	).toBe("true");
	await browser.run(["press", "Escape"]);
	expect(await reads(browser)).toBe(1);
	await walkWarnings(browser);
	await pageFindings(browser);
});

/**
 * Choose another view of the open dialog.
 * @param browser The page.
 * @param view The view.
 */
async function openView(
	browser: AgentBrowserSession,
	view: "code" | "interface" | "changes",
): Promise<void> {
	await browser.run(["click", `[data-measures-tab="${view}"]`]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-measures-tab="${view}"]')?.getAttribute('aria-selected') === 'true'`,
			),
		Boolean,
		`the ${view} view`,
		WAIT,
	);
}

/**
 * The findings of the dialog walk one at a time, and each step selects its subject.
 * @param browser The reader, with the findings of walkWarnings remembered.
 */
async function pageFindings(browser: AgentBrowserSession): Promise<void> {
	await openMeasures(browser, "code");
	const position = `document.querySelector('[data-slot="code-evidence-position"]')?.textContent`;
	await pollUntil(
		() => browser.eval<string | null>(`${position} ?? null`),
		(shown) => shown === "1 of 2",
		"the first finding",
		WAIT,
	);
	for (const [id, at] of [
		["Shop#Worker", "2 of 2"],
		["Shop#Handler", "1 of 2"],
	] as const) {
		await browser.run(["click", '[data-slot="code-evidence-next"]']);
		await pollUntil(
			() =>
				browser.eval<string>(
					`${position} + ' ' + document.querySelector('[data-slot="module-details"]')?.getAttribute('data-module-id')`,
				),
			(shown) => shown === `${at} ${id}`,
			"the next finding and its subject",
			WAIT,
		);
	}
	expect(
		await browser.eval<string | null>(`document.activeElement?.getAttribute('data-slot') ?? null`),
	).toBe("code-evidence-next");
	await browser.run(["press", "Escape"]);
}

/**
 * A warning cycle survives selection and a move to another scope.
 * @param browser The reader.
 */
async function walkWarnings(browser: AgentBrowserSession): Promise<void> {
	const vault = join(browserTestRoots().ownerRoot, "measures", ".archboard", "vault");
	const base = await browser.eval<string>("location.origin");
	const model: ArchitectureModelRead = await (
		await fetch(`${base}/api/architecture/model?${new URLSearchParams({ vault })}`)
	).json();
	if (!model.success) throw new Error(JSON.stringify(model));
	const remembered: RememberedFindings = {
		readings: [],
		models: [
			{
				model: model.manifest.id,
				state: model.selectedState?.id ?? null,
				revision: model.revision,
				checkedAt: "2026-11-01T12:00:00.000Z",
				findings: ["Shop#Handler", "Shop#Worker"].map((id) => ({
					code: "BINDING_SYMBOL_MISSING",
					severity: "warning",
					file: "module.json",
					path: "binding.symbol",
					subject: { kind: "node", id, name: id },
					message: `Missing symbol for ${id}`,
				})),
			},
		],
	};
	await browser.run([
		"network",
		"route",
		"**/api/vault/code-findings*",
		"--body",
		JSON.stringify({ success: true, ...remembered }),
	]);
	const warning = '[data-slot="model-panel"] [data-slot="code-warning-count"]';
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('${warning}')?.matches(':enabled')`),
		Boolean,
		"the model's warnings",
		WAIT,
	);
	await browser.run(["click", '[data-slot="semantic-selection-clear"]']);
	for (const id of ["Shop#Handler", "Shop#Worker", "Shop#Handler"]) {
		await browser.run(["click", warning]);
		await pollUntil(
			() =>
				browser.eval<string | null>(
					`document.querySelector('[data-slot="model-panel"] [data-slot="module-details"]')?.getAttribute('data-module-id') ?? null`,
				),
			(selected) => selected === id,
			"the next warned module",
			WAIT,
		);
		await drawn(browser);
	}
}
