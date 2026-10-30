import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

import { createJsonRequester } from "../support/http.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import {
	browserTestRoots,
	serverTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { serverPath } from "./support/navigator-support.ts";
import { switchTheme } from "./support/shell-dom.ts";
import {
	seedCanonicalModel,
	editCanonicalModel,
	openModelSidebar,
} from "./support/canonical-page.ts";
import { initializeSource } from "./support/canonical-model.ts";
import { mintId } from "@archboard/board/ids";
import { OPAQUE_SRGB, edgeInks, sameHue, unresolvedPaints } from "./support/computed-colours.ts";

/** How long any one thing here is waited for. */
const WAIT = { timeoutMs: 6_000 } as const;

/** The element the camera moves. */
const SURFACE = "[data-slot='model-diagram'] [data-slot='semantic-board-surface']";

/** The panel beside the diagram. */
const INSPECTOR = "[data-slot='module-details']";

/**
 * The ink one card's icon tile is drawn in, or null while the card is not there.
 *
 * Null rather than a throw, because the surface is remounted whenever a new
 * picture arrives — a render that lands between a click and this question would
 * otherwise fail the owner for a reason that has nothing to do with what it is
 * about. `iconInk` waits for the card instead.
 * @param browser The page.
 * @param name What the card says.
 * @returns The tile's front edge as the browser resolves it, spelt as opaque sRGB, or null.
 */
const drawnIconInk = (browser: AgentBrowserSession, name: string): Promise<string | null> =>
	browser.eval<string | null>(
		`(() => {` +
			OPAQUE_SRGB +
			` const card = [...document.querySelectorAll("${SURFACE} [data-semantic-kind='node']")]` +
			`  .find((group) => group.textContent.includes(${JSON.stringify(name)}));` +
			` if (card === undefined) { return null; }` +
			// The tile is a small block: its first rect is its body, in the tone of its edge.
			` const tile = [...card.querySelectorAll("rect")].find((rect) => rect.getAttribute("rx") === "5");` +
			` return tile === undefined ? null : opaque(getComputedStyle(tile).fill); })()`,
	);

/**
 * The same, waited for.
 * @param browser The page.
 * @param name What the card says.
 * @returns The ink.
 */
const iconInk = async (browser: AgentBrowserSession, name: string): Promise<string> => {
	const ink = await pollUntil(
		() => drawnIconInk(browser, name),
		(found) => found !== null,
		`the icon on the card for "${name}" to be drawn`,
		WAIT,
	);
	return ink ?? "";
};

/**
 * Whether a subject's group carries the warning badge, and whether the reader's
 * own ring is lit on it.
 * @param browser The page.
 * @param id The subject's semantic id.
 * @returns The two, read off the same group.
 */
const marksOn = (
	browser: AgentBrowserSession,
	id: string,
): Promise<{ warned: boolean; attended: boolean }> =>
	browser.eval(
		`(() => {` +
			` const groups = [...document.querySelectorAll("${SURFACE} [data-semantic-id='${id}']")];` +
			` return {` +
			`  warned: groups.some((group) => group.querySelector("path[d^='M0,-5.2']") !== null),` +
			`  attended: groups.some((group) => group.classList.contains("is-selected")),` +
			` }; })()`,
	);

/**
 * Pick a subject out of the diagram the way a person does: press on the shape,
 * release and click on the viewport, because a browser retargets a click to
 * whichever element holds the pointer.
 * @param browser The page.
 * @param id The semantic id to pick.
 * @returns Settles once the click has been delivered.
 */
const pick = (browser: AgentBrowserSession, id: string): Promise<unknown> =>
	browser.eval(
		`(() => {` +
			` const card = document.querySelector("${SURFACE} [data-semantic-id='${id}']");` +
			` const view = document.querySelector("[data-slot='model-diagram']");` +
			` const at = card.getBoundingClientRect();` +
			` const where = { pointerId: 1, isPrimary: true, button: 0, bubbles: true,` +
			`   clientX: Math.round(at.x + at.width / 2), clientY: Math.round(at.y + at.height / 2) };` +
			` card.dispatchEvent(new PointerEvent("pointerdown", where));` +
			` view.dispatchEvent(new PointerEvent("pointerup", where));` +
			` view.dispatchEvent(new MouseEvent("click", where)); })()`,
	);

