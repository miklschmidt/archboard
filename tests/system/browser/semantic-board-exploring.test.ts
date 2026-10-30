import { expect, test } from "bun:test";
import { join } from "node:path";

import { createJsonRequester } from "../support/http.ts";
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
import {
	DRILL_OPEN,
	STAGE,
	SURFACE,
	VIEWPORT,
	WAIT,
	drawnId,
	pick,
	shownBoard,
	stageState,
} from "./support/drilling.ts";
import { serverPath } from "./support/navigator-support.ts";

// Exploring a board in a real browser: a card opens by flying into it, the
// part a person pokes lights what it is wired to along the whole of each route,
// and the picture keeps its relationships' words, lit or not, near or far. A
// flight from far swaps no card's words for its name in the air, and the board
// it opens takes its own far view once, with the picture's fade, after it has
// taken over.
//
// What the stage's module owners cannot see is the page around them: the style
// sheet that makes the rest recede, the layout that gives the flight its
// geometry, and the browser's own clock for the flight. The module owners hold
// the arithmetic and the order of events; this one holds that what a person
// sees is what they say.

/** What a page-side recorder saw of one flight between two boards. */
interface Flight {
	readonly before: string | null;
	readonly after: string | null;
	/** How many frames showed the board inside its card. */
	readonly frames: number;
	/** How the board inside its card was drawn: any filter on one of its parts. */
	readonly filters: readonly string[];
	/** Where the board inside its card was in the last frame that showed it: x, y, width, height. */
	readonly last: readonly number[] | null;
	/** Where the picture the pane landed on is: x, y, width, height. */
	readonly landed: readonly number[];
	/** Where the card that was asked about is in that picture, or null when none was. */
	readonly card: readonly number[] | null;
	readonly insetsAfter: number;
	/** Whether the picture the pane landed on was still coming in. */
	readonly entering: boolean;
	/** For each change of the surface's far view, whether the board flown from was still on screen. */
	readonly swaps: readonly ("before" | "after")[];
	/** How many cards began to fade between their words and their name while the board flown from was on screen. */
	readonly fadesBefore: number;
	/** How many began once the board flown to was on screen. */
	readonly fadesAfter: number;
}

/**
 * Wait for the pane to come to rest: its picture has come in, and its camera has
 * stopped and stays where it is for longer than the pane takes to settle after
 * a window is sized or a board lands. A card opened in the middle of that is
 * opened the plain way, and this test is about the flight.
 * @param browser The page.
 * @returns Settles once the camera has held still across two looks.
 */
async function atRest(browser: AgentBrowserSession): Promise<void> {
	let last = "";
	await pollUntil(
		async () => {
			const now = await browser.eval<string>(
				`(() => { const surface = document.querySelector("${SURFACE}");` +
					` return surface.hasAttribute("data-camera-motion") || surface.hasAttribute("data-picture-motion")` +
					`   ? "moving" : surface.style.transform; })()`,
			);
			const still = now !== "moving" && now === last;
			last = now;
			return still;
		},
		(still) => still,
		"the pane to come to rest",
		{ ...WAIT, intervalMs: 250 },
	);
}

/**
 * Make a move that changes the board and record the flight it makes.
 * @param browser The page.
 * @param start A script that makes the move, in the page.
 * @param card The id of a card to find in the picture the pane lands on, if one is wanted.
 * @returns What the recorder saw.
 */
