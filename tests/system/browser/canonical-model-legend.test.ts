// The owner of the legend's workflow: its rows stay where they stand while a reader filters, and a
// group's tag selects what the picture draws of that group, from the pointer and from the keyboard.

import { expect, test } from "bun:test";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
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
import { settledOn } from "./support/canonical-page.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 10_000 } as const;

const LEGEND = '[data-slot="model-legend"]';
const FILTER = '[data-slot="model-legend-filter"]';
const COUNT = '[data-slot="model-legend-hidden"]';
const PUBLIC = '[data-group-id="public"]';
const BILLING = '[data-group-id="billing"]';

/** One outgoing relationship of a fixture module. */
function line(id: string, to: string, kind: string): Record<string, unknown> {
	return { id: `Shop#${id}`, to: `Shop#${to}`, kind, order: 10 };
}

/**
 * A reading of Gateway whose line kinds carry things off the picture: hiding `event` takes the door
 * Bank, its kind and its group, and hiding `call` takes the door Worker, the marks of its line and
 * the mixed line between Handler and Router.
 * @param vault The vault.
 */
function seedReading(vault: string): void {
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	const policyPath = join(vault, ".archboard/config.yaml");
	writeFileSync(
		policyPath,
		`${readFileSync(policyPath, "utf8")
			.replace(
				"relationshipKinds:\n",
				"  external: { name: External, icon: RiExternalLinkLine, color: pink }\nrelationshipKinds:\n",
			)
			.replace(
				"groups:\n",
				"  data: { name: Data, dash: solid, arrowhead: filled, color: teal }\n  event: { name: Event, dash: dashed, arrowhead: open, color: rose }\ngroups:\n",
			)}  billing: { name: Billing, color: amber }\n`,
	);
	const module = (name: string, fields: Record<string, unknown>): void =>
		writeFileSync(
			join(vault, `${name.toLowerCase()}.module.json`),
			JSON.stringify({
				schemaVersion: 1,
				id: `Shop#${name}`,
				name,
				order: 40,
				outgoing: [],
				...fields,
			}),
		);
	module("Bank", { kind: "external", groups: ["billing", "public"] });
	module("Router", {
		kind: "module",
		parent: "Shop#Gateway",
		groups: ["public"],
		outgoing: [line("Settle", "Bank", "event")],
	});
	const handlerPath = join(vault, "internal/handler.module.json");
	const handler = JSON.parse(readFileSync(handlerPath, "utf8"));
	writeFileSync(
		handlerPath,
		JSON.stringify({
			...handler,
			groups: ["public"],
			outgoing: [
				...handler.outgoing,
				line("Route", "Router", "call"),
				line("Copy", "Router", "data"),
			],
		}),
	);
}

/**
 * Where every word and mark of the legend stands. The switches and the Filter key are left out: a
 * key sinks when it is pressed, and that is the key moving, not the legend.
 */
function wordsAt(browser: AgentBrowserSession): Promise<string> {
	return browser.eval<string>(`(() => {
		const legend = document.querySelector('${LEGEND}');
		const words = [...legend.querySelectorAll('h4, svg, li [title]')].filter((word) => word.closest('[role="switch"], ${FILTER}') === null);
		return JSON.stringify(words.map((word) => {
			const { x, y } = word.getBoundingClientRect();
			return [word.textContent, Math.round(x), Math.round(y)];
		}));
	})()`);
}

function drawn(browser: AgentBrowserSession, id: string): Promise<boolean> {
	return browser.eval<boolean>(
		`document.querySelector('[data-slot="model-diagram"] [data-semantic-id="${id}"]') !== null`,
	);
}

function selectedParts(browser: AgentBrowserSession): Promise<string[]> {
	return browser.eval<string[]>(
		`[...new Set([...document.querySelectorAll('[data-slot="model-diagram"] [data-semantic-kind="node"].is-selected')].map((node) => node.getAttribute('data-semantic-id')))].sort()`,
	);
}

function pressed(browser: AgentBrowserSession, tag: string): Promise<string | null> {
	return browser.eval<string | null>(
		`document.querySelector('${tag}')?.getAttribute('aria-pressed') ?? null`,
	);
}

/** Press where a control stands, with the pointer, as a person who does not move it again does. */
async function clickAt(browser: AgentBrowserSession, at: { x: number; y: number }): Promise<void> {
	await browser.run(["mouse", "move", String(at.x), String(at.y)]);
	await browser.run(["mouse", "down"]);
	await browser.run(["mouse", "up"]);
}

