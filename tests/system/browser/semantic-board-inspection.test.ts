import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
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
import { SURFACE, pick, press, shownBoard, stageState, textOf } from "./support/drilling.ts";
import { serverPath, servedRepository } from "./support/navigator-support.ts";
import { partSearchState, pictureAtRest, sidebarTab } from "./support/semantic-page.ts";

test("browser keyboard input keeps trusted keys, modifiers, and native focus", async () => {
	interface KeySnapshot {
		count: number;
		keys: { type: string; key: string; ctrl: boolean; shift: boolean; trusted: boolean }[];
	}
	await using browser = await createAgentBrowser();
	await browser.run(["open", "about:blank"]);
	await browser.eval(`document.body.innerHTML = '<input id="first"><input id="second">';
		window.keys = []; window.keyCount = 0;
		for (const type of ['keydown', 'keyup']) window.addEventListener(type, event => {
			window.keyCount += 1;
			if (window.keys.length < 4) window.keys.push({ type, key: event.key, ctrl: event.ctrlKey, shift: event.shiftKey, trusted: event.isTrusted });
		});
		document.querySelector('#first').focus(); true`);
	await browser.run(["press", "Escape"]);
	expect(
		await browser.eval<KeySnapshot>("({ count: window.keyCount, keys: window.keys })"),
	).toEqual({
		count: 2,
		keys: [
			{ type: "keydown", key: "Escape", ctrl: false, shift: false, trusted: true },
			{ type: "keyup", key: "Escape", ctrl: false, shift: false, trusted: true },
		],
	});
	await browser.eval("window.keys = []; window.keyCount = 0; true");
	await browser.run(["press", "Control+Shift+K"]);
	expect(
		await browser.eval<KeySnapshot>("({ count: window.keyCount, keys: window.keys })"),
	).toEqual({
		count: 2,
		keys: [
			{ type: "keydown", key: "K", ctrl: true, shift: true, trusted: true },
			{ type: "keyup", key: "K", ctrl: true, shift: true, trusted: true },
		],
	});
	await browser.run(["press", "Tab"]);
	expect(await browser.eval<string>("document.activeElement.id")).toBe("second");
	await browser.run(["keyboard", "type", "board"]);
	expect(await browser.eval<string>("document.querySelector('#second').value")).toBe("board");
});

/**
 * How wide the picture's viewport is.
 * @param browser The page.
 * @returns Its width in pixels.
 */
const viewportWidth = (browser: AgentBrowserSession): Promise<number> =>
	browser.eval<number>(
		`document.querySelector("[data-slot='semantic-board-viewport']")?.getBoundingClientRect().width ?? 0`,
	);

/**
 * Where the camera has the picture.
 * @param browser The page.
 * @returns The surface's transform.
 */
const surfaceTransform = (browser: AgentBrowserSession): Promise<string> =>
	browser.eval<string>(
		`document.querySelector("[data-slot='semantic-board-surface']")?.style.transform ?? ""`,
	);

/** Whether two camera transforms place the picture in the same visible spot. */
function sameVisibleFit(actual: string, expected: string): boolean {
	const numbers = /-?\d+(?:\.\d+)?/g;
	const one = actual.match(numbers)?.map(Number);
	const two = expected.match(numbers)?.map(Number);
	return (
		one?.length === 3 &&
		two?.length === 3 &&
		one.every((value, index) => Math.abs(value - (two[index] ?? NaN)) < (index === 2 ? 0.005 : 1))
	);
}

/** How long any one thing here is waited for. */
const WAIT = { timeoutMs: 8_000 } as const;

/** The panel beside the diagram. */
const INSPECTOR = "[data-slot='semantic-inspector']";

/**
 * What the pointer resting on the way to a part's code says: the repository.
 * @param browser The page.
 * @returns The title, or an empty string when the part has no way to code.
 */
const codeTitle = (browser: AgentBrowserSession): Promise<string> =>
	browser.eval<string>(
		`document.querySelector("[data-slot='semantic-inspector-open-code']")?.getAttribute("title") ?? ""`,
	);

/**
 * What sort of state the way down to a part's board opens.
 * @param browser The page.
 * @returns The lifecycle, or an empty string when the part has no way down.
 */
const lifecycleOnOffer = (browser: AgentBrowserSession): Promise<string> =>
	browser.eval<string>(
		`document.querySelector("[data-slot='semantic-drill-down-open']")?.getAttribute("data-variant-lifecycle") ?? ""`,
	);

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

