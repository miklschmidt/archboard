// The owner of what the right column adds to a reading: the flows and walkthroughs that touch what
// a reader looks at, the interface measures, the door that opens at one click, and the engine under
// the legend.

import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pollUntil, type AgentBrowserSession } from "./support/agent-browser.ts";
import { openDiagram, pick, settledOn } from "./support/canonical-page.ts";
import { WAIT, drawn, openReader } from "./support/reader-page.ts";

const DOOR = `[data-slot="model-diagram"] [data-semantic-id="Shop#Worker"]`;
const SWITCH = `[data-slot="model-engine-choice"]`;
const CLEAR = `[data-slot="semantic-selection-clear"]`;
const LEAVE = `[data-slot="semantic-presentation-leave"]`;
const MEASURES = `[data-slot="model-panel-interface"]`;
const COUNT = (measure: string): string => `${MEASURES} [data-measure="${measure}"]`;

/** Six flows across the gateway, more than the right column shows at first. */
const GATEWAY_FLOWS = [1, 2, 3, 4, 5, 6].map((index) => `Shop#Req${index}`);

/**
 * One flow for the fixture.
 * @param id Its identity.
 * @param from Where its one message starts.
 * @param to Where it ends.
 * @returns The flow.
 */
function flow(id: string, from: string, to: string) {
	return {
		id,
		name: id,
		summary: "One exchange.",
		participants: [from, to],
		steps: [{ id: `${id}S`, from, to, kind: "sync", label: "Ask" }],
	};
}

/**
 * Write a walkthrough of one beat that selects one module.
 * @param vault The vault.
 * @param name Its name, which also names its identity and its file.
 * @param subject The module.
 */
function writeTour(vault: string, name: string, subject: string): void {
	writeFileSync(
		join(vault, `${name.toLowerCase()}.walkthrough.json`),
		JSON.stringify({
			schemaVersion: 1,
			id: `Shop#${name}`,
			name,
			target: { state: "current" },
			beats: [
				{
					id: `Shop#${name}B`,
					title: name,
					narrative: "Look here.",
					reading: { grammar: "architecture", selection: [subject] },
				},
			],
		}),
	);
}

/**
 * What the reader shows beside the picture and in the left column.
 * @param browser The page.
 * @returns The rows of each list, the counts of the tabs, and where the legend ends.
 */
function column(browser: AgentBrowserSession) {
	return browser.eval<{
		flows: string[];
		walkthroughs: string[];
		counts: string[];
		more: number;
		legendFits: boolean;
	}>(`(() => {
		const rows = (slot) => [...document.querySelectorAll('[data-slot="' + slot + '"] [data-context-row]')].map((row) => row.getAttribute('data-context-row'));
		return {
			flows: rows('model-panel-flows'),
			walkthroughs: rows('model-panel-walkthroughs'),
			counts: [...document.querySelectorAll('[data-slot="destination-count"]')].map((count) => count.textContent),
			more: document.querySelectorAll('[data-slot="model-panel-more"]').length,
			legendFits: document.querySelector('[data-slot="model-legend"]').getBoundingClientRect().bottom <= window.innerHeight,
		};
	})()`);
}

/**
 * Wait for what the right column lists.
 * @param browser The page.
 * @param expected The rows that it holds.
 */
async function lists(
	browser: AgentBrowserSession,
	expected: { flows: readonly string[]; walkthroughs: readonly string[] },
): Promise<void> {
	await pollUntil(
		() => column(browser),
		(now) =>
			now.flows.join() === expected.flows.join() &&
			now.walkthroughs.join() === expected.walkthroughs.join(),
		`the lists ${JSON.stringify(expected)}`,
		WAIT,
	);
}

/**
 * What the picture draws, as the geometry of its root and its cards.
 * @param browser The page.
 * @returns The geometry.
 */
function geometry(browser: AgentBrowserSession) {
	return browser.eval<string>(`(() => {
		const picture = document.querySelector('[data-slot="model-diagram"] svg');
		const cards = [...picture.querySelectorAll('[data-semantic-kind="node"]')].map((card) => {
			const { x, y } = card.getBBox();
			return [Math.round(x), Math.round(y)];
		});
		return JSON.stringify([picture.getAttribute('width'), picture.getAttribute('height'), cards]);
	})()`);
}

