import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
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
import { addressShowing, seedSemanticBoard, stageState } from "./support/semantic-page.ts";

// The canvas draws its pictures in the page (TASK-247): the board it read, laid
// out by engine workers in this browser, measured by this browser's canvas.
// What only a real page can show is that the whole of that happens here — no
// picture is asked of the server, the icons a picture names arrive, a picture
// this browser already drew is shown again without laying anything out, and a
// change to the board is drawn again.

/** Short on purpose: each wait names itself well inside the owner's budget. */
const WAIT = { timeoutMs: 8_000 } as const;

/** The surface a pane's picture sits in. */
const SURFACE = "[data-slot='semantic-board-surface']";

/**
 * Every resource this page has fetched, by URL.
 * @param browser The page.
 * @returns The URLs.
 */
const fetched = (browser: AgentBrowserSession): Promise<string[]> =>
	browser.eval<string[]>(`performance.getEntriesByType("resource").map((entry) => entry.name)`);

/**
 * Wait for the pane to have drawn.
 * @param browser The page.
 * @param what What is being waited for.
 * @returns Settles once it has.
 */
const drawn = (browser: AgentBrowserSession, what: string): Promise<string | null> =>
	pollUntil(
		() => stageState(browser.eval.bind(browser)),
		(state) => state === "drawn",
		what,
		WAIT,
	);

test("the page draws a board itself, keeps the picture, and draws it again when the board changes", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "drawn-here-vault");
	mkdirSync(vault, { recursive: true });
	const canvas = await startOwnedCanvas({ serverPath, vault, env: canvasTestEnvironment() });
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);
	await seedSemanticBoard(request, "pipeline");

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", addressShowing(canvas.base, "pipeline")]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await drawn(browser, "the board to be drawn in the page");

	// Drawn here: the engine worker started, the icons were fetched by name, and
	// the server's render route was never asked.
	const first = await fetched(browser);
	expect(first.some((url) => url.includes("/api/semantic-boards/render"))).toBeFalse();
	expect(first.some((url) => url.includes("worker.browser"))).toBeTrue();
	expect(first.some((url) => url.includes("/assets/diagram-icons/"))).toBeTrue();
	expect(
		await browser.eval<boolean>(
			`document.querySelector("${SURFACE} [data-type-icon] path") !== null`,
		),
	).toBeTrue();
	expect(
		await browser.eval<number>(
			`Object.keys(localStorage).filter((key) => key.startsWith("archboard.picture:")).length`,
		),
	).toBeGreaterThan(0);

	// Opened again: the kept picture is shown, and nothing is laid out for it.
	await browser.run(["open", addressShowing(canvas.base, "pipeline")]);
	await drawn(browser, "the kept picture to be shown after the page is opened again");
	expect(await browser.eval<string>(`document.querySelector("${SURFACE}").textContent`)).toContain(
		"Ingest",
	);
	expect((await fetched(browser)).some((url) => url.includes("worker.browser"))).toBeFalse();

	// The board changes: the pane is told, and the new version is drawn here.
	const wrote = await request<{ version: number }>("/api/semantic-boards/edit?expectVersion=1", {
		method: "POST",
		doing: "adding the ledger",
		body: { board: "pipeline", edit: { nodes: [{ name: "Ledger", kind: "datastore" }] } },
	});
	expect(wrote.status).toBe(200);
	await pollUntil(
		() => browser.eval<string>(`document.querySelector("${SURFACE}")?.textContent ?? ""`),
		(text) => text.includes("Ledger"),
		"the board's new version to be drawn in the page",
		WAIT,
	);
	const after = await fetched(browser);
	expect(after.some((url) => url.includes("/api/semantic-boards/render"))).toBeFalse();
	expect(after.some((url) => url.includes("worker.browser"))).toBeTrue();

	await canvas.assertRunning();
}, 40_000);