/** A tip over a part of the picture, measured: its inner width and its widest line. */
interface MeasuredTip {
	readonly width: number;
	readonly widest: number;
}

/**
 * Rest the pointer on a drawn subject and measure the tip that opens over it.
 * The pointer keeps moving over the subject, as a hand on a mouse does, until
 * the tip opens.
 * @param browser The page.
 * @param id The subject.
 * @returns The tip, measured.
 */
async function tipOver(browser: AgentBrowserSession, id: string): Promise<MeasuredTip> {
	const seen = await pollUntil(
		() =>
			browser.eval<MeasuredTip | null>(
				`(() => { const card = document.querySelector("${SURFACE} [data-semantic-id='${id}']");` +
					` const box = card.getBoundingClientRect();` +
					` card.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, isPrimary: true,` +
					`   clientX: Math.round(box.x + box.width / 2), clientY: Math.round(box.y + box.height / 2) }));` +
					` const tip = document.querySelector("[data-slot='semantic-subject-tip']");` +
					` if (tip === null) return null;` +
					` const lines = [...tip.querySelectorAll("p")];` +
					` return { width: tip.clientWidth, widest: Math.max(...lines.map((line) => line.scrollWidth)) }; })()`,
			),
		(measured) => measured !== null,
		"the subject's tip to open",
		WAIT,
	);
	return seen!;
}