test("the legend's words stay put while a reader filters, and a group's tag selects its parts", async () => {
	await using resources = new AsyncDisposableStack();
	const vault = vaultIn(join(browserTestRoots().ownerRoot, "legend-model"));
	seedReading(vault);
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/?${new URLSearchParams({ scopeA: "Shop#Gateway" })}`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await settledOn(browser, "Shop#Gateway");
	await pollUntil(
		() => drawn(browser, "Shop#Bank"),
		Boolean,
		"the door that the reading draws",
		WAIT,
	);
	const rest = await wordsAt(browser);

	await browser.run(["click", FILTER]);
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('[data-filter-kind="event"]') !== null`),
		Boolean,
		"the switches",
		WAIT,
	);
	expect(await pressed(browser, FILTER)).toBe("true");
	expect(await wordsAt(browser)).toBe(rest);

	await browser.run(["click", '[data-filter-kind="event"]']);
	await pollUntil(
		async () => !(await drawn(browser, "Shop#Bank")),
		Boolean,
		"the door gone with its only line",
		WAIT,
	);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`[...document.querySelectorAll('[data-slot="model-legend-kinds"] li')].every((row) => row.querySelector('path') !== null)`,
			),
		Boolean,
		"a chip for each kind, the one that the picture left out too",
		WAIT,
	);
	expect(await browser.eval<boolean>(`document.querySelector('${BILLING}').disabled`)).toBe(true);
	await browser.run(["click", '[data-filter-kind="call"]']);
	await pollUntil(
		async () => !(await drawn(browser, "Shop#Worker")),
		Boolean,
		"the second door gone",
		WAIT,
	);
	expect(await wordsAt(browser)).toBe(rest);
	expect(
		await browser.eval<number>(
			`Number.parseInt(document.querySelector('${COUNT}').textContent, 10)`,
		),
	).toBe(2);

	await browser.run(["click", '[data-slot="model-legend-show-all"]']);
	await pollUntil(
		async () => (await drawn(browser, "Shop#Bank")) && (await drawn(browser, "Shop#Worker")),
		Boolean,
		"every line back in one step",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(`new URLSearchParams(location.search).has('hideKindsA')`),
	).toBe(false);
	await browser.run(["click", FILTER]);
	expect(await wordsAt(browser)).toBe(rest);

	const tag = await browser.eval<{ x: number; y: number }>(`(() => {
		const { x, y, width, height } = document.querySelector('${PUBLIC}').getBoundingClientRect();
		return { x: Math.round(x + width / 2), y: Math.round(y + height / 2) };
	})()`);
	await clickAt(browser, tag);
	await pollUntil(
		() => selectedParts(browser),
		(ids) => ids.join() === "Shop#Bank,Shop#Handler,Shop#Router",
		"the group's parts, its door among them",
		WAIT,
	);
	expect(await pressed(browser, PUBLIC)).toBe("true");
	expect(await wordsAt(browser)).toBe(rest);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="canvas-surface"]').classList.contains('is-probing') && document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Worker"]:not(.is-lit)') !== null && document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Router"].is-lit') !== null`,
		),
	).toBe(true);
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-slot="model-selected-subjects"] [data-subject-id]')].map((row) => row.getAttribute('data-subject-id')).sort()`,
		),
	).toEqual(["Shop#Bank", "Shop#Handler", "Shop#Router"]);

	await clickAt(browser, tag);
	await pollUntil(
		() => selectedParts(browser),
		(ids) => ids.length === 0,
		"the selection cleared by the second click, at the same place",
		WAIT,
	);
	expect(await pressed(browser, PUBLIC)).toBe("false");

	await browser.run(["focus", BILLING]);
	await browser.run(["press", "Enter"]);
	await pollUntil(
		() => selectedParts(browser),
		(ids) => ids.join() === "Shop#Bank",
		"the group chosen from the keyboard",
		WAIT,
	);
	expect(await pressed(browser, BILLING)).toBe("true");
	expect(await pressed(browser, PUBLIC)).toBe("false");
	await browser.run(["press", "Enter"]);
	await pollUntil(
		() => selectedParts(browser),
		(ids) => ids.length === 0,
		"the group let go from the keyboard",
		WAIT,
	);
}, 60_000);
