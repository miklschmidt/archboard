import { expect, test } from "bun:test";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { AddResultSchema } from "../../../src/cli/commands/elements.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { humanWriteQuery } from "../support/note-version.ts";
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
import { serverPath, type PanesBody } from "./support/navigator-support.ts";
import { clickNavigatorRow, shellNotices } from "./support/shell-dom.ts";

/** The board dialog, whichever mode it is in. */
const BOARD_DIALOG = '[role="dialog"]';

/**
 * Everything an open dialog is saying.
 * @param browser The page.
 * @returns The words of each alert inside the dialog.
 */
const dialogAlerts = (browser: AgentBrowserSession): Promise<string[]> =>
	browser.eval<string[]>(
		`[...document.querySelectorAll('${BOARD_DIALOG} [data-slot="alert"]')].map((alert) => alert.textContent ?? "")`,
	);

/**
 * Open the board dialog from the header.
 * @param browser The page.
 */
async function openDialog(browser: AgentBrowserSession): Promise<void> {
	await browser.run(["find", "role", "button", "click", "--name", "Open", "--exact"]);
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('${BOARD_DIALOG}') !== null`),
		(open) => open,
		"the board dialog to open",
	);
}

/**
 * Choose a board in the open dialog and submit it, the way a person does.
 * @param browser The page.
 * @param boardKey The board to choose.
 */
async function chooseInDialog(browser: AgentBrowserSession, boardKey: string): Promise<void> {
	await browser.eval(
		`document.querySelector('${BOARD_DIALOG} input[placeholder="Board name"]')?.focus()`,
	);
	await browser.run(["keyboard", "type", boardKey]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`[...document.querySelectorAll('[role="option"]')].some(node => node.textContent.trim().startsWith(${JSON.stringify(boardKey)}))`,
			),
		(offered) => offered,
		`the dialog to offer ${boardKey}`,
	);
	await browser.eval(
		`[...document.querySelectorAll('[role="option"]')].find(node => node.textContent.trim().startsWith(${JSON.stringify(boardKey)}))?.click()`,
	);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`(() => { const dialog = document.querySelector('${BOARD_DIALOG}'); if (!dialog) return false; const button = [...dialog.querySelectorAll('button')].find(node => node.textContent.trim() === "Open board"); return Boolean(button) && !button.disabled; })()`,
			),
		(ready) => ready,
		"the dialog to accept the board that was chosen",
	);
	await browser.eval(
		`[...document.querySelector('${BOARD_DIALOG}').querySelectorAll('button')].find(node => node.textContent.trim() === "Open board")?.click()`,
	);
}

/**
 * Open one board through the dialog, from the header to the submission.
 * @param browser The page.
 * @param boardKey The board to open.
 */
async function openBoardThroughDialog(
	browser: AgentBrowserSession,
	boardKey: string,
): Promise<void> {
	await openDialog(browser);
	await chooseInDialog(browser, boardKey);
}

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
	add("payments", "Payments");
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

	await canvas.assertRunning();
}, 30_000);

test("a pane holding work the note has not got keeps its board, whoever asks it to move", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "guarded-vault");
	mkdirSync(vault, { recursive: true });
	const canvas = await startOwnedCanvas({ serverPath, vault, env: canvasTestEnvironment() });
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);
	const cli = (...args: string[]): string => runCanvasCli(canvas.base, vault, args);
	cli("board", "new", "payments");
	cli("board", "new", "billing");
	const file = join(ownerRoot, "guarded.json");
	writeFileSync(
		file,
		JSON.stringify([
			{ type: "rectangle", x: 80, y: 80, width: 240, height: 100, label: { text: "Payments" } },
		]),
	);
	const drawn = AddResultSchema.parse(
		JSON.parse(cli("add", "--board", "payments", "--doing", "drawing the service", file)),
	);
	const boxId = drawn.elements.find((element) => element.type === "rectangle")?.id;
	expect(boxId).toBeDefined();

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${canvas.base}/?paneA=payments`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	const panes = (): Promise<PanesBody> =>
		request<PanesBody>("/api/panes").then((reply) => reply.body);
	const pane = (
		await pollUntil(panes, (state) => state.panes[0]?.board === "payments", "the pane to restore")
	).panes[0]!;

	// The note changes under the pane and the pane's own write is refused, which
	// is what makes a board stop saving (ADR 0006).
	appendFileSync(join(vault, "payments.excalidraw.md"), "\nedited elsewhere\n");
	const refused = await request(
		`/api/elements/changes${await humanWriteQuery(request, "payments")}`,
		{
			method: "POST",
			body: { clientId: pane.clientId, upserts: [{ id: boxId, x: 140 }] },
		},
	);
	expect(refused.status).toBe(409);
	await pollUntil(
		() => shellNotices(browser),
		(notices) => notices.some((notice) => notice.title.includes("has stopped saving")),
		"the pane's board to stop saving",
	);

	// The board picker asks the same rule the address bar does.
	await clickNavigatorRow(browser, "billing");
	await pollUntil(
		() => shellNotices(browser),
		(notices) => notices.some((notice) => notice.title === "Pane A kept its board"),
		"the picker to say which pane kept its board",
	);
	expect(await addressSearch(browser)).toBe("paneA=payments");
	expect((await panes()).panes[0]?.board).toBe("payments");
	await canvas.assertRunning();
}, 30_000);

