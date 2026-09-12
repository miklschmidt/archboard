import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { createJsonRequester } from "../support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { serverPath } from "./support/navigator-support.ts";
import { emulateMedia } from "./support/shell-render-matrix.ts";

/**
 * How long any one thing here is waited for. Short on purpose: this test does a
 * dozen small waits, and one that hangs must name itself well inside the
 * owner's own budget rather than swallowing it.
 */
const WAIT = { timeoutMs: 6_000 } as const;

/** The stage one semantic pane draws into. */
const STAGE = "[data-slot='semantic-board-stage']";

/** The element the camera moves. */
const SURFACE = "[data-slot='semantic-board-surface']";

/** The stage's tab stop: what hears the keys. */
const VIEWPORT = "[data-slot='semantic-board-viewport']";

/**
 * Which of the pane's states is on screen.
 * @param browser The page.
 * @returns The `data-state`, or null before the pane is there.
 */
const stageState = (browser: AgentBrowserSession): Promise<string | null> =>
	browser.eval<string | null>(
		`document.querySelector("${STAGE}")?.getAttribute("data-state") ?? null`,
	);

/**
 * Where the pane is looking, as the surface's transform says.
 * @param browser The page.
 * @returns The transform, or an empty string before there is one.
 */
const cameraTransform = (browser: AgentBrowserSession): Promise<string> =>
	browser.eval<string>(`document.querySelector("${SURFACE}")?.style.transform ?? ""`);

/**
 * Press one key on the stage, the way a person whose hands are on the keyboard
 * does: the stage is focused first, so this also proves it is reachable.
 * @param browser The page.
 * @param key The key.
 * @returns Settles once the key has been delivered.
 */
const pressOnStage = (browser: AgentBrowserSession, key: string): Promise<unknown> =>
	browser.eval(
		`(() => { const stage = document.querySelector("${VIEWPORT}"); stage.focus();` +
			` stage.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true })); })()`,
	);

/**
 * The search parameters the address bar is showing.
 * @param browser The page.
 * @returns The query string, without its leading question mark.
 */
const addressSearch = (browser: AgentBrowserSession): Promise<string> =>
	browser.eval<string>("window.location.search.replace(/^\\?/, '')");

test("a semantic board opens in a real pane, and the vault gets no note for it", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "semantic-vault");
	mkdirSync(vault, { recursive: true });
	const canvas = await startOwnedCanvas({ serverPath, vault, env: canvasTestEnvironment() });
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);

	// An agent authors the meaning. Nothing about geometry is stated anywhere.
	const created = await request<{ success: boolean }>("/api/semantic-boards/create", {
		method: "POST",
		doing: "drawing the pipeline",
		body: {
			board: "pipeline",
			origin: "agent",
			writerId: "browser-owner",
			create: {
				nodes: [
					{ name: "Ingest", kind: "service", responsibility: "Takes the feed" },
					{ name: "Warehouse", kind: "datastore", responsibility: "Keeps the rows" },
				],
				edges: [{ from: "Ingest", to: "Warehouse", kind: "data", label: "rows" }],
			},
		},
	});
	expect(created.status).toBe(200);
	expect(created.body.success).toBe(true);

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${canvas.base}/?paneA=pipeline`]);
	await browser.run(["set", "viewport", "1920", "1080"]);

	// The pane draws the server's picture, in the real shell, without the
	// address being rewritten to something else.
	await pollUntil(
		() => stageState(browser),
		(state) => state === "drawn",
		"the semantic board to be drawn in its pane",
		WAIT,
	);
	expect(await addressSearch(browser)).toBe("paneA=pipeline");
	const subjects = await browser.eval<number>(
		`document.querySelectorAll("${SURFACE} [data-semantic-id]").length`,
	);
	expect(subjects).toBeGreaterThan(0);
	expect(await browser.eval<boolean>(`document.querySelector("${SURFACE} svg") !== null`)).toBe(
		true,
	);
	expect(await browser.eval<string>(`document.querySelector("${SURFACE}").textContent`)).toContain(
		"Ingest",
	);

	// A card can be picked out, and the picture says which one is picked.
	//
	// The whole pointer sequence, the way a browser really delivers one: press on
	// the card, release and click on the viewport. A browser retargets the click
	// to whichever element holds the pointer, so a test that only dispatched a
	// click on the card would pass while every real click picked nothing — which
	// is exactly what happened before this was written this way.
	const picked = await browser.eval<string | null>(
		`(() => {` +
			` const card = document.querySelector("${SURFACE} [data-semantic-kind='node']");` +
			` const view = document.querySelector("${VIEWPORT}");` +
			` const at = card.getBoundingClientRect();` +
			` const where = { pointerId: 1, isPrimary: true, button: 0, bubbles: true,` +
			`   clientX: Math.round(at.x + at.width / 2), clientY: Math.round(at.y + at.height / 2) };` +
			` card.dispatchEvent(new PointerEvent("pointerdown", where));` +
			` view.dispatchEvent(new PointerEvent("pointerup", where));` +
			` view.dispatchEvent(new MouseEvent("click", where));` +
			` return card.getAttribute("data-semantic-id"); })()`,
	);
	expect(picked).not.toBeNull();
	// Every semantic id is one to eight characters of the block-id alphabet, so
	// it goes into a selector as it is.
	const card = `${SURFACE} [data-semantic-id='${picked ?? ""}']`;
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector("${card}").classList.contains("is-selected")`),
		(selected) => selected,
		"the card that was clicked to be drawn as selected",
		WAIT,
	);

	// Escape gives it back.
	await pressOnStage(browser, "Escape");
	await pollUntil(
		() => browser.eval<number>(`document.querySelectorAll("${SURFACE} .is-selected").length`),
		(count) => count === 0,
		"Escape to clear the selection",
		WAIT,
	);

	// Pan and zoom are the browser's, and both move the camera.
	const fitted = await cameraTransform(browser);
	expect(fitted).toContain("scale(");
	await pressOnStage(browser, "ArrowLeft");
	const panned = await pollUntil(
		() => cameraTransform(browser),
		(transform) => transform !== fitted,
		"an arrow key to pan the diagram",
		WAIT,
	);
	await pressOnStage(browser, "+");
	const zoomed = await pollUntil(
		() => cameraTransform(browser),
		(transform) => transform !== panned,
		"a zoom key to magnify the diagram",
		WAIT,
	);
	await pressOnStage(browser, "0");
	await pollUntil(
		() => cameraTransform(browser),
		(transform) => transform === fitted && transform !== zoomed,
		"the fit key to put the whole diagram back",
		WAIT,
	);

	// The promise ADR 0023 makes about an existing vault: a semantic board is a
	// board of its own and nothing installs a legacy note for it.
	expect(existsSync(join(vault, "pipeline.semantic.json"))).toBe(true);
	expect(existsSync(join(vault, "pipeline.excalidraw.md"))).toBe(false);
	expect(readdirSync(vault).filter((name) => name.startsWith("pipeline."))).toEqual([
		"pipeline.semantic.json",
	]);

	await canvas.assertRunning();
}, 30_000);