function recordFlight(
	browser: AgentBrowserSession,
	start: string,
	card: string | null = null,
): Promise<Flight> {
	// Every frame the camera draws writes the surface's transform, and the observer
	// hears it before anything else can run, so the last frame of the flight is
	// seen however soon the board takes over from it.
	return browser.eval<Flight>(
		`(async () => {` +
			` const stage = document.querySelector("${STAGE}");` +
			` const surface = document.querySelector("${SURFACE}");` +
			` const before = stage.dataset.board;` +
			` let frames = 0; let last = null; const filters = new Set();` +
			` const watch = new MutationObserver(() => {` +
			`   const inset = surface.querySelector("[data-dive-inset]");` +
			`   if (!inset) return;` +
			`   const at = inset.getBoundingClientRect(); last = [at.x, at.y, at.width, at.height]; frames += 1;` +
			`   const part = inset.querySelector("[data-semantic-id]");` +
			`   if (part) filters.add(getComputedStyle(part).filter); });` +
			` watch.observe(surface, { attributes: true, attributeFilter: ["style"] });` +
			// What the surface's far view was before each change of its class, and whether the board flown from was shown then.
			` const classes = []; const far = (value) => (value || "").split(/\\s+/).includes("is-far");` +
			` const note = (records) => { for (const r of records) classes.push([stage.dataset.board === before ? "before" : "after", far(r.oldValue)]); };` +
			` const classWatch = new MutationObserver(note);` +
			` classWatch.observe(surface, { attributes: true, attributeOldValue: true, attributeFilter: ["class"] });` +
			` let fadesBefore = 0; let fadesAfter = 0;` +
			` const fade = (e) => { const layer = e.target.classList;` +
			`   if (e.propertyName !== "opacity" || !layer || !(layer.contains("ab-near") || layer.contains("ab-far"))) return;` +
			`   if (stage.dataset.board === before) fadesBefore += 1; else fadesAfter += 1; };` +
			` stage.addEventListener("transitionrun", fade, true);` +
			` ${start};` +
			` const until = Date.now() + 8000;` +
			` while (stage.dataset.board === before && Date.now() < until) await new Promise((r) => setTimeout(r, 20));` +
			` const entering = surface.hasAttribute("data-picture-motion");` +
			` await new Promise((r) => setTimeout(r, 150));` +
			` watch.disconnect(); note(classWatch.takeRecords()); classWatch.disconnect();` +
			` stage.removeEventListener("transitionrun", fade, true);` +
			` const states = [...classes.map(([, was]) => was), surface.classList.contains("is-far")];` +
			` const swaps = classes.flatMap(([when], index) => states[index] === states[index + 1] ? [] : [when]);` +
			` const landed = surface.querySelector(":scope > svg").getBoundingClientRect();` +
			// The card's own box, its first rect: the shadow it casts reaches further down and right.
			` const found = ${JSON.stringify(card)} === null ? null` +
			`   : surface.querySelector("[data-semantic-id='" + ${JSON.stringify(card)} + "'] > rect:not(.ab-halo)")?.getBoundingClientRect() ?? null;` +
			` return { before, after: stage.dataset.board, frames, filters: [...filters], last,` +
			`   landed: [landed.x, landed.y, landed.width, landed.height],` +
			`   card: found === null ? null : [found.x, found.y, found.width, found.height],` +
			`   insetsAfter: surface.querySelectorAll("[data-dive-inset]").length, entering,` +
			`   swaps, fadesBefore, fadesAfter }; })()`,
	);
}

/**
 * Expect the board the pane landed on to stand where the board inside the card
 * stood in the last frame of the flight, give or take the width of a line.
 * @param flight What the recorder saw.
 */
function expectLandedWhereItWas(flight: Flight): void {
	expect(flight.frames).toBeGreaterThan(3);
	expect(flight.insetsAfter).toBe(0);
	const last = flight.last ?? [];
	for (const [index, want] of flight.landed.entries()) {
		expect(Math.abs((last[index] ?? Number.NaN) - want)).toBeLessThan(2);
	}
	// Taken over by the board itself, not brought in again.
	expect(flight.entering).toBe(false);
}

/**
 * Expect the board that was left to end the flight inside the card that opened
 * it, in the middle of the card, with the picture above landed whole.
 * @param flight What the recorder saw.
 */
function expectShrunkIntoItsCard(flight: Flight): void {
	expect(flight.frames).toBeGreaterThan(3);
	expect(flight.insetsAfter).toBe(0);
	expect(flight.entering).toBe(false);
	const [x = Number.NaN, y = Number.NaN, width = Number.NaN, height = Number.NaN] =
		flight.last ?? [];
	const [cardX = Number.NaN, cardY = Number.NaN, cardWidth = Number.NaN, cardHeight = Number.NaN] =
		flight.card ?? [];
	expect(Math.abs(x + width / 2 - (cardX + cardWidth / 2))).toBeLessThan(2);
	expect(Math.abs(y + height / 2 - (cardY + cardHeight / 2))).toBeLessThan(2);
	expect(width).toBeLessThan(cardWidth);
	expect(height).toBeLessThan(cardHeight);
}

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

