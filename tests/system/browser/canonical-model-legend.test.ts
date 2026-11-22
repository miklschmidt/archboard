// The owner of the legend's workflow: the picture is read through a lens that the address keeps
// and the line above the picture names, each lens is one press, each kind and each effect is its
// own switch and its name shows it alone, what the lens leaves out stands apart with no switch, the
// rows stay where they stand while a reader hides and shows lines, Show all reads the picture
// through the lens of every relationship, and a group's tag selects what the picture draws of that
// group, from the pointer and from the keyboard.

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
import { pick, settledOn } from "./support/canonical-page.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 10_000 } as const;

const LEGEND = '[data-slot="model-legend"]';
const PUBLIC = '[data-group-id="public"]';
const BILLING = '[data-group-id="billing"]';

/** One outgoing relationship of a fixture module. */
function line(id: string, to: string, kind: string): Record<string, unknown> {
	return { id: `Shop#${id}`, to: `Shop#${to}`, kind, effect: "mutation", order: 10 };
}

/**
 * A reading of Gateway whose line kinds carry things off the picture: hiding `event` takes the door
 * Bank, its kind and its group, and hiding `sync` takes the door Worker and the marks of its line.
 * The default lens leaves out Handler's dependency on Bank, with its kind and its declared-only
 * effect, which every relationship shows.
 * @param vault The vault.
 */
