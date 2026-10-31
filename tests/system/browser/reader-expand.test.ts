// The owner of a door's second action: expand opens its module in the same picture, the address
// holds that, and the frame's tab or the keyboard takes it back.

import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pollUntil, type AgentBrowserSession } from "./support/agent-browser.ts";
import { settledOn } from "./support/canonical-page.ts";
import { WAIT, drawn, openReader } from "./support/reader-page.ts";

const WORKER = "Shop#Worker";
const QUEUE = "Shop#Queue";
const CARD = `[data-slot="model-diagram"] [data-semantic-id="${QUEUE}"]`;
const ROW = `[data-slot="model-panel-expanded"] [data-frame="${WORKER}"]`;

/**
 * What a reading of the gateway says of the worker.
 * @param browser The page.
 * @returns The worker's control, whether its part is drawn, and what the address and the panel hold.
 */
function worker(browser: AgentBrowserSession) {
	return browser.eval<{
		toggle: string | null;
		part: boolean;
		address: string | null;
		row: boolean;
	}>(`({
		toggle: document.querySelector('[data-slot="model-diagram"] [data-semantic-id="${WORKER}"] [data-toggle]')?.getAttribute('data-toggle') ?? null,
		part: document.querySelector('${CARD}') !== null,
		address: new URLSearchParams(location.search).get('expandA'),
		row: document.querySelector('${ROW}') !== null,
	})`);
}

/**
 * Wait until a reading of the gateway says one thing of the worker.
 * @param browser The page.
 * @param expanded Whether the worker stands open in the picture.
 */
async function reads(browser: AgentBrowserSession, expanded: boolean): Promise<void> {
	await pollUntil(
		() => worker(browser),
		({ toggle, part, address }) =>
			toggle === (expanded ? "collapse" : "expand") &&
			part === expanded &&
			address === (expanded ? WORKER : null),
		`the worker ${expanded ? "open in" : "a door of"} the picture`,
		WAIT,
	);
	await drawn(browser);
}

/**
 * Press the control that the worker wears, with the pointer.
 * @param browser The page.
 */
async function pressControl(browser: AgentBrowserSession): Promise<void> {
	const at = await browser.eval<{ x: number; y: number }>(`(() => {
		const controls = document.querySelectorAll('[data-slot="model-diagram"] [data-semantic-id="${WORKER}"] [data-toggle]');
		const box = [...controls].map((control) => control.getBoundingClientRect()).find((one) => one.width > 0);
		return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
	})()`);
	await browser.run(["mouse", "move", String(at.x), String(at.y)]);
	await browser.run(["mouse", "down"]);
	await browser.run(["mouse", "up"]);
}

test("a door expands into the picture, the address keeps it, and a tab or a key takes it back", async () => {
	await using resources = new AsyncDisposableStack();
	const browser = await openReader(resources, "reader-expand", (vault) => {
		writeFileSync(
			join(vault, "internal", "queue.module.json"),
			JSON.stringify({
				schemaVersion: 1,
				id: QUEUE,
				name: "Queue",
				kind: "module",
				parent: WORKER,
				order: 40,
				outgoing: [],
			}),
		);
	});
	await browser.run(["click", '[data-module-row="Shop#Gateway"]']);
	await settledOn(browser, "Shop#Gateway");
	await drawn(browser);
	await reads(browser, false);

	// The control expands, and the same reading comes back from its address.
	await pressControl(browser);
	await reads(browser, true);
	expect((await worker(browser)).row).toBe(true);
	await browser.run(["reload"]);
	await settledOn(browser, "Shop#Gateway");
	await reads(browser, true);

	// The frame's tab collapses it, and Back returns to what the reader had.
	await pressControl(browser);
	await reads(browser, false);
	await browser.run(["back"]);
	await reads(browser, true);

	// The panel's row collapses too. By keyboard, the walk reaches the door and a key expands it.
	await browser.run(["click", '[data-slot="model-panel-collapse"]']);
	await reads(browser, false);
	await browser.run(["press", "Enter"]);
	await browser.run(["press", "]"]);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="module-toggle"]')?.getAttribute('data-toggle') ?? null`,
			),
		(toggle) => toggle === "expand",
		"the door selected by keyboard",
		WAIT,
	);
	await browser.run(["press", "e"]);
	await reads(browser, true);
	expect(await browser.run(["errors"])).toBe("");
}, 60_000);
