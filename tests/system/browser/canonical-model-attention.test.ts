import { expect, test } from "bun:test";
import { join } from "node:path";
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
import { serverPath } from "./support/navigator-support.ts";

const SURFACE = "[data-slot='model-diagram'] [data-slot='semantic-board-surface']";
const WAIT = { timeoutMs: 8_000 } as const;

/**
 * The filter each drawn part is under, by the part's name.
 * @param browser The page.
 * @returns The computed `filter` of every card, by what it is called.
 */
function filtersByName(browser: AgentBrowserSession): Promise<Record<string, string>> {
	return browser.eval<Record<string, string>>(
		`(() => { const out = {};` +
			` for (const card of document.querySelectorAll("${SURFACE} [data-semantic-kind='node']")) {` +
			`   out[card.textContent.trim().split(/\\s+/)[0]] = getComputedStyle(card).filter; }` +
			` return out; })()`,
	);
}

/** How the page draws one relationship's label. */
interface LabelLook {
	/** The words on it. */
	readonly words: string;
	/** Whether it is drawn at all: not `display: none` and not `visibility: hidden`. */
	readonly drawn: boolean;
	/** Its own computed opacity. */
	readonly opacity: number;
	/** The opacity its filter leaves it at, 1 for no filter. */
	readonly filtered: number;
}

/**
 * How the page draws every relationship's label.
 * @param browser The page.
 * @returns Each label, in the order of the picture.
 */
function labelLooks(browser: AgentBrowserSession): Promise<LabelLook[]> {
	return browser.eval<LabelLook[]>(
		`[...document.querySelectorAll("${SURFACE} [data-semantic-kind='edge'][data-semantic-part='label']")]` +
			`.map((label) => { const look = getComputedStyle(label);` +
			` const filter = /opacity\\(([\\d.]+)\\)/.exec(look.filter);` +
			` return { words: label.textContent.trim(),` +
			`   drawn: look.display !== "none" && look.visibility !== "hidden",` +
			`   opacity: Number(look.opacity), filtered: filter === null ? 1 : Number(filter[1]) }; })`,
	);
}

/** What the page paints of the lit relationships' lines. */
interface LitInk {
	/** How many lit lines the picture cuts a stretch out of because another line of a trunk draws it. */
	readonly trunked: number;
	/** How many lit lines still have that stretch cut out of what the browser paints. */
	readonly cut: number;
}

/**
 * Whether the lines the picture is lit along are painted whole.
 *
 * The picture has one line of a trunk draw each shared stretch and cuts it from
 * the others with a mask whose cutouts for it have butt ends. A lit line must
 * not lose that stretch, or the lane it rides looks receded along the trunk.
 * @param browser The page.
 * @returns How many lit lines are cut for a trunk, and how many still are.
 */
function litInk(browser: AgentBrowserSession): Promise<LitInk> {
	return browser.eval<LitInk>(
		`(() => { const root = document.querySelector("${SURFACE} > svg");` +
			` const trunk = (mask) => mask !== null && [...mask.querySelectorAll("path")].some((cut) => cut.getAttribute("stroke-linecap") === "butt");` +
			` const named = (url) => { const id = /#([^")]+)/.exec(url)?.[1]; return id === undefined ? null : root.querySelector("mask[id='" + id + "']"); };` +
			` let trunked = 0; let cut = 0;` +
			` for (const line of root.querySelectorAll("g[data-semantic-kind='edge'].is-lit[mask]")) {` +
			`   if (!trunk(named(line.getAttribute("mask")))) continue;` +
			`   trunked += 1;` +
			`   if (trunk(named(getComputedStyle(line).maskImage))) cut += 1; }` +
			` return { trunked, cut }; })()`,
	);
}

