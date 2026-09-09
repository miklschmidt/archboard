import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PANE_SETTLE_CAP_MS } from "../../../src/shared/timing/timing.ts";
import { declareTestWallClockBudget } from "../repository-policy/support/test-wall-clock.ts";
import { TEST_BROWSER_COMMAND_TIMEOUT_MS } from "../support/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
} from "./support/agent-browser.ts";
import { createBoard, addBox } from "./support/navigator-fixture.ts";
import { serverPath, type PanesBody } from "./support/navigator-support.ts";
import { applyPageEdit, installLiveEditSupport } from "./support/page-scene.ts";
import { clickNavigatorRow } from "./support/shell-dom.ts";

/** The pane letter one navigator row says is showing its board, or null. */
const MARKER_TEXT = `node => { const label = [...node.querySelectorAll("span")].find(span => span.textContent.trim() === "on screen in pane"); return label?.parentElement ? label.parentElement.textContent.replace("on screen in pane", "").trim() : null; }`;

/** Every navigator row and the pane letter it says is showing that board. */
const OCCUPANCY = `[...document.querySelectorAll("[data-board-key]")].map(row => [row.getAttribute("data-board-key"), (${MARKER_TEXT})(row)])`;

/** Every board preview the page has been answered with, and where the box was. */
const PREVIEWS = "window.__previewProbe.previews";

/** One preview answer: the board it depicts, and where the box sits in it. */
interface PreviewAnswer {
	board: string | null;
	x: number | null;
}

/** Where the seeded box starts, so a move shows up as a coordinate. */
const BOX_X = 40;

const OWNER = "a pane that closes, and a board read again after the person edits and leaves it";