function seedReading(vault: string): void {
	cpSync(resolve(import.meta.dir, "../../../tests/fixtures/current-format-vault"), vault, {
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
				"  data: { name: Data, color: teal }\n  event: { name: Event, color: rose }\ngroups:\n",
			)}  billing: { name: Billing, color: amber }\n`,
	);
	const module = (name: string, fields: Record<string, unknown>): void =>
		writeFileSync(
			join(vault, `${name.toLowerCase()}.module.json`),
			JSON.stringify({
				schemaVersion: 2,
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
				line("Route", "Router", "sync"),
				line("Copy", "Router", "data"),
				{ id: "Shop#Needs", to: "Shop#Bank", kind: "dependency", order: 20 },
			],
		}),
	);
}

/** Where every word and mark of the legend stands, the eyes of the switches among them. */
function wordsAt(browser: AgentBrowserSession): Promise<string> {
	return browser.eval<string>(`(() => {
		const legend = document.querySelector('${LEGEND}');
		const words = [...legend.querySelectorAll('h4, svg, li [title]')];
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

/** The switch of each kind and each effect in the legend, with whether the picture draws it. */
function switches(browser: AgentBrowserSession): Promise<string[]> {
	return browser.eval<string[]>(
		`[...document.querySelectorAll('${LEGEND} [role="switch"]')].map((one) => \`\${one.getAttribute('data-filter-kind') ?? one.getAttribute('data-filter-effect')}: \${one.getAttribute('aria-checked')}\`)`,
	);
}

function pressed(browser: AgentBrowserSession, tag: string): Promise<string | null> {
	return browser.eval<string | null>(
		`document.querySelector('${tag}')?.getAttribute('aria-pressed') ?? null`,
	);
}

/** What the line above the picture says of the lens and the lines it left out. */
function lensOf(browser: AgentBrowserSession): Promise<string> {
	return browser.eval<string>(
		`document.querySelector('[data-slot="model-lens-status"]')?.textContent.trim() ?? ""`,
	);
}

function addressed(browser: AgentBrowserSession, key: string): Promise<string | null> {
	return browser.eval<string | null>(`new URLSearchParams(location.search).get('${key}')`);
}

/** Press where a control stands, with the pointer, as a person who does not move it again does. */
async function clickAt(browser: AgentBrowserSession, at: { x: number; y: number }): Promise<void> {
	await browser.run(["mouse", "move", String(at.x), String(at.y)]);
	await browser.run(["mouse", "down"]);
	await browser.run(["mouse", "up"]);
}

test("each kind and effect is its own switch, the legend's words stay put while a reader hides lines, and a group's tag selects its parts", async () => {
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
	expect(await switches(browser)).toEqual(["sync: true", "event: true", "data: true", "mutation: true"]);
	expect(await lensOf(browser)).toBe("Main lines · 1 line left out");
	expect(
		await browser.eval<{ leftOut: string[]; marks: number; switches: number }>(`(() => {
			const leftOut = document.querySelector('[data-slot="model-legend-left-out"]');
			const marks = document.querySelector('[data-slot="model-legend-marks"]');
			return {
				leftOut: [...leftOut.querySelectorAll('li [title]')].map((row) => row.textContent),
				marks: marks.querySelectorAll('li [title]').length,
				switches: leftOut.querySelectorAll('button').length + marks.querySelectorAll('button').length,
			};
		})()`),
		"the dependency and its declared-only effect, which the lens leaves out, and the marks of lines, which no reader hides, stand apart with no switch",
	).toEqual({ leftOut: ["Dependency", "Declared only"], marks: 2, switches: 0 });

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
	await browser.run(["focus", '[data-filter-kind="sync"]']);
	await browser.run(["press", "Space"]);
	await pollUntil(
		async () => !(await drawn(browser, "Shop#Worker")),
		Boolean,
		"the second door gone, hidden from the keyboard",
		WAIT,
	);
	expect(await switches(browser)).toEqual(["sync: false", "event: false", "data: true", "mutation: true"]);
	expect(await wordsAt(browser)).toBe(rest);

	// Data already stands alone, so its name shows every kind again; Sync's name shows Sync alone.
	await browser.run(["click", '[data-solo-kind="data"]']);
	await pollUntil(
		() => addressed(browser, "hideKindsA"),
		(hidden) => hidden === null,
		"every kind again from the name of the kind that stood alone",
		WAIT,
	);
	await browser.run(["click", '[data-solo-kind="sync"]']);
	await pollUntil(
		() => addressed(browser, "hideKindsA"),
		(hidden) => hidden === "data,event",
		"sync alone from its name",
		WAIT,
	);
	await browser.run(["click", '[data-filter-effect="mutation"]']);
	await pollUntil(
		() => addressed(browser, "hideEffectsA"),
		(hidden) => hidden === "mutation",
		"the effect hidden by its own switch",
		WAIT,
	);

	await browser.run(["click", '[data-slot="model-legend-show-all"]']);
	await pollUntil(
		() => lensOf(browser),
		(lens) => lens === "All relationships",
		"every line back in one step, through the lens of every relationship",
		WAIT,
	);
	expect(await drawn(browser, "Shop#Needs")).toBe(true);
	expect(await drawn(browser, "Shop#Worker")).toBe(true);
	expect(await addressed(browser, "hideKindsA")).toBeNull();
	expect(await addressed(browser, "hideEffectsA")).toBeNull();
	expect(await addressed(browser, "lensA")).toBe("all");
	// Under every relationship the lens leaves nothing out, so the rows it left out join the switches.
	const all = await wordsAt(browser);

	await pick(browser, "Shop#Dispatch");
	await pollUntil(
		() =>
			browser.eval<string>(
				`document.querySelector('[data-slot="model-connection-kinds"]')?.textContent ?? ""`,
			),
		(said) => said === "Sync calls · Mutation",
		"the selected line's kind and effect",
		WAIT,
	);
	await browser.run(["press", "Escape"]);

	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-lens-id]')].map((item) => item.getAttribute('data-lens-id'))`,
		),
		"every lens is one press in the legend, in the policy's order",
	).toEqual(["main", "effects", "sync-compute", "network", "reads", "dependencies", "all"]);
	await browser.run(["click", '[data-filter-kind="event"]']);
	await pollUntil(
		() => addressed(browser, "hideKindsA"),
		(hidden) => hidden === "event",
		"a kind hidden under every relationship",
		WAIT,
	);
	await browser.run(["click", '[data-lens-id="dependencies"]']);
	await pollUntil(
		() => lensOf(browser),
		(lens) => lens === "Declared dependencies · 4 lines left out",
		"the picture read through the lens chosen, which shows every kind it selects",
		WAIT,
	);
	expect(await addressed(browser, "hideKindsA")).toBeNull();
	await browser.run(["reload"]);
	await settledOn(browser, "Shop#Gateway");
	await pollUntil(
		() => lensOf(browser),
		(lens) => lens.startsWith("Declared dependencies"),
		"the lens kept by the address",
		WAIT,
	);
	// Router draws no declared dependency, so the lens takes it off the picture with its lines.
	expect(await drawn(browser, "Shop#Router")).toBe(false);
	await browser.run(["click", '[data-slot="model-legend-show-all"]']);
	await pollUntil(
		() => addressed(browser, "lensA"),
		(lens) => lens === "all",
		"every line again",
		WAIT,
	);
	await pollUntil(() => drawn(browser, "Shop#Router"), Boolean, "Router back on the picture", WAIT);

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
	expect(await wordsAt(browser)).toBe(all);
	await pollUntil(
		() =>
			browser.eval<string[]>(
				`[...document.querySelectorAll('[data-slot="model-selected-subjects"] [data-subject-id]')].map((row) => row.getAttribute('data-subject-id')).sort()`,
			),
		(ids) => ids.join() === "Shop#Bank,Shop#Handler,Shop#Router",
		"the panel's rows of the group's parts",
		WAIT,
	);

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
