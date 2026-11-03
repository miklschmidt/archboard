// The owner of where to look across the model: a selection reads the code history with no button,
// and one list holds every module with its counts, sorts by each measure, and selects a module on
// its picture, from the keyboard too.

import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { COLUMN_MS } from "@archboard/timing";
import type { ArchitectureModelRead } from "@archboard/model/contract";
import type { RememberedFindings } from "@archboard/code-intel/code-check";
import { browserTestRoots, pollUntil, type AgentBrowserSession } from "./support/agent-browser.ts";
import { fixtureGit } from "./support/canonical-model.ts";
import {
	openAbout,
	openDestination,
	openDiagram,
	pick,
	settledOn,
} from "./support/canonical-page.ts";
import { WAIT, drawn, openReader } from "./support/reader-page.ts";

const ROW = (id: string): string => `[data-measure-row="${id}"]`;

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
 * What the list shows.
 * @param browser The page.
 * @returns How its history stands, and each row with its sorted count.
 */
function list(browser: AgentBrowserSession) {
	return browser.eval<{ history: string | null; rows: (readonly [string, string | null])[] }>(`({
		history: document.querySelector('[data-slot="model-measures"]')?.getAttribute('data-history') ?? null,
		rows: [...document.querySelectorAll('[data-measure-row]')].map((row) => [
			row.getAttribute('data-measure-row'),
			row.querySelector('[data-slot="model-measure-sorted"]')?.firstChild?.textContent ?? null,
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

test("a selection reads the history, and the list shows every module and selects one", async () => {
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
	await openDiagram(browser);
	await pick(browser, "Shop#Worker");
	await pick(browser, "Shop#Gateway");
	expect(await reads(browser)).toBe(1);

	await openDestination(browser, "measures");
	await pollUntil(
		() => list(browser),
		(shown) => shown.history === "read",
		"the list",
		WAIT,
	);
	const byCommits = await list(browser);
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

	await browser.eval(`document.querySelector('[data-slot="model-measure-sort"]').focus()`);
	await browser.run(["press", "Enter"]);
	// A key pressed before the list holds the focus does not reach it.
	await pollUntil(
		() => browser.eval<boolean>(`document.activeElement?.closest('[role="listbox"]') != null`),
		Boolean,
		"the sort choices",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(`(() => {
			const choices = [...document.querySelectorAll('[data-slot="select-content"] [role="option"]')];
			return choices.length > 0 && choices.every((choice) => choice.querySelector('[data-slot="select-description"]')?.textContent);
		})()`),
	).toBe(true);
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
	await browser.run(["press", "ArrowDown"]);
	await browser.run(["press", "Enter"]);
	await pollUntil(
		() => list(browser),
		(shown) => shown.rows[0]?.[1] === "0" && shown.rows.at(-1)?.[1] === null,
		"the list by another measure",
		WAIT,
	);

	expect(
		await browser.eval<{ tabRows: number; columns: number }>(`(() => {
			const rows = [...document.querySelectorAll('[data-measure-row]')];
			const right = (row) => row.querySelector('[data-measure="callers"]')?.getBoundingClientRect().right;
			return {
				tabRows: new Set([...document.querySelectorAll('[data-destination]')].map((tab) => tab.getBoundingClientRect().top)).size,
				columns: new Set(rows.map(right).filter((edge) => edge !== undefined)).size,
			};
		})()`),
	).toEqual({ tabRows: 1, columns: 1 });

	await browser.eval(`document.querySelector('${ROW("Shop#Handler")}').focus()`);
	await browser.run(["press", "Enter"]);
	await settledOn(browser, "Shop#Gateway");
	await drawn(browser);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-details"]')?.getAttribute('data-module-id') === 'Shop#Handler' && document.querySelector('${ROW("Shop#Handler")}')?.getAttribute('aria-selected') === 'true'`,
			),
		Boolean,
		"the module selected on its picture",
		WAIT,
	);
	expect(await reads(browser)).toBe(1);
	await walkWarnings(browser);
});

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