test(
	OWNER,
	async () => {
		declareTestWallClockBudget({
			test: OWNER,
			reason:
				"One real browser closes a pane by its own control and again by the address, then edits a board through a trusted interaction and leaves it. The steps wait on a real pane retirement, a real note write, and a real preview answer.",
			outerBoundMs: TEST_BROWSER_COMMAND_TIMEOUT_MS * 4,
			task: "TASK-167",
			evidence:
				"The two closes take about three seconds together on the measured local runner; the bound leaves room for the note write and a slower one.",
		});
		await using resources = new AsyncDisposableStack();
		const { ownerRoot } = browserTestRoots();
		const vault = join(ownerRoot, "vault");
		mkdirSync(vault, { recursive: true });
		const canvas = await startOwnedCanvas({
			serverPath,
			vault,
			env: canvasTestEnvironment({ LOG_FILE_PATH: join(ownerRoot, "canvas.log") }),
		});
		resources.defer(() => canvas.dispose());
		registerCanvasBase(canvas.base);
		const request = createJsonRequester(canvas);
		await createBoard(request, "payments");
		await createBoard(request, "billing");
		await createBoard(request, "ledger");
		await addBox(request, "payments", "pbox", "Payments");
		await addBox(request, "billing", "bbox", "Billing");
		await addBox(request, "ledger", "lbox", "Ledger");
		const browser = resources.use(await createAgentBrowser());
		const initScript = join(ownerRoot, "occupancy-probe.js");
		// Each preview answer is recorded with the box's coordinate in it, so a
		// read that only repeated what the cache already had cannot be mistaken
		// for one that came back carrying the person's edit.
		writeFileSync(
			initScript,
			`{ window.__previewProbe = { previews: [] }; const nativeFetch = window.fetch.bind(window); window.fetch = async (input, init) => { const requestUrl = typeof input === 'string' ? input : input.url; const url = new URL(requestUrl, location.href); const response = await nativeFetch(input, init); if (url.pathname !== '/api/boards/preview') return response; const board = url.searchParams.get('board'); try { const body = await response.clone().json(); const box = (body.elements || []).find(element => element.id === 'pbox'); window.__previewProbe.previews.push({ board, x: box ? box.x : null }); } catch { window.__previewProbe.previews.push({ board, x: null }); } return response; }; }`,
		);
		// The comparison holds billing and ledger, so payments is held by nobody
		// and is depicted from the server the way any listed board is.
		await browser.run([
			"--init-script",
			initScript,
			"open",
			`${canvas.base}/?paneA=billing&paneB=ledger&pane=B`,
		]);
		await browser.run(["set", "viewport", "1920", "1080"]);
		const panes = (): Promise<PanesBody> =>
			request<PanesBody>("/api/panes").then((reply) => reply.body);
		const restored = await pollUntil(
			panes,
			(state) => state.paneCount === 2,
			"both panes of the addressed comparison to register",
		);
		// Each board says which pane is showing it, read from the server's
		// inventory rather than from this tab's own layout.
		await pollUntil(
			() => browser.eval<[string, string | null][]>(OCCUPANCY),
			(rows) => rows.some(([board, letter]) => board === "ledger" && letter === "B"),
			"the navigator to mark ledger as on screen in the second pane",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		const paneB = restored.panes.toSorted((a, b) => a.position - b.position)[1];
		expect(paneB?.board).toBe("ledger");

		// A pane closed by its own control. The server drops it when its socket
		// closes and tells the surviving pane nothing, so the shell has to notice
		// on its own — well inside the half-minute its inventory counts as fresh.
		await browser.run(["click", `button[aria-label="Close pane ${paneB?.paneId}"]`]);
		await pollUntil(panes, (state) => state.paneCount === 1, "the closed pane to be retired");
		await pollUntil(
			() => browser.eval<[string, string | null][]>(OCCUPANCY),
			(rows) => rows.every(([, letter]) => letter !== "B"),
			"the navigator to stop saying a second pane is showing a board",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);

		// The same close driven by the address instead of the control: Back
		// restores the comparison and Forward closes the pane again.
		await browser.eval("window.history.back()");
		const reopened = await pollUntil(
			panes,
			(state) => state.paneCount === 2,
			"Back to restore the comparison",
		);
		// The address owns which board the restored pane lands on; this owns
		// whether the navigator says a second pane is showing one at all.
		expect(reopened.panes.toSorted((a, b) => a.position - b.position)[1]?.board).toBeTruthy();
		await pollUntil(
			() => browser.eval<[string, string | null][]>(OCCUPANCY),
			(rows) => rows.some(([, letter]) => letter === "B"),
			"the navigator to mark the pane the address restored",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		await browser.eval("window.history.forward()");
		await pollUntil(panes, (state) => state.paneCount === 1, "Forward to close the pane again");
		await pollUntil(
			() => browser.eval<[string, string | null][]>(OCCUPANCY),
			(rows) => rows.every(([, letter]) => letter !== "B"),
			"the navigator to let go of a pane the address closed",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);

		// Payments was depicted from the server while nobody held it, so the
		// cache is holding a picture of it from before anything was edited.
		const primed = await pollUntil(
			() => browser.eval<PreviewAnswer[]>(PREVIEWS),
			(previews) => previews.some((answer) => answer.board === "payments" && answer.x === BOX_X),
			"payments to be depicted from the server while no pane held it",
		);
		const answered = primed.length;

		// Now the person opens it, draws in it and leaves. The edit reaches the
		// note through the pane's change reports and through no command whose
		// outcome anybody hears; it only counts as a person drawing at all after
		// a trusted interaction, which is why the canvas is clicked first.
		expect(await clickNavigatorRow(browser, "payments")).toBe(true);
		await pollUntil(
			panes,
			(state) => state.panes.every((pane) => pane.board === "payments"),
			"the pane to open the board the person is about to edit",
		);
		await installLiveEditSupport(browser);
		await browser.run(["click", ".excalidraw"]);
		expect(
			await applyPageEdit(browser, { kind: "move", id: "pbox", dx: 40, dy: 24 }),
		).toMatchObject({ ok: true });
		const written = await pollUntil(
			() =>
				request<{ elements: { id: string; x: number }[] }>("/api/elements?board=payments").then(
					(reply) => reply.body,
				),
			(body) => (body.elements.find((element) => element.id === "pbox")?.x ?? BOX_X) !== BOX_X,
			"the drawing to reach the note",
		);
		const movedTo = written.elements.find((element) => element.id === "pbox")?.x;
		expect(movedTo).toBeGreaterThan(BOX_X);

		// Leaving is what puts the server back in charge of depicting it, well
		// inside the minute the picture it already had counts as fresh.
		expect(await clickNavigatorRow(browser, "billing")).toBe(true);
		await pollUntil(
			panes,
			(state) => state.panes.every((pane) => pane.board === "billing"),
			"the pane to leave the board it was editing",
		);
		await pollUntil(
			() => browser.eval<PreviewAnswer[]>(PREVIEWS),
			(previews) =>
				previews
					.slice(answered)
					.some((answer) => answer.board === "payments" && answer.x === movedTo),
			"the board that was left to be depicted by what the person drew in it",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS * 4,
);
