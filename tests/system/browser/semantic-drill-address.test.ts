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
} from "./support/agent-browser.ts";
import {
	DRILL_OPEN,
	WAIT,
	addressSearch,
	drawnId,
	pick,
	press,
	readThrough,
	shownBoard,
	stageState,
} from "./support/drilling.ts";
import { serverPath } from "./support/navigator-support.ts";

// The address of a board read a level down.
//
// A board and the view it is read through are one answer, and a view id is a
// subject of one variant's content. So an address that paired the board
// somebody followed a link INTO with the view they had chosen on the board they
// came FROM would name a view that board has not got: the link a person sends
// would not open, and neither would their own reload. This is the owner for
// that pairing, through a real drill-down in a real browser.

/** A board with one named way of reading it, and two nodes to read. */
const withAView = (
	view: string,
	nodes: readonly Record<string, unknown>[],
): Record<string, unknown> => ({
	level: "system",
	nodes,
	edges: [],
	views: [{ name: view, grammar: "architecture", scope: { kind: "all" } }],
});

test("the address names the view of the board on screen, down a level and back", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "drill-address-vault");
	mkdirSync(vault, { recursive: true });
	const canvas = await startOwnedCanvas({ serverPath, vault, env: canvasTestEnvironment() });
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);

	for (const [board, create] of [
		[
			"engine",
			withAView("One write", [
				{ name: "atomic-write", kind: "module" },
				{ name: "board-version", kind: "module" },
			]),
		],
		[
			"pipeline",
			withAView("Where writes go", [
				{
					name: "board-io",
					kind: "module",
					drillDown: { board: "engine", variant: { kind: "current" } },
				},
				{ name: "Write Lease", kind: "module" },
			]),
		],
	] as const) {
		const made = await request<{ success: boolean }>("/api/semantic-boards/create", {
			method: "POST",
			doing: `drawing ${board}`,
			body: { board, origin: "agent", create },
		});
		expect(made.status).toBe(200);
	}

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${canvas.base}/?paneA=pipeline`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => stageState(browser),
		(state) => state === "drawn",
		"the board the pane was opened on to be drawn",
		WAIT,
	);

	// A way of reading the board the pane was opened on, chosen and addressed.
	const above = await readThrough(browser, "Where writes go");
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === `paneA=pipeline&viewA=${above}`,
		"the address to name the way the opened board is being read",
		WAIT,
	);

	// Down a level. The view goes with the board it belonged to: its id is a
	// subject of the level above's content and names nothing here, so an address
	// that carried it down would be an address that cannot be reopened.
	await pick(browser, (await drawnId(browser, "board-io")) ?? "");
	await press(browser, DRILL_OPEN);
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === "paneA=engine",
		"the address to name the board below, read whole",
		WAIT,
	);

	// And the level below's own way of reading it is addressed the same way,
	// against the board it belongs to.
	const below = await readThrough(browser, "One write");
	expect(below).not.toBe(above);
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === `paneA=engine&viewA=${below}`,
		"the address to name the way the board below is being read",
		WAIT,
	);

	// Which is the whole point: that address reopens what is on screen. A person
	// who sends it, or reloads, lands where they were.
	await browser.run(["open", `${canvas.base}/?paneA=engine&viewA=${below}`]);
	await pollUntil(
		() => stageState(browser),
		(state) => state === "drawn",
		"the addressed board below to be drawn again",
		WAIT,
	);
	expect(await shownBoard(browser)).toBe("engine");
	expect(
		await browser.eval<string | null>(
			`document.querySelector("[data-slot='semantic-view-choice'][aria-pressed='true']")` +
				`?.getAttribute("data-semantic-view") ?? null`,
		),
	).toBe(below);

	await canvas.assertRunning();
}, 90_000);