/**
 * Which module the panel explains.
 * @param browser The page.
 * @returns The module, or null.
 */
function explained(browser: AgentBrowserSession) {
	return browser.eval<string | null>(
		`document.querySelector('[data-slot="module-details"]')?.getAttribute('data-module-id') ?? null`,
	);
}

/**
 * The counts of the interface line.
 * @param browser The page.
 * @returns Each measure with its count, or nothing without a line.
 */
function measures(browser: AgentBrowserSession) {
	return browser.eval<Record<string, string> | null>(`(() => {
		const line = document.querySelector('${MEASURES}');
		if (line === null) return null;
		return Object.fromEntries([...line.querySelectorAll('[data-measure]')].map((one) => [one.getAttribute('data-measure'), one.getAttribute('data-count')]));
	})()`);
}

/**
 * Follow the interface line to About, make sure that it lands on the interface, and come back.
 * @param browser The page.
 * @returns The hidden parts that About names.
 */
async function followMeasures(browser: AgentBrowserSession): Promise<string[]> {
	await browser.run(["click", '[data-slot="model-interface-about"]']);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="about-outline-entry"][aria-current="location"]')?.getAttribute('data-section') ?? null`,
			),
		(section) => section === "interface",
		"the interface section of About",
		WAIT,
	);
	const hidden = await browser.eval<string[]>(
		`[...document.querySelectorAll('[data-slot="semantic-inspector-hidden-part"]')].map((part) => part.getAttribute('data-part'))`,
	);
	await openDiagram(browser);
	return hidden;
}

/**
 * Wait for the panel to explain one module that the picture marks as selected.
 * @param browser The page.
 * @param id The module.
 */
async function selectedCard(browser: AgentBrowserSession, id: string): Promise<void> {
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="model-diagram"] [data-semantic-id="${id}"].is-selected') === null ? null : (document.querySelector('[data-slot="module-details"]')?.getAttribute('data-module-id') ?? null)`,
			),
		(explaining) => explaining === id,
		`${id} selected on the picture`,
		WAIT,
	);
}

