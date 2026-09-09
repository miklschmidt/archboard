import { expect, test } from "bun:test";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { AddResultSchema } from "../../../src/cli/commands/elements.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
	runCanvasCli,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { move } from "./support/hold-page-scene.ts";
import { serverPath, type PanesBody } from "./support/navigator-support.ts";
import { clickNavigatorRow, shellNotices } from "./support/shell-dom.ts";

/**
 * The search parameters the address bar is showing.
 * @param browser The page.
 * @returns The query string, without its leading question mark.
 */
const addressSearch = (browser: AgentBrowserSession): Promise<string> =>
	browser.eval<string>("window.location.search.replace(/^\\?/, '')");

/**
 * How many history entries this tab has.
 * @param browser The page.
 * @returns The length.
 */
const historyLength = (browser: AgentBrowserSession): Promise<number> =>
	browser.eval<number>("window.history.length");

/**
 * Go back the way a person does, and wait for the address to answer.
 * @param browser The page.
 * @param expected The search the address should end up showing.
 */
async function goBack(browser: AgentBrowserSession, expected: string): Promise<void> {
	await browser.eval("window.history.back()");
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === expected,
		`the address to go back to ${expected}`,
	);
}

test("a workspace opens from its address, and Back retraces the boards a person moved between", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "vault");
	mkdirSync(vault, { recursive: true });
	const canvas = await startOwnedCanvas({ serverPath, vault, env: canvasTestEnvironment() });
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);
	const cli = (...args: string[]): string => runCanvasCli(canvas.base, vault, args);
	const add = (board: string, label: string): string => {
		const file = join(ownerRoot, `${board}.json`);
		writeFileSync(
			file,
			JSON.stringify([
				{ type: "rectangle", x: 80, y: 80, width: 240, height: 100, label: { text: label } },
			]),
		);
		const result = AddResultSchema.parse(
			JSON.parse(cli("add", "--board", board, "--doing", "drawing the service", file)),
		);
		const id = result.elements.find((element) => element.type === "rectangle")?.id;
		expect(id).toBeDefined();
		return id!;
	};

	cli("board", "new", "payments");
	cli("board", "new", "billing");
	cli("board", "new", "ledger");
	const paymentsBox = add("payments", "Payments");
	add("billing", "Billing");
	add("ledger", "Ledger");

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${canvas.base}/?paneA=payments&paneB=billing&pane=B`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	const panes = (): Promise<PanesBody> =>
		request<PanesBody>("/api/panes").then((reply) => reply.body);

	// A direct load restores the comparison: two panes, each on the board the
	// address names, without the address being rewritten to something else.
	const restored = await pollUntil(
		panes,
		(state) =>
			state.paneCount === 2 &&
			state.panes.some((pane) => pane.board === "payments") &&
			state.panes.some((pane) => pane.board === "billing"),
		"both panes to restore the boards the address named",
	);
	expect(await addressSearch(browser)).toBe("paneA=payments&paneB=billing&pane=B");
	const paneA = restored.panes.find((pane) => pane.board === "payments")!;
	const paneB = restored.panes.find((pane) => pane.board === "billing")!;

	// A person's open pushes a history entry, and the address says where they are.
	const before = await historyLength(browser);
	await clickNavigatorRow(browser, "ledger");
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === "paneA=payments&paneB=ledger&pane=B",
		"the address to record the board the person opened",
	);
	expect(await historyLength(browser)).toBe(before + 1);

	// An agent moving a pane is not the person's navigation: it is recorded
	// without a history entry of its own, so Back still retraces their moves.
	cli("browser", "show", "payments", "--pane", `${paneB.clientId}`);
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === "paneA=payments&paneB=payments&pane=B",
		"the address to follow the board an agent opened",
	);
	expect(await historyLength(browser)).toBe(before + 1);

	await goBack(browser, "paneA=payments&paneB=billing&pane=B");
	await pollUntil(
		panes,
		(state) => state.panes.find((pane) => pane.clientId === paneB.clientId)?.board === "billing",
		"Back to put the pane on the board it came from",
	);

	// The panes were never remounted: their identity to the server is the one
	// they registered with, so the workbench and the canvas rode through it.
	const afterBack = await panes();
	expect(afterBack.panes.map((pane) => pane.clientId).toSorted()).toEqual(
		[paneA.clientId, paneB.clientId].toSorted(),
	);

	// A board whose canvas holds work the note has not got keeps its board, and
	// says so, rather than losing that work to a history navigation (ADR 0006).
	appendFileSync(join(vault, "payments.excalidraw.md"), "\nedited elsewhere\n");
	await move(browser, paymentsBox, 40, 24);
	await pollUntil(
		() => shellNotices(browser),
		(notices) => notices.some((notice) => notice.title.includes("has stopped saving")),
		"pane A's board to stop saving",
	);
	const held = await addressSearch(browser);
	await browser.eval("window.history.back()");
	await pollUntil(
		() => shellNotices(browser),
		(notices) => notices.some((notice) => notice.title === "Pane A kept its board"),
		"a refused navigation to say which pane kept its board",
	);
	expect(await addressSearch(browser)).toBe(held);
	const refused = await panes();
	expect(refused.panes.find((pane) => pane.clientId === paneA.clientId)?.board).toBe("payments");
	await canvas.assertRunning();
}, 30_000);

test("an address naming a board that is not there says so and settles on what is shown", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "missing-vault");
	mkdirSync(vault, { recursive: true });
	const canvas = await startOwnedCanvas({ serverPath, vault, env: canvasTestEnvironment() });
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);
	runCanvasCli(canvas.base, vault, ["board", "new", "payments"]);

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${canvas.base}/?paneA=nowhere`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => shellNotices(browser),
		(notices) =>
			notices.some(
				(notice) =>
					notice.title.includes("nowhere") && notice.description.includes("Board navigation"),
			),
		"the missing board to be named rather than quietly swapped",
	);
	// The address is corrected to the workspace that is actually on screen, so
	// the two never disagree, and what it settled on is announced.
	const shown = await pollUntil(
		() => request<PanesBody>("/api/panes").then((reply) => reply.body),
		(state) => state.paneCount === 1,
		"the pane to register",
	);
	const board = shown.panes[0]?.board;
	expect(board).toBeDefined();
	expect(board).not.toBe("nowhere");
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === `paneA=${board!}`,
		"the address to settle on the workspace that is shown",
	);
	await canvas.assertRunning();
}, 30_000);