test("a person reads containment, code and the level below it, and writes nothing", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = vaultIn(join(ownerRoot, "semantic-inspection-vault"));
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const repo = await servedRepository(server.base);
	const request = createJsonRequester(server);

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
						// One word longer than any tip is wide: a path, as descriptions carry them.
						description: `The one place a note is read or written, synchronously on purpose. It lives at ${"src/runtime/engine/".repeat(8)}board-io.ts on the branch that introduced it.`,
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
	await browser.run(["open", `${server.base}/?paneA=pipeline`]);
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

	// Resting the pointer on the card opens its tip, and a word longer than the
	// tip is wide breaks inside it rather than running out past its edge.
	const tip = await tipOver(browser, ids["module"] ?? "");
	expect(tip.widest).toBeLessThanOrEqual(tip.width);
	// With little room above and below the card, the positioner leaves the
	// tip less height than its lines need: the description gives way rather
	// than running out below the tip.
	const squeezed = await browser.eval<{ bottom: number; lowest: number }>(
		`(() => { const tip = document.querySelector("[data-slot='semantic-subject-tip']");` +
			` tip.parentElement.style.setProperty("--available-height", "120px");` +
			` const lines = [...tip.querySelectorAll("p")];` +
			` return { bottom: tip.getBoundingClientRect().bottom,` +
			`   lowest: Math.max(...lines.map((line) => line.getBoundingClientRect().bottom)) }; })()`,
	);
	expect(squeezed.lowest).toBeLessThanOrEqual(squeezed.bottom);

	// The sidebar opens on the board, and a pick turns it to the selection.
	expect(await sidebarTab(browser.eval.bind(browser))).toBe("board");

	// Picking the module out reaches what its card deliberately does not carry.
	await pick(browser, ids["module"] ?? "");
	await pollUntil(
		() => textOf(browser, INSPECTOR),
		(said) => said.includes("board-io"),
		"the inspector to explain the picked node",
		WAIT,
	);
	expect(await sidebarTab(browser.eval.bind(browser))).toBe("selection");
	const inspected = await textOf(browser, INSPECTOR);
	expect(inspected).toContain("The one place a note is read or written");
	expect(inspected).toContain("src/runtime/engine/board-io.ts");
	expect(await codeTitle(browser)).toContain("archboard");

	// A node bound to a different repository says so where the pointer rests on
	// the way to its code, and one with no binding has no way to code at all.
	await pick(browser, ids["other"] ?? "");
	await pollUntil(
		() => codeTitle(browser),
		(title) => title.includes("coordinator"),
		"the way to the code to name the other node's repository",
		WAIT,
	);
	await pick(browser, ids["planned"] ?? "");
	await pollUntil(
		() => textOf(browser, INSPECTOR),
		(said) => said.includes("Write Lease"),
		"the inspector to explain the node with no binding",
		WAIT,
	);
	expect(await codeTitle(browser)).toBe("");

	// The level below: where it stands is disclosed before anything opens, and
	// opening it really shows the other board.
	await pick(browser, ids["module"] ?? "");
	await pollUntil(
		() => lifecycleOnOffer(browser),
		(lifecycle) => lifecycle === "current",
		"the way down to say what sort of state it opens",
		WAIT,
	);
	expect(await textOf(browser, "[data-slot='semantic-drill-down-open']")).toContain("engine");
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
		(search) => search === `?paneA=engine&repoA=${repo}`,
		"the address to name the board the reader followed into",
		WAIT,
	);
	// The way back is the breadcrumb, which is the reader's own and is not addressed.
	expect(await textOf(browser, "[data-slot='pane-header'] nav")).toContain("pipeline");
	await press(browser, "[data-slot='pane-crumb']");
	await pollUntil(
		() => shownBoard(browser),
		(board) => board === "pipeline",
		"the way back to the board the pane was opened on",
		WAIT,
	);
	// And the address comes back with it, for the same reason it followed down.
	await pollUntil(
		() => browser.eval<string>("window.location.search"),
		(search) => search === `?paneA=pipeline&repoA=${repo}`,
		"the address to follow the reader back out",
		WAIT,
	);

	// Hiding the sidebar gives its width back to the picture, which refits to it
	// while nobody has moved the camera; showing it takes the width back.
	await pollUntil(
		() => pictureAtRest(browser.eval.bind(browser)),
		(atRest) => atRest,
		"the board the reader came back to to settle",
		WAIT,
	);
	const open = await viewportWidth(browser);
	const fittedOpen = await surfaceTransform(browser);
	await press(browser, "[data-slot='semantic-sidebar-toggle']");
	await pollUntil(
		() => viewportWidth(browser),
		(width) => width > open,
		"the picture's viewport to widen once the sidebar is hidden",
		WAIT,
	);
	await pollUntil(
		() => surfaceTransform(browser),
		(transform) => transform !== fittedOpen,
		"the picture to refit to the wider viewport",
		WAIT,
	);
	await press(browser, "[data-slot='semantic-sidebar-toggle']");
	await pollUntil(
		() => surfaceTransform(browser),
		(transform) => sameVisibleFit(transform, fittedOpen),
		"the picture to refit to the sidebar coming back",
		WAIT,
	);

	// With the sidebar hidden, the search shortcut brings it back and takes focus
	// in the part search. The first Escape lets go of what was typed, and the next
	// leaves the field.
	const searching = (): ReturnType<typeof partSearchState> =>
		partSearchState(browser.eval.bind(browser));
	await press(browser, "[data-slot='semantic-sidebar-toggle']");
	await pollUntil(
		() => sidebarTab(browser.eval.bind(browser)),
		(tab) => tab === null,
		"the hidden sidebar to leave the page",
		WAIT,
	);
	await browser.run(["press", "Control+Shift+K"]);
	await pollUntil(
		searching,
		(state) => state.focused,
		"the search shortcut to take focus in the part search",
		WAIT,
	);
	await browser.run(["keyboard", "type", "board"]);
	await pollUntil(
		searching,
		(state) => state.value === "board" && state.listed,
		"the part search to list what it found",
		WAIT,
	);
	await browser.run(["press", "Escape"]);
	await pollUntil(
		searching,
		(state) => state.value === "" && state.focused && !state.listed,
		"the first Escape to clear the field and keep it",
		WAIT,
	);
	await browser.run(["press", "Escape"]);
	await pollUntil(
		searching,
		(state) => !state.focused,
		"the second Escape to leave the field",
		WAIT,
	);

	// The field names its list only while the list is drawn, and a row keeps a
	// name it cuts short in its title. Choosing a part gives the keyboard to the
	// selection tab that explains it, not to the page's body.
	expect((await searching()).controls).toBeNull();
	await browser.run(["press", "Control+Shift+K"]);
	await pollUntil(
		searching,
		(state) => state.focused,
		"the search shortcut to take focus in the part search again",
		WAIT,
	);
	await browser.run(["keyboard", "type", "board"]);
	await pollUntil(
		searching,
		(state) => state.listed && state.controls === "list",
		"the field to name the list it draws",
		WAIT,
	);
	expect((await searching()).fullNames).toBe(true);
	await browser.run(["press", "Enter"]);
	await pollUntil(
		() => browser.eval<string | null>("document.activeElement?.getAttribute('data-tab') ?? null"),
		(tab) => tab === "selection",
		"the part chosen in the search to take the keyboard to the selection tab",
		WAIT,
	);
	expect(await searching()).toMatchObject({ listed: false, controls: null });

	// Nothing a person did in the browser wrote a board.
	expect(readFileSync(join(vault, "pipeline.semantic.json"), "utf8")).toBe(before);
	await server.assertRunning();
}, 60_000);