test("Back is refused while a pane holds work, and the history still works afterwards", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "back-vault");
	mkdirSync(vault, { recursive: true });
	const canvas = await startOwnedCanvas({ serverPath, vault, env: canvasTestEnvironment() });
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);
	const cli = (...args: string[]): string => runCanvasCli(canvas.base, vault, args);
	cli("board", "new", "payments");
	cli("board", "new", "billing");
	const file = join(ownerRoot, "back.json");
	writeFileSync(
		file,
		JSON.stringify([
			{ type: "rectangle", x: 80, y: 80, width: 240, height: 100, label: { text: "Billing" } },
		]),
	);
	const drawn = AddResultSchema.parse(
		JSON.parse(cli("add", "--board", "billing", "--doing", "drawing the service", file)),
	);
	const boxId = drawn.elements.find((element) => element.type === "rectangle")?.id;
	expect(boxId).toBeDefined();

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${canvas.base}/?paneA=payments`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	const panes = (): Promise<PanesBody> =>
		request<PanesBody>("/api/panes").then((reply) => reply.body);
	const pane = (
		await pollUntil(panes, (state) => state.panes[0]?.board === "payments", "the pane to restore")
	).panes[0]!;

	// A deliberate move, so there is a workspace behind this one to go back to.
	await clickNavigatorRow(browser, "billing");
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === "paneA=billing",
		"the address to record the board the person opened",
	);
	const entries = await historyLength(browser);

	appendFileSync(join(vault, "billing.excalidraw.md"), "\nedited elsewhere\n");
	const refused = await request(
		`/api/elements/changes${await humanWriteQuery(request, "billing")}`,
		{
			method: "POST",
			body: { clientId: pane.clientId, upserts: [{ id: boxId, x: 140 }] },
		},
	);
	expect(refused.status).toBe(409);
	await pollUntil(
		() => shellNotices(browser),
		(notices) => notices.some((notice) => notice.title.includes("has stopped saving")),
		"the pane's board to stop saving",
	);

	// Back would take the board away from a canvas holding work the note has
	// not got, so the browser's own Back is refused and rolled back.
	await browser.eval("window.history.back()");
	await pollUntil(
		() => shellNotices(browser),
		(notices) => notices.some((notice) => notice.title === "Pane A kept its board"),
		"Back to say which pane kept its board",
	);
	expect(await addressSearch(browser)).toBe("paneA=billing");
	expect((await panes()).panes[0]?.board).toBe("billing");
	expect(await historyLength(browser)).toBe(entries);

	// The rollback left the history where it was, so once the board saves again
	// the same Back goes where it always would have.
	cli("browser", "show", "billing", "--pane", "primary", "--reload");
	await pollUntil(
		() => shellNotices(browser),
		(notices) => !notices.some((notice) => notice.title.includes("has stopped saving")),
		"the board to save again",
	);
	await browser.eval("window.history.back()");
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === "paneA=payments",
		"Back to reach the workspace it was refused from",
	);
	await pollUntil(
		panes,
		(state) => state.panes[0]?.board === "payments",
		"the pane to follow Back to the board it came from",
	);
	await canvas.assertRunning();
}, 30_000);

test("the board dialog opens a variant, and refuses when the pane stops saving under it", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "dialog-vault");
	mkdirSync(vault, { recursive: true });
	const canvas = await startOwnedCanvas({ serverPath, vault, env: canvasTestEnvironment() });
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);
	const cli = (...args: string[]): string => runCanvasCli(canvas.base, vault, args);
	cli("board", "new", "payments");
	cli("board", "new", "payments", "--variant", "proposed");
	const file = join(ownerRoot, "dialog.json");
	writeFileSync(
		file,
		JSON.stringify([
			{ type: "rectangle", x: 80, y: 80, width: 240, height: 100, label: { text: "Payments" } },
		]),
	);
	const drawn = AddResultSchema.parse(
		JSON.parse(cli("add", "--board", "payments@proposed", "--doing", "drawing the proposal", file)),
	);
	const boxId = drawn.elements.find((element) => element.type === "rectangle")?.id;
	expect(boxId).toBeDefined();

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${canvas.base}/?paneA=payments`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	const panes = (): Promise<PanesBody> =>
		request<PanesBody>("/api/panes").then((reply) => reply.body);
	const pane = (
		await pollUntil(panes, (state) => state.panes[0]?.board === "payments", "the pane to restore")
	).panes[0]!;

	// A variant is a different board with the same name, so what the address
	// records has to be the whole key the server resolved the request to.
	const entries = await historyLength(browser);
	await openBoardThroughDialog(browser, "payments@proposed");
	await pollUntil(
		() => addressSearch(browser),
		(search) => search === "paneA=payments@proposed",
		"the address to record the variant the person opened",
	);
	expect(await historyLength(browser)).toBe(entries + 1);

	// Asking for the board the pane is already on moves nothing, and leaves the
	// address bar able to answer the next thing asked of it.
	await openBoardThroughDialog(browser, "payments@proposed");
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('${BOARD_DIALOG}') === null`),
		(closed) => closed,
		"the dialog to close on a board the pane already shows",
	);
	expect(await addressSearch(browser)).toBe("paneA=payments@proposed");
	expect(await historyLength(browser)).toBe(entries + 1);

	// The pane stops saving while the dialog is open, which the guard could not
	// have known when the person opened it.
	await openDialog(browser);
	appendFileSync(join(vault, "payments@proposed.excalidraw.md"), "\nedited elsewhere\n");
	const refused = await request(
		`/api/elements/changes${await humanWriteQuery(request, "payments@proposed")}`,
		{ method: "POST", body: { clientId: pane.clientId, upserts: [{ id: boxId, x: 140 }] } },
	);
	expect(refused.status).toBe(409);
	await chooseInDialog(browser, "payments");
	await pollUntil(
		() => dialogAlerts(browser),
		(alerts) => alerts.some((words) => words.includes("stopped saving")),
		"the dialog to say why the pane kept its board",
	);
	expect((await panes()).panes[0]?.board).toBe("payments@proposed");
	expect(await addressSearch(browser)).toBe("paneA=payments@proposed");
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
