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
import { serverPath } from "./support/navigator-support.ts";
import { switchTheme } from "./support/shell-dom.ts";
import {
	seedCanonicalModel,
	modelAddress,
	modelDrawn,
	editCanonicalModel,
} from "./support/canonical-page.ts";
import { initializeSource } from "./support/canonical-model.ts";

// The canvas draws its pictures in the page (TASK-247): the board it read, laid
// out by engine workers in this browser, measured by this browser's canvas.
// What only a real page can show is that the whole of that happens here — no
// picture is asked of the server, the icons a picture names arrive, a picture
// this browser already drew is shown again without laying anything out, a
// theme switch recolours the picture on screen without drawing another, and a
// change to the board is drawn again.

/** Short on purpose: each wait names itself well inside the owner's budget. */
const WAIT = { timeoutMs: 8_000 } as const;

/** The surface a pane's picture sits in. */
const SURFACE = "[data-slot='model-diagram']";

/**
 * Every resource this page has fetched, by URL.
 * @param browser The page.
 * @returns The URLs.
 */
const fetched = (browser: AgentBrowserSession): Promise<string[]> =>
	browser.eval<string[]>(`performance.getEntriesByType("resource").map((entry) => entry.name)`);

/**
 * Every picture this browser keeps, as stored.
 * @param browser The page.
 * @returns The stored entries, by key.
 */
const keptPictures = (browser: AgentBrowserSession): Promise<Record<string, string>> =>
	browser.eval<Record<string, string>>(
		`new Promise((resolve) => {
			const opened = indexedDB.open("archboard-pictures");
			opened.onerror = () => resolve({});
			opened.onsuccess = () => {
				const db = opened.result;
				if (!db.objectStoreNames.contains("pictures")) return resolve({});
				const store = db.transaction("pictures").objectStore("pictures");
				const kept = {};
				const cursor = store.openCursor();
				cursor.onsuccess = () => {
					const at = cursor.result;
					if (at === null) return resolve(kept);
					kept[String(at.key)] = JSON.stringify(at.value);
					at.continue();
				};
				cursor.onerror = () => resolve(kept);
			};
		})`,
	);

/**
 * Wait for the picture to finish arriving before inspecting or retaining its SVG.
 * @param browser The page.
 * @param what What is being waited for.
 * @returns Settles once it has.
 */
const drawn = (browser: AgentBrowserSession, what: string): Promise<boolean> =>
	pollUntil(
		() => modelDrawn(browser.eval.bind(browser)),
		(atRest) => atRest,
		what,
		WAIT,
	);

test("the page draws a board itself, keeps the picture, recolours it for a theme, and draws it again when the board changes", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const root = join(ownerRoot, "drawn-here-vault");
	const vault = vaultIn(root);
	const model = await seedCanonicalModel(vault, "Pipeline");
	initializeSource(root);
	const server = await startOwnedServer({
		serverPath,
		vault,
		env: serverTestEnvironment({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", modelAddress(server.base, model)]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await drawn(browser, "the board to be drawn in the page");
	await switchTheme(browser, "light");

	// Drawn here: the engine worker started, the icons were fetched by name, and
	// the server's render route was never asked.
	const first = await fetched(browser);
	expect(first.some((url) => url.includes("/api/architecture/render"))).toBeFalse();
	expect(first.some((url) => /\/assets\/layout-worker-[^/]+\.js$/.test(url))).toBeTrue();
	expect(first.some((url) => url.includes("/assets/diagram-icons/"))).toBeTrue();
	expect(
		await browser.eval<boolean>(
			`document.querySelector("${SURFACE} [data-type-icon] path") !== null`,
		),
	).toBeTrue();
	expect(Object.keys(await keptPictures(browser)).length).toBeGreaterThan(0);

	// Opened again: the kept picture is shown, and nothing is laid out for it, so
	// the kept entries are exactly as they were.
	const keptBefore = await keptPictures(browser);
	await browser.run(["open", modelAddress(server.base, model)]);
	await drawn(browser, "the kept picture to be shown after the page is opened again");
	expect(await browser.eval<string>(`document.querySelector("${SURFACE}").textContent`)).toContain(
		"Ingest",
	);
	expect(await keptPictures(browser)).toEqual(keptBefore);

	// Switching the theme recolours the picture on screen (TASK-346): the same
	// picture stays, takes the page's own colours for the other theme, and
	// nothing is laid out or kept for it.
	const ground = `getComputedStyle(document.querySelector("${SURFACE} svg > rect")).fill`;
	const lightGround = await browser.eval<string>(ground);
	await browser.eval(`window.shownPicture = document.querySelector("${SURFACE} svg")`);
	await switchTheme(browser, "dark");
	const darkGround = await pollUntil(
		() => browser.eval<string>(ground),
		(fill) => fill !== lightGround,
		"the picture on screen to take the dark theme's colours",
		WAIT,
	);
	expect(darkGround).toBe(
		await browser.eval<string>(`getComputedStyle(document.body).backgroundColor`),
	);
	expect(
		await browser.eval<boolean>(`document.querySelector("${SURFACE} svg") === window.shownPicture`),
	).toBeTrue();
	expect(await keptPictures(browser)).toEqual(keptBefore);

	// The board changes: the pane is told, and the new version is drawn here.
	await editCanonicalModel(request, vault, "draw-ledger", [
		{ type: "add-module", module: { name: "Ledger", kind: "datastore", order: 2 } },
	]);
	await pollUntil(
		() => browser.eval<string>(`document.querySelector("${SURFACE}")?.textContent ?? ""`),
		(text) => text.includes("Ledger"),
		"the board's new version to be drawn in the page",
		WAIT,
	);
	expect(
		(await fetched(browser)).some((url) => url.includes("/api/architecture/render")),
	).toBeFalse();
	// Laid out here and kept again, as a picture of the new version.
	const keptAfter = await pollUntil(
		() => keptPictures(browser),
		(kept) => Object.keys(kept).some((key) => !(key in keptBefore)),
		"the new version's picture to be kept",
		WAIT,
	);
	expect(keptAfter).not.toEqual(keptBefore);

	await server.assertRunning();
}, 40_000);