/**
 * Whether the words on one relationship are on top of every dot on the page,
 * as the browser itself resolves it.
 *
 * Every dot, not only the ones riding this relationship: routes cross, and a
 * picture where each relationship carried its own words would decide a crossing
 * by whichever of the two was drawn second. `compareDocumentPosition` answers
 * the painting order, and `elementFromPoint` answers what a person's pointer
 * would find over the words.
 * @param browser The page.
 * @param id The relationship's or message's semantic id.
 * @returns What is hit at the centre of the pill, how many traffic marks there are, and whether all are painted first.
 */
const overThePill = (
	browser: AgentBrowserSession,
	id: string,
): Promise<{ hit: string; traffic: number; trafficFirst: boolean }> =>
	browser.eval(
		`(() => {` +
			// A pulse draws shapes of its own, rectangles among them: the plate is the
			// rectangle that is neither a glow nor part of a pulse.
			` const pill = [...document.querySelectorAll("${SURFACE} [data-semantic-id='${id}'] rect")]` +
			`  .find((rect) => !rect.classList.contains("ab-halo") && rect.closest(".ab-pulse") === null);` +
			` const traffic = [...document.querySelectorAll("${SURFACE} .ab-pulse")];` +
			` const at = pill.getBoundingClientRect();` +
			` const under = document.elementFromPoint(` +
			`   Math.round(at.x + at.width / 2), Math.round(at.y + at.height / 2));` +
			` return {` +
			`  hit: under === null ? "nothing" : under.tagName.toLowerCase() +` +
			`   (under.closest(".ab-pulse") === null ? "" : ".ab-pulse"),` +
			`  traffic: traffic.length,` +
			`  trafficFirst: traffic.length > 0 && traffic.every((mark) =>` +
			`   (pill.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_PRECEDING) !== 0),` +
			` }; })()`,
	);

/**
 * Choose a visible mode or flow after its popup finishes opening.
 * @param browser The page.
 * @param trigger The visible control selector.
 * @param choice The exact authored or grammar option selector.
 */
async function choose(
	browser: AgentBrowserSession,
	trigger: string,
	choice: string,
): Promise<void> {
	await browser.run(["click", trigger]);
	await pollUntil(
		() =>
			browser.eval<boolean>(`(() => {
		const item = document.querySelector(${JSON.stringify(choice)});
		if (!item) return false;
		const box = item.getBoundingClientRect();
		return box.height > 0 && item.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
	})()`),
		Boolean,
		"the model reading option to become clickable",
		WAIT,
	);
	await browser.run(["click", choice]);
}

