// The owner of a trace in the reader: each further hop lights more faintly, across the doors too,
// and a trace goes with the pick.

import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pollUntil, type AgentBrowserSession } from "./support/agent-browser.ts";
import { pick, settledOn } from "./support/canonical-page.ts";
import { WAIT, drawn, openReader } from "./support/reader-page.ts";

/**
 * Write one module of the trace's model.
 * @param vault The vault.
 * @param name Its local identity.
 * @param parent What holds it.
 * @param sends Where its relationships go.
 */
function writeModule(
	vault: string,
	name: string,
	parent: string | undefined,
	sends: readonly string[],
): void {
	writeFileSync(
		join(vault, `${name.toLowerCase()}.module.json`),
		JSON.stringify({
			schemaVersion: 1,
			id: `Shop#${name}`,
			name,
			kind: "module",
			...(parent === undefined ? {} : { parent: `Shop#${parent}` }),
			order: 50,
			outgoing: sends.map((to) => ({
				id: `Shop#${name.slice(0, 4)}${to.slice(0, 4)}`,
				to: `Shop#${to}`,
				kind: "call",
				order: 10,
			})),
		}),
	);
}

/**
 * How the picture grades the cards and the lines it lit, with how much ink each keeps.
 * @param browser The page.
 * @returns The grade of each graded subject, and the opacity of each card asked for.
 */
function grades(browser: AgentBrowserSession) {
	return browser.eval<{
		graded: Record<string, string>;
		ink: { Near: number; Far: number; Back: number };
	}>(`(() => {
		const marks = [...document.querySelectorAll('[data-slot="model-diagram"] [data-semantic-id][class*="is-reach-"]')];
		const ink = (id) => {
			const card = document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#' + id + '"]');
			return Number(/opacity\\(([\\d.]+)\\)/.exec(getComputedStyle(card).filter)?.[1] ?? 1);
		};
		return {
			graded: Object.fromEntries(marks.map((one) => [one.getAttribute('data-semantic-id'), [...one.classList].find((name) => name.startsWith('is-reach-'))])),
			ink: { Near: ink('Near'), Far: ink('Far'), Back: ink('Back') },
		};
	})()`);
}

/**
 * Press a trace of the selected module.
 * @param browser The page.
 * @param way Onward or back.
 */
async function trace(browser: AgentBrowserSession, way: "onward" | "back"): Promise<void> {
	await browser.run(["click", `[data-slot="semantic-inspector-trace"][data-way="${way}"]`]);
}

test("a trace grades each further hop across the doors, and goes with the pick", async () => {
	await using resources = new AsyncDisposableStack();
	const browser = await openReader(resources, "reader-trace", (vault) => {
		// Front reaches Back through two doors and a module the picture leaves out. The last hop also
		// names Hub as a whole, which is all that reaches Spare.
		writeModule(vault, "Hub", undefined, []);
		writeModule(vault, "Front", "Hub", ["Near"]);
		writeModule(vault, "Back", "Hub", []);
		writeModule(vault, "Spare", "Hub", []);
		writeModule(vault, "Near", undefined, []);
		writeModule(vault, "Inner", "Near", ["Mid"]);
		writeModule(vault, "Mid", undefined, []);
		writeModule(vault, "Part", "Mid", ["Far"]);
		writeModule(vault, "Far", undefined, ["Back", "Hub"]);
	});
	await browser.run(["click", '[data-module-row="Shop#Hub"]']);
	await settledOn(browser, "Shop#Hub");
	await drawn(browser);

	await pick(browser, "Shop#Front");
	await trace(browser, "onward");
	const fromFront = await pollUntil(
		() => grades(browser),
		(now) => now.graded["Shop#Back"] === "is-reach-4" && now.ink.Back < now.ink.Far,
		"the hops of a trace onward",
		WAIT,
	);
	expect(fromFront.graded).toMatchObject({
		"Shop#Far": "is-reach-3",
		"Shop#Spare": "is-reach-4",
		"Shop#FarBack": "is-reach-4",
	});
	expect(fromFront.ink.Near).toBe(1);
	expect(fromFront.ink.Far).toBeLessThan(1);

	// Asking again takes it back.
	await trace(browser, "onward");
	await pollUntil(
		() => grades(browser),
		(now) => Object.keys(now.graded).length === 0,
		"a trace taken back",
		WAIT,
	);

	// Back is the same walk in reverse, and another pick is another part.
	await pick(browser, "Shop#Back");
	await trace(browser, "back");
	await pollUntil(
		() => grades(browser),
		(now) =>
			now.graded["Shop#Near"] === "is-reach-3" &&
			now.graded["Shop#Front"] === "is-reach-4" &&
			now.graded["Shop#Far"] === undefined,
		"the hops of a trace back",
		WAIT,
	);
	await pick(browser, "Shop#Front");
	await pollUntil(
		() => grades(browser),
		(now) => Object.keys(now.graded).length === 0,
		"a trace gone with its pick",
		WAIT,
	);
	expect(await browser.run(["errors"])).toBe("");
}, 60_000);