test("the right column follows what a reader looks at, and the left tabs hold the whole model", async () => {
	await using resources = new AsyncDisposableStack();
	const browser = await openReader(resources, "reader-context", (vault) => {
		writeFileSync(
			join(vault, "queue.module.json"),
			JSON.stringify({
				schemaVersion: 1,
				id: "Shop#Queue",
				name: "Queue",
				kind: "module",
				parent: "Shop#Worker",
				order: 40,
				outgoing: [],
			}),
		);
		writeFileSync(
			join(vault, "requests.flows.json"),
			JSON.stringify({
				schemaVersion: 1,
				id: "Behavior",
				name: "Requests",
				flows: [
					...GATEWAY_FLOWS.map((id) => flow(id, "Shop#Gateway", "Shop#Handler")),
					flow("Shop#Drain", "Shop#Worker", "Shop#Queue"),
				],
			}),
		);
		writeTour(vault, "Handle", "Shop#Handler");
		writeTour(vault, "Work", "Shop#Worker");
	});

	// At the roots with nothing selected, the left tabs already hold it all.
	const counts = ["7", "2"];
	expect(await column(browser)).toMatchObject({ flows: [], walkthroughs: [], counts });

	// A selection decides what the lists say, also at the roots.
	await pick(browser, "Shop#Worker");
	await lists(browser, { flows: ["Shop#Drain"], walkthroughs: ["Shop#Work"] });

	// A selected module that holds parts says what it offers. Its one caller names the module itself,
	// so nothing reaches its part, and the line says so. About opens at the rest and names that part.
	expect(await measures(browser)).toEqual({
		entryPoints: "0",
		hiddenParts: "1",
		callers: "1",
		wholeModule: "1",
		passThrough: "0",
	});
	expect(await followMeasures(browser)).toEqual(["Shop#Queue"]);
	await browser.run(["click", CLEAR]);
	await lists(browser, { flows: [], walkthroughs: [] });
	expect(await measures(browser)).toBeNull();

	// The open module decides them while nothing is selected. A long list shows a few rows.
	await browser.run(["click", '[data-module-row="Shop#Gateway"]']);
	await settledOn(browser, "Shop#Gateway");
	await lists(browser, { flows: GATEWAY_FLOWS.slice(0, 4), walkthroughs: ["Shop#Handle"] });
	expect(await column(browser)).toMatchObject({ counts, more: 1, legendFits: true });
	await browser.run(["click", '[data-slot="model-panel-more"]']);
	await lists(browser, { flows: GATEWAY_FLOWS, walkthroughs: ["Shop#Handle"] });

	// So does the open module. A module with no parts has no interface to state.
	await followMeasures(browser);
	await pick(browser, "Shop#Handler");
	await pollUntil(
		() => explained(browser),
		(id) => id === "Shop#Handler",
		"the selected part",
		WAIT,
	);
	expect(await measures(browser)).toBeNull();
	await browser.run(["click", CLEAR]);

	// A row opens its flow, in the place that offers its representation.
	await browser.run(["click", `[data-context-row="${GATEWAY_FLOWS[0]}"]`]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-reading"]')?.getAttribute('data-grammar') === 'sequence' && document.querySelector('[data-destination="flows"]')?.getAttribute('aria-selected') === 'true'`,
			),
		Boolean,
		"the sequence of the flow",
		WAIT,
	);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-context-row="${GATEWAY_FLOWS[0]}"]')?.getAttribute('aria-current') ?? null`,
			),
		(current) => current === "location",
		"the flow on screen in the list",
		WAIT,
	);
	// No engine lays out a flow, so nothing offers one.
	expect(await browser.eval<boolean>(`document.querySelector('${SWITCH}') === null`)).toBe(true);
	await browser.run(["press", "Backspace"]);
	await settledOn(browser, "Shop#Gateway");
	await drawn(browser);

	// A row opens its walkthrough.
	await browser.run(["click", '[data-context-row="Shop#Handle"]']);
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('${LEAVE}') !== null`),
		Boolean,
		"the presented walkthrough",
		WAIT,
	);
	await browser.run(["click", LEAVE]);
	await settledOn(browser, "Shop#Gateway");
	await drawn(browser);

	// A door lists what it stands for on hover, and one click opens it.
	await browser.run(["hover", DOOR]);
	await pollUntil(
		() =>
			browser.eval<number>(
				`document.querySelectorAll('[data-slot="model-door-tip"] [data-slot="model-door-part"]').length`,
			),
		(parts) => parts === 1,
		"the tip of the door",
		WAIT,
	);
	await pick(browser, "Shop#Worker", { toggle: true });
	await pollUntil(
		() => explained(browser),
		(id) => id === "Shop#Worker",
		"a door selected with Ctrl",
		WAIT,
	);
	await browser.run(["click", CLEAR]);
	await browser.run(["click", DOOR]);
	await settledOn(browser, "Shop#Worker");
	await browser.run(["back"]);
	await settledOn(browser, "Shop#Gateway");
	await drawn(browser);

	// A count of a module that is not open shows what it counts on that module's picture.
	await pick(browser, "Shop#Worker", { toggle: true });
	await browser.run(["click", COUNT("hiddenParts")]);
	await settledOn(browser, "Shop#Worker");
	await selectedCard(browser, "Shop#Queue");
	await browser.run(["click", CLEAR]);

	// Callers are selected where the picture draws them.
	await browser.run(["click", COUNT("callers")]);
	await selectedCard(browser, "Shop#Gateway");
	await browser.run(["click", CLEAR]);
	await browser.run(["back"]);
	await settledOn(browser, "Shop#Gateway");
	await drawn(browser);

	// The engine redraws the picture, keeps the selection, and stays through a reload.
	await pick(browser, "Shop#Handler");
	await pollUntil(
		() => explained(browser),
		(id) => id === "Shop#Handler",
		"the selected card",
		WAIT,
	);
	await drawn(browser);
	const blocks = await geometry(browser);
	await browser.run(["click", `${SWITCH} [data-choice="track"]`]);
	await pollUntil(
		() => geometry(browser),
		(now) => now !== blocks,
		"the picture of the other engine",
		WAIT,
	);
	await drawn(browser);
	const tracks = await geometry(browser);
	expect(await explained(browser)).toBe("Shop#Handler");
	await browser.run(["reload"]);
	await drawn(browser);
	expect(await geometry(browser)).toBe(tracks);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('${SWITCH} [data-choice="track"]').getAttribute('aria-pressed')`,
		),
	).toBe("true");
	expect(await browser.run(["errors"])).toBe("");
}, 60_000);
