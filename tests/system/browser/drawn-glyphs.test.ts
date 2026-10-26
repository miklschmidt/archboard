import { expect, test } from "bun:test";
import { join } from "node:path";

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
import { addressShowing, pictureAtRest } from "./support/semantic-page.ts";
import { serverPath } from "./support/navigator-support.ts";
import { assertThemeParity } from "./support/theme-parity.ts";

// The core shapes every word a picture draws, and a picture draws the glyphs it
// was given (ADR 0059). The core says where each glyph stands and how far a run
// advances; nothing else measures. This holds every painter to that in a real
// browser: the page's own core, which draws the pane, and the Bun core, which
// draws a picture for the CLI, an export and the rasterizer. Each run's glyphs
// must stand where the core put them, inside the advance the layout gave the
// run, and the run's words, laid over the glyphs for search and screen
// readers, must cover that same advance.

/** Short on purpose: each wait names itself well inside the owner's budget. */
const WAIT = { timeoutMs: 8_000 } as const;

/** The surface a pane's picture sits in. */
const SURFACE = "[data-slot='semantic-board-surface']";

/** How far a glyph's ink may stand past its run's advance, as a share of the size: a side bearing. */
const BEARING = 0.2;

/** What the board says: cards with notes, labelled relationships, and one flow in two grammars. */
const BOARD = {
	level: "system",
	nodes: [
		{
			name: "Gateway",
			kind: "service",
			responsibility: "Takes every request and waits for AVAST office",
		},
		{ name: "Ledger", kind: "service", responsibility: "Records every transfer" },
		{ name: "Auditor", kind: "service", responsibility: "Reads the ledger nightly, To Vary AWAY" },
	],
	edges: [
		{ from: "Gateway", to: "Ledger", kind: "call", label: "transfer with an audit id" },
		{ from: "Auditor", to: "Ledger", kind: "call", label: "reconcile" },
	],
	flows: [
		{
			name: "One transfer",
			participants: ["Gateway", "Ledger", "Auditor"],
			steps: [
				{ from: "Gateway", to: "Ledger", label: "transfer" },
				{ from: "Auditor", to: "Ledger", label: "difficult affix office" },
				{ from: "Ledger", to: "Gateway", label: "receipt", kind: "return" },
			],
		},
	],
	views: [
		{
			name: "Exchange",
			grammar: "sequence",
			scope: { kind: "selection", flows: ["One transfer"] },
		},
		{ name: "Steps", grammar: "flowchart", scope: { kind: "selection", flows: ["One transfer"] } },
	],
} as const;

/** What one picture's runs came to in the page. */
interface Runs {
	/** How many runs were drawn on screen and checked. */
	readonly checked: number;
	/** Each run that broke the contract, and how. */
	readonly problems: readonly { readonly words: string; readonly why: string }[];
}

/**
 * Check every run of the pictures under a root in the page.
 * @param root A selector for the element the pictures sit in.
 * @returns The expression that checks them.
 */
const runsUnder = (root: string): string => `(() => {
	const problems = [];
	let checked = 0;
	for (const text of document.querySelectorAll(${JSON.stringify(`${root} svg text[textLength]`)})) {
		const words = text.textContent;
		const box = text.getBoundingClientRect();
		if (box.width === 0) continue; // A layer the picture does not show at this distance.
		const glyphs = text.previousElementSibling;
		if (glyphs === null || glyphs.tagName !== "g" || glyphs.getAttribute("aria-hidden") !== "true") {
			if (words.trim() !== "") problems.push({ words, why: "no glyphs before the words" });
			continue;
		}
		checked += 1;
		const scale = text.getScreenCTM().a;
		const size = Number(text.getAttribute("font-size")) * scale;
		const advance = Number(text.getAttribute("textLength"));
		const origin = glyphs.transform.baseVal.consolidate().matrix;
		if (Math.abs(origin.e - text.x.baseVal[0].value) > 0.01 || Math.abs(origin.f - text.y.baseVal[0].value) > 0.01) {
			problems.push({ words, why: "glyphs start away from the words" });
		}
		for (const use of glyphs.querySelectorAll("use")) {
			if (document.getElementById(use.getAttribute("href").slice(1)) === null) {
				problems.push({ words, why: "a glyph the picture does not define" });
			}
		}
		const ink = glyphs.getBoundingClientRect();
		if (ink.left < box.left - ${BEARING} * size || ink.right > box.right + ${BEARING} * size) {
			problems.push({ words, why: "glyphs stand outside the run's advance: " + [ink.left, ink.right, box.left, box.right].join(" ") });
		}
		if (Math.abs(text.getComputedTextLength() - advance) > 0.01 * advance + 0.05) {
			problems.push({ words, why: "the words do not cover the advance: " + text.getComputedTextLength() + " " + advance });
		}
	}
	return { checked, problems };
})()`;

/**
 * Put pictures the server drew into the page, where the browser lays them out.
 * @param browser The page.
 * @param svgs The documents.
 * @returns Settles once they are in.
 */
async function showServerPictures(
	browser: AgentBrowserSession,
	svgs: readonly string[],
): Promise<void> {
	await browser.eval(`(() => {
		const holder = document.createElement("div");
		holder.id = "server-pictures";
		holder.style.cssText = "position:absolute;left:0;top:0;opacity:0.01;pointer-events:none";
		holder.innerHTML = ${JSON.stringify(svgs.join(""))};
		document.body.append(holder);
		return true;
	})()`);
}

test("every painter draws the glyphs where the core put them, and the words are found", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = vaultIn(join(ownerRoot, "glyph-vault"));
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const created = await request<{ success: boolean }>("/api/semantic-boards/create", {
		method: "POST",
		doing: "drawing the ledger",
		body: { board: "ledger", origin: "agent", create: BOARD },
	});
	expect(created.body.success).toBeTrue();

	// The Bun core: the picture of each grammar the render route draws.
	const whole = await request<{ svg: string; views: { id: string }[] }>(
		"/api/semantic-boards/render?board=ledger",
	);
	const drawnByServer = [whole.body.svg];
	for (const view of whole.body.views) {
		const one = await request<{ svg: string }>(
			`/api/semantic-boards/render?board=ledger&view=${view.id}`,
		);
		drawnByServer.push(one.body.svg);
	}
	expect(drawnByServer).toHaveLength(3);

	// The page's core: the picture the pane draws for itself.
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", addressShowing(server.base, "ledger")]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => pictureAtRest(browser.eval.bind(browser)),
		(atRest) => atRest,
		"the board to be drawn in the page",
		WAIT,
	);
	const inPage = await browser.eval<Runs>(runsUnder(SURFACE));
	expect(inPage.problems).toEqual([]);
	expect(inPage.checked).toBeGreaterThan(8);

	await showServerPictures(browser, drawnByServer);
	const byServer = await browser.eval<Runs>(runsUnder("#server-pictures"));
	expect(byServer.problems).toEqual([]);
	expect(byServer.checked).toBeGreaterThan(3 * 8);

	// A page search finds the words of a picture, in the picture. The pane's
	// own picture takes no selection, as the shell keeps it, so the search
	// goes on past it, and past the sidebar, to the pictures the server drew.
	const found = await browser.eval<boolean>(`(() => {
		const pictures = document.querySelector("#server-pictures");
		getSelection().removeAllRanges();
		for (let match = 0; match < 10 && window.find("Records every transfer"); match += 1) {
			if (pictures.contains(getSelection().anchorNode)) return true;
		}
		return false;
	})()`);
	expect(found).toBeTrue();

	await assertThemeParity(browser);
	await server.assertRunning();
}, 40_000);