test("a reader sees what changed, what belongs together and what is unsettled", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "model-legibility");
	const vault = vaultIn(root);
	const model = await seedCanonicalModel(vault, "Write path", {
		nodes: [
			{ name: "Gateway", kind: "route" },
			{ name: "Writer", kind: "module", responsibility: "Takes the lease" },
			{ name: "Ledger", kind: "datastore" },
		],
		edges: [
			{ from: "Gateway", to: "Writer", kind: "call", label: "hands it over" },
			{ from: "Writer", to: "Ledger", kind: "data", label: "writes" },
		],
	});
	const id = (name: string): string => model.modules.find((module) => module.name === name)!.id;
	const policy = structuredClone(DEFAULT_SEMANTIC_POLICY);
	policy.nodeKinds["route"]!.color = "blue";
	policy.nodeKinds["queue"]!.color = "green";
	policy.nodeKinds["datastore"]!.color = "amber";
	policy.groups = {
		"write-path": { name: "the write path", color: "violet" },
		payments: { name: "payments", color: "amber" },
	};
	writeFileSync(join(vault, ".archboard/config.yaml"), Bun.YAML.stringify(policy));
	for (const index of [0, 1, 2]) {
		const path = join(vault, `module-${index}.module.json`);
		const module = JSON.parse(readFileSync(path, "utf8"));
		module.groups = [index === 2 ? "payments" : "write-path"];
		for (const edge of module.outgoing) edge.traffic = {};
		if (index === 0) module.outgoing[0].emphasis = "hero";
		writeFileSync(path, JSON.stringify(module));
	}
	const flow = `${model.manifest.id}#${mintId()}`;
	writeFileSync(
		join(vault, "write.flows.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: mintId(),
			name: "Writes",
			flows: [
				{
					id: flow,
					name: "One write",
					participants: [id("Gateway"), id("Writer")],
					steps: [
						{
							id: `${model.manifest.id}#${mintId()}`,
							from: id("Gateway"),
							to: id("Writer"),
							label: "asks",
							kind: "sync",
						},
						{
							id: `${model.manifest.id}#${mintId()}`,
							from: id("Writer"),
							to: id("Gateway"),
							label: "the version",
							kind: "return",
						},
					],
				},
			],
		}),
	);
	initializeSource(root);
	const server = await startOwnedServer({
		serverPath,
		vault,
		env: serverTestEnvironment({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const proposal = await editCanonicalModel(
		request,
		vault,
		"legible-proposal",
		[
			{ type: "edit-module", subject: id("Writer"), set: { responsibility: "Drains the queue" } },
			{
				type: "add-module",
				module: { name: "Queue", kind: "queue", groups: ["write-path"], order: 3 },
			},
			{
				type: "add-relationship",
				source: id("Gateway"),
				relationship: { to: "Queue", kind: "queue", label: "enqueues", traffic: {}, order: 1 },
			},
			{
				type: "remove-relationship",
				subject: model.relationships.find((edge) => edge.label === "writes")!.id,
			},
		],
		{ proposal: { type: "create", name: "Proposed queue" } },
	);
	await editCanonicalModel(request, vault, "legible-current", [
		{ type: "edit-module", subject: id("Writer"), set: { responsibility: "Writes the note" } },
	]);

	const browser = resources.use(await createAgentBrowser());
	await browser.run([
		"open",
		`${server.base}/?modelA=${model.manifest.id}&stateA=${proposal.target.state}`,
	]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	// At rest: an arriving picture draws its lines on and gives them their
	// arrowheads last, and what is under test is the picture a reader reads.
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector("${SURFACE}:not([data-picture-motion]) svg") !== null`,
			),
		(atRest) => atRest,
		"the proposal to be drawn in its pane",
		WAIT,
	);
	await switchTheme(browser, "light");

	// The ids the board minted, found the way a viewer finds them.
	const ids = await browser.eval<Record<string, string>>(
		`(() => {` +
			` const found = {};` +
			` for (const group of document.querySelectorAll("${SURFACE} [data-semantic-id]")) {` +
			`   const words = group.textContent.trim();` +
			`   if (words.includes("Writer")) found.writer = group.dataset.semanticId;` +
			`   if (words.includes("Queue")) found.queue = group.dataset.semanticId;` +
			`   if (words === "hands it over") found.hero = group.dataset.semanticId;` +
			`   if (words === "enqueues") found.added = group.dataset.semanticId;` +
			`   if (words === "writes") found.gone = group.dataset.semanticId; }` +
			` return found; })()`,
	);
	expect(Object.keys(ids).toSorted()).toEqual(["added", "gone", "hero", "queue", "writer"]);

	// Every paint in the picture resolves against the page's own tokens.
	expect(await unresolvedPaints(browser, SURFACE)).toEqual([]);

	// One ink from end to end. The band behind the line was already coloured;
	// what a reader could not see is that the line, its arrowhead and its dots
	// belonged to it rather than being grey scenery over the top.
	const added = await edgeInks(browser, SURFACE, ids["added"] ?? "");
	expect(added.head).toBe(added.line);
	expect(sameHue(added.line, added.band)).toBe(true);
	// The pulses carry the relationship's colour with white mixed in, the band's hue.
	expect(added.streams.length).toBe(1);
	for (const stream of added.streams) {
		for (const part of stream.split("|")) {
			expect(sameHue(part, added.band)).toBe(true);
		}
	}
	// A relationship the proposal dropped is still drawn, in its own ink, and
	// sends nothing: a removed line that looked like live traffic would be the
	// picture claiming the proposal still has it.
	const gone = await edgeInks(browser, SURFACE, ids["gone"] ?? "");
	expect(sameHue(gone.line, gone.band)).toBe(true);
	expect(gone.head).toBe(gone.line);
	expect(gone.streams).toHaveLength(0);
	expect(gone.line).not.toBe(added.line);

	// The words on a relationship are on top of the dots crossing it.
	const words = await overThePill(browser, ids["hero"] ?? "");
	expect(words.traffic).toBeGreaterThan(0);
	expect(words.trafficFirst).toBe(true);
	expect(words.hit).not.toEndWith(".ab-pulse");

	// Configured types keep distinct chips even when the nodes share a group.
	const writePath = await iconInk(browser, "Gateway");
	expect(await iconInk(browser, "Queue")).not.toBe(writePath);
	expect(await iconInk(browser, "Ledger")).not.toBe(writePath);

	// What nobody has decided is on the card, with nothing selected — and
	// picking that very card out shows both marks at once, which is the case a
	// single mark per subject used to lose.
	await pollUntil(
		() => marksOn(browser, ids["writer"] ?? ""),
		(marks) => marks.warned && !marks.attended,
		"the unsettled part to be badged before anybody picks anything",
		WAIT,
	);
	await pick(browser, ids["writer"] ?? "");
	await pollUntil(
		() => marksOn(browser, ids["writer"] ?? ""),
		(marks) => marks.warned && marks.attended,
		"the same part to be both badged and ringed once it is picked out",
		WAIT,
	);
	// And the badge is cashed in for words where the reader clicked.
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector("${INSPECTOR} [data-slot='semantic-inspector-waiting'] [data-field='responsibility']") !== null && document.querySelector("${INSPECTOR}")?.textContent.includes('the write path') === true`,
			),
		Boolean,
		"the inspector to explain the warning and name the group",
		WAIT,
	);

	// The other grammar, told in the same language: the plate is over the dots.
	// The views are on the board tab, which the pick moved away from.
	await openModelSidebar(browser);
	await choose(browser, '[data-slot="model-grammar-selector"]', '[data-grammar="sequence"]');
	await choose(browser, '[data-slot="model-flow-selector"]', `[data-flow-id="${flow}"]`);
	await pollUntil(
		() =>
			browser.eval<number>(
				`document.querySelectorAll("${SURFACE} [data-semantic-kind='step']").length`,
			),
		(steps) => steps > 0,
		"the exchange to be drawn",
		WAIT,
	);
	const stepId = await browser.eval<string>(
		`document.querySelector("${SURFACE} [data-semantic-kind='step']").dataset.semanticId`,
	);
	// The exchange's pulses, each in the colours of its message.
	expect(
		await browser.eval<number>(`document.querySelectorAll("${SURFACE} .ab-pulse").length`),
	).toBeGreaterThan(0);
	expect(await unresolvedPaints(browser, SURFACE)).toEqual([]);
	const message = await overThePill(browser, stepId);
	expect(message.traffic).toBeGreaterThan(0);
	expect(message.trafficFirst).toBe(true);
	expect(message.hit).not.toEndWith(".ab-pulse");

	// And all of it again on the other ground. The inks change, because they are
	// picked for the ground they are drawn on; what they say does not.
	const lightIcon = await iconInk(browser, "Gateway");
	await switchTheme(browser, "dark");
	await pollUntil(
		() => iconInk(browser, "Gateway"),
		(ink) => ink !== lightIcon,
		"the picture to take the dark ground's colours",
		WAIT,
	);
	await choose(browser, '[data-slot="model-grammar-selector"]', '[data-grammar="architecture"]');
	await pollUntil(
		() =>
			browser.eval<number>(
				`document.querySelectorAll("${SURFACE} [data-semantic-kind='edge']").length`,
			),
		(edges) => edges > 0,
		"the architecture to be drawn again",
		WAIT,
	);
	expect(await unresolvedPaints(browser, SURFACE)).toEqual([]);
	const darkAdded = await edgeInks(browser, SURFACE, ids["added"] ?? "");
	expect(sameHue(darkAdded.line, darkAdded.band)).toBe(true);
	expect(darkAdded.head).toBe(darkAdded.line);
	expect(darkAdded.line).not.toBe(added.line);
	const darkWritePath = await iconInk(browser, "Gateway");
	expect(await iconInk(browser, "Queue")).not.toBe(darkWritePath);
	expect(await iconInk(browser, "Ledger")).not.toBe(darkWritePath);

	await server.assertRunning();
}, 90_000);
