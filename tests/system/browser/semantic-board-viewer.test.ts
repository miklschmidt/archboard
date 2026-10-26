import { expect, test } from "bun:test";
import {
	cpSync,
	existsSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { ArchitectureModelRead } from "@archboard/board/model";

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
import { serverPath, servedRepository } from "./support/navigator-support.ts";
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

test("canonical modules open their authored details without writing architecture", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = vaultIn(join(ownerRoot, "canonical-vault"));
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const before = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!before.body.success) throw new Error(before.body.error);
	const revision = before.body.revision;
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	const modelState = (): Promise<string | null> =>
		browser.eval<string | null>(
			`document.querySelector('[data-slot="architecture-model-stage"]')?.getAttribute('data-state') ?? null`,
		);
	await pollUntil(modelState, (state) => state === "ready", "the canonical model to open", WAIT);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector('[data-slot="pane-header"] output') === null`),
		(connected) => connected,
		"the model pane to connect",
		WAIT,
	);
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-slot="module-list"] [data-module-id]')].map(row => row.getAttribute('data-module-id'))`,
		),
	).toEqual(["Shop#Worker", "Shop#Gateway"]);
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Gateway"]']);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="module-details"]')?.getAttribute('data-module-id') ?? null`,
			),
		(id) => id === "Shop#Gateway",
		"the selected module details to open",
		WAIT,
	);
	const details = await browser.eval<string>(
		`document.querySelector('[data-slot="module-details"]').textContent`,
	);
	// Authored values are behavior. Product wording is not pinned by this test.
	expect(details).toContain("Accepts shopping requests");
	expect(details).toContain("Authenticates callers and sends shopping requests to the worker.");
	expect(details).toContain("src/gateway.ts");
	expect(details).toContain("docs/gateway.md");
	expect(details).toContain("Dispatch request");
	const after = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!after.body.success) throw new Error(after.body.error);
	expect(after.body.revision).toEqual(revision);

	// A middleware refusal keeps its code and recovery message, even outside the model schema.
	const movedVault = `${vault}-moved`;
	renameSync(vault, movedVault);
	await browser.run(["click", '[data-slot="model-refresh"]']);
	await pollUntil(modelState, (state) => state === "error", "the unavailable vault refusal", WAIT);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="model-error"]')?.getAttribute('data-code') ?? null`,
		),
	).toBe("VAULT_UNREADABLE");
	renameSync(movedVault, vault);
	await browser.run(["click", '[data-slot="model-refresh"]']);
	await pollUntil(modelState, (state) => state === "ready", "the restored vault to reopen", WAIT);

	// A failed refresh exposes the refusal, and a repaired input can be read again.
	const gatewayPath = join(vault, "gateway.module.json");
	const gateway = readFileSync(gatewayPath, "utf8");
	writeFileSync(gatewayPath, "{");
	await browser.run(["click", '[data-slot="model-refresh"]']);
	await pollUntil(modelState, (state) => state === "error", "the invalid model refusal", WAIT);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="model-error"]')?.getAttribute('data-code') ?? null`,
		),
	).toBe("MODEL_INVALID");
	writeFileSync(gatewayPath, gateway);
	await browser.run(["click", '[data-slot="model-refresh"]']);
	await pollUntil(modelState, (state) => state === "ready", "the repaired model to reopen", WAIT);
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Gateway"]']);
	for (const module of before.body.modules) rmSync(join(vault, module.file));
	await browser.run(["click", '[data-slot="model-refresh"]']);
	await pollUntil(
		() =>
			browser.eval<number>(
				`document.querySelector('[data-slot="module-list"]')?.childElementCount ?? -1`,
			),
		(count) => count === 0,
		"the empty model to remain readable",
		WAIT,
	);
	expect(await modelState()).toBe("ready");
	expect(
		await browser.eval<boolean>(`document.querySelector('[data-slot="module-details"]') === null`),
	).toBe(true);
	await server.assertRunning();
}, 30_000);

test("a semantic board opens in a real pane, and the vault gets no note for it", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = vaultIn(join(ownerRoot, "semantic-vault"));
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const repo = await servedRepository(server.base);
	const request = createJsonRequester(server);

	// An agent authors the meaning. Nothing about geometry is stated anywhere.
	const created = await request<{ success: boolean }>("/api/semantic-boards/create", {
		method: "POST",
		doing: "drawing the pipeline",
		body: {
			board: "pipeline",
			origin: "agent",
			writerId: "browser-owner",
			create: {
				level: "system",
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
	await browser.run(["open", `${server.base}/?paneA=pipeline`]);
	await browser.run(["set", "viewport", "1920", "1080"]);

	// The pane draws the server's picture, in the real shell, without the
	// address being rewritten to something else.
	await pollUntil(
		() => stageState(browser),
		(state) => state === "drawn",
		"the semantic board to be drawn in its pane",
		WAIT,
	);
	expect(await addressSearch(browser)).toBe(`paneA=pipeline&repoA=${repo}`);
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

	// A board is one document (ADR 0023): drawing it writes nothing beside it.
	expect(existsSync(join(vault, "pipeline.semantic.json"))).toBe(true);
	expect(readdirSync(vault).filter((name) => name.startsWith("pipeline."))).toEqual([
		"pipeline.semantic.json",
	]);

	await server.assertRunning();
}, 30_000);

/** How many travelling traffic streams the drawn picture carries. */
const trafficPathsDrawn = (browser: AgentBrowserSession): Promise<number> =>
	browser.eval<number>(`document.querySelectorAll("${SURFACE} .ab-pulse").length`);

/** How many of them the browser actually shows. */
const trafficPathsShown = (browser: AgentBrowserSession): Promise<number> =>
	browser.eval<number>(
		`[...document.querySelectorAll("${SURFACE} .ab-pulse")]` +
			`.filter((dot) => getComputedStyle(dot).display !== "none").length`,
	);

test("a relationship that carries traffic moves, unless the reader asked it not to", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = vaultIn(join(ownerRoot, "semantic-motion-vault"));
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);

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
						level: "system",
						nodes: [
							{ name: "API", kind: "service", responsibility: "Takes requests" },
							{ name: "Store", kind: "datastore" },
						],
						edges: [
							{
								from: "API",
								to: "Store",
								kind: "call",
								label: "reads",
								emphasis: "hero",
								traffic: {},
							},
							{ from: "API", to: "Store", kind: "dependency" },
						],
					},
				},
			})
		).status,
	).toBe(200);

	const browser = resources.use(await createAgentBrowser());
	// Everything draws the two relationships apart; the overview joins them into one line.
	await browser.run(["open", `${server.base}/?paneA=moving&viewA=Everything`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => stageState(browser),
		(state) => state === "drawn",
		"the board to be drawn in its pane",
		WAIT,
	);

	// One traffic stream on the call and none on the dependency: the picture says
	// which of the two carries traffic, which is the whole point of the marks.
	expect(await trafficPathsDrawn(browser)).toBe(1);

	// The same picture, for somebody whose system says they want less motion:
	// none of the dots is shown. The picture itself answers that — its own
	// stylesheet does, in the same document — so no second render is fetched and
	// the pane does not flicker back through its loading state to comply.
	const restore = await emulateMedia(browser, "light", "reduced-motion");
	try {
		await pollUntil(
			() => trafficPathsShown(browser),
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
		() => trafficPathsShown(browser),
		(shown) => shown === 1,
		"the dots to come back for a reader who has asked for nothing",
		WAIT,
	);

	await server.assertRunning();
}, 60_000);