/**
 * Press a key at the stage, the way a person at its tab stop does.
 * @param browser The page.
 * @param key The key.
 * @param times How many times.
 * @returns Settles once the keys have been delivered.
 */
function pressKey(browser: AgentBrowserSession, key: string, times = 1): Promise<unknown> {
	return browser.eval(
		`(() => { const view = document.querySelector("${VIEWPORT}");` +
			` for (let i = 0; i < ${times}; i += 1)` +
			`   view.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true })); })()`,
	);
}

test("a board opens by flying into its card, a poke lights what it is wired to, and every label stays", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = vaultIn(join(ownerRoot, "exploring", "vault"));
	const server = await startOwnedServer({
		serverPath,
		vault,
		env: serverTestEnvironment(),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);

	const engine = await request<{ success: boolean }>("/api/semantic-boards/create", {
		method: "POST",
		doing: "drawing the engine",
		body: {
			board: "engine",
			origin: "agent",
			create: {
				level: "module",
				nodes: [
					{ name: "Atomic write", kind: "module" },
					{ name: "Fsync", kind: "module" },
					{ name: "Journal", kind: "module" },
				],
				edges: [
					{ from: "Atomic write", to: "Fsync", kind: "call", label: "flushes" },
					{ from: "Atomic write", to: "Journal", kind: "call", label: "records" },
				],
			},
		},
	});
	expect(engine.status).toBe(200);
	const pipeline = await request<{ success: boolean }>("/api/semantic-boards/create", {
		method: "POST",
		doing: "drawing the pipeline",
		body: {
			board: "pipeline",
			origin: "agent",
			create: {
				level: "system",
				nodes: [
					{
						name: "Board writer",
						kind: "module",
						drillDown: { board: "engine", variant: { kind: "current" } },
					},
					{ name: "Renderer", kind: "module" },
					{ name: "Viewer", kind: "module" },
					{ name: "Archive", kind: "module" },
				],
				edges: [
					{ from: "Board writer", to: "Renderer", kind: "call", label: "draws" },
					{ from: "Renderer", to: "Viewer", kind: "call", label: "shows" },
					{ from: "Archive", to: "Viewer", kind: "data", label: "replays" },
				],
			},
		},
	});
	expect(pipeline.status).toBe(200);
	// One module calls three others, whose routes leave it along one lane.
	const fanout = await request<{ success: boolean }>("/api/semantic-boards/create", {
		method: "POST",
		doing: "drawing the fan-out",
		body: {
			board: "fanout",
			origin: "agent",
			create: {
				level: "module",
				nodes: ["Hub", "North", "South", "East"].map((name) => ({ name, kind: "module" })),
				edges: ["North", "South", "East"].map((to) => ({
					from: "Hub",
					to,
					kind: "call",
					label: `asks ${to}`,
				})),
			},
		},
	});
	expect(fanout.status).toBe(200);

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/?paneA=pipeline`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => stageState(browser),
		(state) => state === "drawn",
		"the board the pane was opened on to be drawn",
		WAIT,
	);

	// A card that opens a board is a window onto it: pick it, follow its link,
	// and the board grows out of the card into the pane.
	const writer = await drawnId(browser, "Board writer");
	await pick(browser, writer);
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector("${DRILL_OPEN}") !== null`),
		(offered) => offered,
		"the picked card to offer the board it opens",
		WAIT,
	);
	await atRest(browser);
	const into = await recordFlight(browser, `document.querySelector("${DRILL_OPEN}").click()`);
	expect(into.before).toBe("pipeline");
	expect(into.after).toBe("engine");
	expectLandedWhereItWas(into);
	// What the surface says of the picked card's neighbours is not said of the
	// board inside it: the board in the card is drawn as it will be, not receded.
	expect(into.filters.every((filter) => filter === "none")).toBe(true);

	// And the same flight the other way, from the place in the header that names the board above.
	await atRest(browser);
	const out = await recordFlight(
		browser,
		`document.querySelector("nav[aria-label='Where this board sits'] button").click()`,
		writer,
	);
	expect(out.before).toBe("engine");
	expect(out.after).toBe("pipeline");
	expectShrunkIntoItsCard(out);
	expect(out.filters.every((filter) => filter === "none")).toBe(true);
	expect(await shownBoard(browser)).toBe("pipeline");

	// Poke a card: what it is wired to stays as drawn and the rest recedes.
	const renderer = await drawnId(browser, "Renderer");
	await pick(browser, renderer);
	const receded = await pollUntil(
		() => filtersByName(browser),
		(filters) => (filters["Archive"] ?? "none") !== "none",
		"the part the poked card is not wired to to recede",
		WAIT,
	);
	expect(receded["Renderer"]).toBe("none");
	expect(receded["Viewer"]).toBe("none");
	expect(receded["Board"]).toBe("none");
	expect(receded["Archive"]).toContain("opacity");
	// The label of a relationship the poke does not light recedes to half at most,
	// so its words can still be read, and the lit ones stay as drawn.
	// Polled until it has receded as far as it goes: a label that recedes too far
	// passes half on its way down and fails below.
	const poked = await pollUntil(
		() => labelLooks(browser),
		(looks) => looks.some(({ words, filtered }) => words === "replays" && filtered <= 0.5),
		"the label the poke does not light to recede",
		WAIT,
	);
	expect(poked.map(({ words }) => words).toSorted()).toEqual(["draws", "replays", "shows"]);
	for (const look of poked) {
		expect(look.drawn).toBe(true);
		expect(look.opacity).toBe(1);
		expect(look.filtered).toBe(look.words === "replays" ? 0.5 : 1);
	}

	// Let go and zoom out: seen from far, every relationship's label is drawn as it is near.
	await pressKey(browser, "Escape");
	await pollUntil(
		() => filtersByName(browser),
		(filters) => Object.values(filters).every((filter) => filter === "none"),
		"the picture to come back once the poke is let go",
		WAIT,
	);
	await pressKey(browser, "-", 30);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector("${SURFACE}").classList.contains("is-far")`),
		(far) => far,
		"the picture to be seen from far",
		WAIT,
	);
	const far = await labelLooks(browser);
	expect(far).toHaveLength(3);
	for (const look of far) expect(look).toMatchObject({ drawn: true, opacity: 1, filtered: 1 });

	// Seen from far, the card opens its board by flight too. No card swaps its words
	// for its name in the air or as the board takes over. The board, which its own
	// fit sees near, then swaps once, with the picture's fade.
	await pick(browser, writer);
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector("${DRILL_OPEN}") !== null`),
		(offered) => offered,
		"the picked card to offer the board it opens",
		WAIT,
	);
	await atRest(browser);
	const fromFar = await recordFlight(browser, `document.querySelector("${DRILL_OPEN}").click()`);
	expect(fromFar.after).toBe("engine");
	expectLandedWhereItWas(fromFar);
	expect(fromFar.fadesBefore).toBe(0);
	expect(fromFar.swaps).toEqual(["after"]);
	expect(fromFar.fadesAfter).toBeGreaterThan(0);

	// A relationship is lit along the whole of its route, though the picture has
	// another line of its trunk draw the first stretch of it.
	// This fixture shares that masked trunk in Track. Keep the flight checks above on the default.
	await browser.eval(`localStorage.setItem("archboard.layout-engine", "track")`);
	await browser.run(["open", `${server.base}/?paneA=fanout`]);
	await pollUntil(
		() => stageState(browser),
		(state) => state === "drawn",
		"the fan-out to be drawn",
		WAIT,
	);
	await pick(browser, await drawnId(browser, "East"));
	const ink = await pollUntil(
		() => litInk(browser),
		(found) => found.trunked > 0,
		"the poked card's line to be one the picture cuts a stretch out of",
		WAIT,
	);
	expect(ink.cut).toBe(0);
});