/** How many travelling dots the drawn picture carries. */
const dotsDrawn = (browser: AgentBrowserSession): Promise<number> =>
	browser.eval<number>(`document.querySelectorAll("${SURFACE} circle.ab-pulse").length`);

/** How many of them the browser actually shows. */
const dotsShown = (browser: AgentBrowserSession): Promise<number> =>
	browser.eval<number>(
		`[...document.querySelectorAll("${SURFACE} circle.ab-pulse")]` +
			`.filter((dot) => getComputedStyle(dot).display !== "none").length`,
	);

test("a relationship that carries traffic moves, unless the reader asked it not to", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "semantic-motion-vault");
	mkdirSync(vault, { recursive: true });
	const canvas = await startOwnedCanvas({ serverPath, vault, env: canvasTestEnvironment() });
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);

	// One relationship something travels along, and one that is a fact about how
	// the two parts are built.
	expect(
		(
			await request<{ success: boolean }>("/api/semantic-boards/create", {
				method: "POST",
				doing: "drawing something that moves",
				body: {
					board: "moving",
					origin: "agent",
					create: {
						nodes: [
							{ name: "API", kind: "service", responsibility: "Takes requests" },
							{ name: "Store", kind: "datastore" },
						],
						edges: [
							{ from: "API", to: "Store", kind: "call", label: "reads", emphasis: "hero" },
							{ from: "API", to: "Store", kind: "dependency" },
						],
					},
				},
			})
		).status,
	).toBe(200);

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${canvas.base}/?paneA=moving`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => stageState(browser),
		(state) => state === "drawn",
		"the board to be drawn in its pane",
		WAIT,
	);

	// Three dots on the hero line and none on the dependency: the picture says
	// which of the two carries traffic, which is the whole point of the marks.
	expect(await dotsDrawn(browser)).toBe(3);

	// The same picture, for somebody whose system says they want less motion:
	// none of the dots is shown. The picture itself answers that — its own
	// stylesheet does, in the same document — so no second render is fetched and
	// the pane does not flicker back through its loading state to comply.
	const restore = await emulateMedia(browser, "light", "reduced-motion");
	try {
		await pollUntil(
			() => dotsShown(browser),
			(shown) => shown === 0,
			"the drawn dots to be hidden from a reader who asked for less motion",
			WAIT,
		);
		expect(await stageState(browser)).toBe("drawn");
	} finally {
		await restore();
	}
	// And back, without a round trip: the preference is read by the document.
	await pollUntil(
		() => dotsShown(browser),
		(shown) => shown === 3,
		"the dots to come back for a reader who has asked for nothing",
		WAIT,
	);

	await canvas.assertRunning();
}, 60_000);