test("selection lights canonical connections without hiding labels or cutting shared routes", async () => {
	await using resources = new AsyncDisposableStack();
	const vault = vaultIn(join(browserTestRoots().ownerRoot, "model-attention"));
	const model = await seedCanonicalModel(vault, "Architecture", {
		nodes: [
			{ name: "Pipeline", kind: "module" },
			...["Writer", "Renderer", "Viewer", "Archive"].map((name) => ({
				name,
				kind: "module",
				parent: "Pipeline",
			})),
			{ name: "Fanout", kind: "module" },
			...["Hub", "North", "South", "East"].map((name) => ({
				name,
				kind: "module",
				parent: "Fanout",
			})),
		],
		edges: [
			{ from: "Writer", to: "Renderer", kind: "call", label: "draws" },
			{ from: "Renderer", to: "Viewer", kind: "call", label: "shows" },
			{ from: "Archive", to: "Viewer", kind: "data", label: "replays" },
			...["North", "South", "East"].map((to) => ({
				from: "Hub",
				to,
				kind: "call",
				label: `asks ${to}`,
			})),
		],
	});
	const id = (name: string): string => model.modules.find((module) => module.name === name)!.id;
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const browser = resources.use(await createAgentBrowser());
	const address = new URL(server.base);
	address.searchParams.set("modelA", model.manifest.id);
	address.searchParams.set("scopeA", id("Pipeline"));
	await browser.run(["open", address.href]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector('[data-slot="model-diagram"] svg') !== null`),
		Boolean,
		"the scoped model drawing",
		WAIT,
	);
	await browser.run(["click", `[data-slot="module-list"] [data-module-id="${id("Renderer")}"]`]);
	const receded = await pollUntil(
		() => filtersByName(browser),
		(filters) => (filters["Archive"] ?? "none") !== "none",
		"the unrelated module to recede",
		WAIT,
	);
	for (const name of ["Renderer", "Viewer", "Writer"]) expect(receded[name]).toBe("none");
	expect(receded["Archive"]).toContain("opacity");
	const looks = await pollUntil(
		() => labelLooks(browser),
		(labels) => labels.some((label) => label.words === "replays" && label.filtered <= 0.5),
		"the unrelated relationship label to recede",
		WAIT,
	);
	expect(looks.map((label) => label.words).toSorted()).toEqual(["draws", "replays", "shows"]);
	for (const look of looks)
		expect(look).toMatchObject({
			drawn: true,
			opacity: 1,
			filtered: look.words === "replays" ? 0.5 : 1,
		});
	await browser.run(["focus", '[data-slot="model-diagram"]']);
	await browser.run(["press", "Escape"]);
	await pollUntil(
		() => filtersByName(browser),
		(filters) => Object.values(filters).every((filter) => filter === "none"),
		"clearing attention",
		WAIT,
	);
	await browser.eval(
		`(() => { const view=document.querySelector('[data-slot="model-diagram"]'); for(let i=0;i<30;i++)view.dispatchEvent(new KeyboardEvent('keydown',{key:'-',bubbles:true})); })()`,
	);
	await pollUntil(
		() =>
			browser.eval<number>(
				`Number(document.querySelector("${SURFACE}").style.transform.match(/scale\\(([^)]+)\\)/)?.[1] ?? 1)`,
			),
		(scale) => scale < 0.2,
		"the picture zoomed out before reading its labels",
		WAIT,
	);
	const far = await labelLooks(browser);
	expect(far).toHaveLength(3);
	for (const look of far) expect(look).toMatchObject({ drawn: true, opacity: 1, filtered: 1 });
	address.searchParams.set("scopeA", id("Fanout"));
	await browser.run(["open", address.href]);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector('[data-slot="model-diagram"] svg') !== null`),
		Boolean,
		"the fanout drawing",
		WAIT,
	);
	await browser.run(["click", `[data-slot="module-list"] [data-module-id="${id("East")}"]`]);
	const ink = await pollUntil(
		() => litInk(browser),
		(found) => found.trunked > 0,
		"the selected route in its shared lane",
		WAIT,
	);
	expect(ink.cut).toBe(0);
}, 90_000);
