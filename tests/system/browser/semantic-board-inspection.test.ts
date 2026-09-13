import { expect, test } from "bun:test";
import { mkdirSync, readFileSync } from "node:fs";
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

/** How long any one thing here is waited for. */
const WAIT = { timeoutMs: 8_000 } as const;

/** The stage one semantic pane draws into. */
const STAGE = "[data-slot='semantic-board-stage']";

/** The element the camera moves. */
const SURFACE = "[data-slot='semantic-board-surface']";

/** The stage's tab stop: what hears the keys. */
const VIEWPORT = "[data-slot='semantic-board-viewport']";

/** The panel beside the diagram. */
const INSPECTOR = "[data-slot='semantic-inspector']";

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
 * Which board the pane is showing.
 * @param browser The page.
 * @returns The board name, or null before the pane is there.
 */
const shownBoard = (browser: AgentBrowserSession): Promise<string | null> =>
	browser.eval<string | null>(
		`document.querySelector("${STAGE}")?.getAttribute("data-board") ?? null`,
	);

/**
 * What one element of the pane is saying.
 * @param browser The page.
 * @param selector Which element.
 * @returns Its text, or an empty string when it is not there.
 */
const textOf = (browser: AgentBrowserSession, selector: string): Promise<string> =>
	browser.eval<string>(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ""`);

/**
 * Pick a subject out of the diagram the way a person does.
 *
 * The whole pointer sequence: press on the card, release and click on the
 * viewport. A browser retargets a click to whichever element holds the pointer,
 * so a bare synthetic click on the card would pass while every real click
 * picked nothing.
 * @param browser The page.
 * @param id The semantic id to pick.
 * @returns Settles once the click has been delivered.
 */
const pick = (browser: AgentBrowserSession, id: string): Promise<unknown> =>
	browser.eval(
		`(() => {` +
			` const card = document.querySelector("${SURFACE} [data-semantic-id='" + ${JSON.stringify(id)} + "']");` +
			` const view = document.querySelector("${VIEWPORT}");` +
			` const at = card.getBoundingClientRect();` +
			` const where = { pointerId: 1, isPrimary: true, button: 0, bubbles: true,` +
			`   clientX: Math.round(at.x + at.width / 2), clientY: Math.round(at.y + at.height / 2) };` +
			` card.dispatchEvent(new PointerEvent("pointerdown", where));` +
			` view.dispatchEvent(new PointerEvent("pointerup", where));` +
			` view.dispatchEvent(new MouseEvent("click", where)); })()`,
	);

/**
 * Press a button of the pane.
 * @param browser The page.
 * @param selector Which button.
 * @returns Settles once the click has been delivered.
 */
const press = (browser: AgentBrowserSession, selector: string): Promise<unknown> =>
	browser.eval(`document.querySelector(${JSON.stringify(selector)}).click()`);

/**
 * Whether one drawn box sits wholly inside another, as the page lays them out.
 * @param browser The page.
 * @param inner The id of the box that should be inside.
 * @param outer The id of the box that should contain it.
 * @returns True when it does.
 */
const drawnInside = (
	browser: AgentBrowserSession,
	inner: string,
	outer: string,
): Promise<boolean> =>
	browser.eval<boolean>(
		`(() => {` +
			` const box = (id) => document.querySelector("${SURFACE} [data-semantic-id='" + id + "'] rect")` +
			`   .getBoundingClientRect();` +
			` const a = box(${JSON.stringify(inner)}); const b = box(${JSON.stringify(outer)});` +
			` return a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom; })()`,
	);

test("a person reads containment, code and the level below it, and writes nothing", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "semantic-inspection-vault");
	mkdirSync(vault, { recursive: true });
	const canvas = await startOwnedCanvas({ serverPath, vault, env: canvasTestEnvironment() });
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);

	// The board one level down, with a variant named for the state it describes.
	const below = await request<{ success: boolean }>("/api/semantic-boards/create", {
		method: "POST",
		doing: "drawing the engine",
		body: {
			board: "engine",
			origin: "agent",
			writerId: "browser-owner",
			create: {
				level: "module",
				variant: "as built",
				nodes: [
					{ name: "atomic-write", kind: "module", responsibility: "Writes and fsyncs" },
					{ name: "board-version", kind: "module" },
				],
				edges: [{ from: "atomic-write", to: "board-version", kind: "call" }],
			},
		},
	});
	expect(below.status).toBe(200);

	// The system board: three levels of containment, two repositories, one
	// planned node with no code at all, and a link down a level.
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
					{ name: "Board Runtime", kind: "service", responsibility: "Owns every write" },
					{ name: "Engine", kind: "package", parent: "Board Runtime" },
					{
						name: "board-io",
						kind: "module",
						parent: "Engine",
						description: "The one place a note is read or written, synchronously on purpose.",
						binding: { repo: "archboard", path: "src/runtime/engine/board-io.ts" },
						drillDown: { board: "engine", variant: { kind: "named", name: "as built" } },
					},
					{ name: "Write Lease", kind: "module", parent: "Engine" },
					{
						name: "Voice Bridge",
						kind: "external",
						binding: { repo: "coordinator", path: "src/voice/bridge.ts" },
					},
				],
				edges: [{ from: "Voice Bridge", to: "board-io", kind: "call", label: "asks" }],
			},
		},
	});
	expect(created.status).toBe(200);

	const before = readFileSync(join(vault, "pipeline.semantic.json"), "utf8");

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${canvas.base}/?paneA=pipeline`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => stageState(browser),
		(state) => state === "drawn",
		"the semantic board to be drawn in its pane",
		WAIT,
	);

	// Containment is drawn as containment, at more than one level: the service
	// frame is inside the system frame, and the module's card is inside both.
	const ids = await browser.eval<Record<string, string>>(
		`(() => {` +
			` const found = {};` +
			` for (const group of document.querySelectorAll("${SURFACE} [data-semantic-id]")) {` +
			`   const words = group.textContent.trim();` +
			`   if (words.startsWith("Board Runtime")) found.system = group.dataset.semanticId;` +
			`   if (words.startsWith("Engine")) found.service = group.dataset.semanticId;` +
			`   if (words.endsWith("board-io")) found.module = group.dataset.semanticId;` +
			`   if (words.endsWith("Write Lease")) found.planned = group.dataset.semanticId;` +
			`   if (words.endsWith("Voice Bridge")) found.other = group.dataset.semanticId; }` +
			` return found; })()`,
	);
	expect(Object.keys(ids).toSorted()).toEqual(["module", "other", "planned", "service", "system"]);
	expect(await drawnInside(browser, ids["service"] ?? "", ids["system"] ?? "")).toBe(true);
	expect(await drawnInside(browser, ids["module"] ?? "", ids["service"] ?? "")).toBe(true);

	// Picking the module out reaches what its card deliberately does not carry.
	await pick(browser, ids["module"] ?? "");
	await pollUntil(
		() => textOf(browser, INSPECTOR),
		(said) => said.includes("board-io"),
		"the inspector to explain the picked node",
		WAIT,
	);
	const inspected = await textOf(browser, INSPECTOR);
	expect(inspected).toContain("The one place a note is read or written");
	expect(inspected).toContain("archboard");
	expect(inspected).toContain("src/runtime/engine/board-io.ts");
	expect(inspected).toContain("Engine");

	// A node bound to a different repository says so, and a planned one says it
	// is planned rather than showing an empty field.
	await pick(browser, ids["other"] ?? "");
	await pollUntil(
		() => textOf(browser, INSPECTOR),
		(said) => said.includes("coordinator"),
		"the inspector to name the other node's repository",
		WAIT,
	);
	await pick(browser, ids["planned"] ?? "");
	await pollUntil(
		() => textOf(browser, INSPECTOR),
		(said) => said.includes("No code binding."),
		"the inspector to say the node has no code binding",
		WAIT,
	);

	// The level below: the target variant and where it stands are disclosed
	// before anything opens, and opening it really shows the other board.
	await pick(browser, ids["module"] ?? "");
	await pollUntil(
		() => textOf(browser, "[data-slot='semantic-drill-down']"),
		(said) => said.includes("as built"),
		"the drill-down to name the target variant",
		WAIT,
	);
	expect(await textOf(browser, "[data-slot='semantic-drill-down']")).toContain(
		"the current architecture",
	);
	await press(browser, "[data-slot='semantic-drill-down-open']");
	await pollUntil(
		() => shownBoard(browser),
		(board) => board === "engine",
		"the pane to open the board one level down",
		WAIT,
	);
	expect(await textOf(browser, `${SURFACE}`)).toContain("atomic-write");

	// The address names the board that is on screen, not the one the reader
	// started from: a link followed down is where this pane now is, and an
	// address that said otherwise would restore somebody somewhere they left.
	await pollUntil(
		() => browser.eval<string>("window.location.search"),
		(search) => search === "?paneA=engine",
		"the address to name the board the reader followed into",
		WAIT,
	);
	// The way back is the trail, which is the reader's own and is not addressed.
	expect(await textOf(browser, "[data-slot='semantic-board-trail']")).toContain("pipeline");
	await press(browser, "[data-slot='semantic-board-trail'] button");
	await pollUntil(
		() => shownBoard(browser),
		(board) => board === "pipeline",
		"the way back to the board the pane was opened on",
		WAIT,
	);
	// And the address comes back with it, for the same reason it followed down.
	await pollUntil(
		() => browser.eval<string>("window.location.search"),
		(search) => search === "?paneA=pipeline",
		"the address to follow the reader back out",
		WAIT,
	);

	// Nothing a person did in the browser wrote a board.
	expect(readFileSync(join(vault, "pipeline.semantic.json"), "utf8")).toBe(before);
	await canvas.assertRunning();
}, 60_000);
