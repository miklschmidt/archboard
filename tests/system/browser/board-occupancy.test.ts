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

/** Which pane letter the navigator says is showing one board, or null. */
const MARKER_TEXT = `node => { const label = [...node.querySelectorAll("span")].find(span => span.textContent.trim() === "on screen in pane"); return label?.parentElement ? label.parentElement.textContent.replace("on screen in pane", "").trim() : null; }`;

/** Every navigator row and the pane letter it says is showing that board. */
const OCCUPANCY = `[...document.querySelectorAll("[data-board-key]")].map(row => [row.getAttribute("data-board-key"), (${MARKER_TEXT})(row)])`;

/** Every preview the page has asked the server for, in order. */
const PREVIEW_REQUESTS = "window.__previewProbe.requests.map(entry => entry.board)";

const OWNER = "the navigator lets go of a pane that closes and re-reads a board a person left";

test(
	OWNER,
	async () => {
		declareTestWallClockBudget({
			test: OWNER,
			reason:
				"One real browser walks a pane closing twice, once by its control and once by the address, and then a board being drawn on and left. Each step waits on a real pane retirement and a real note write.",
			outerBoundMs: TEST_BROWSER_COMMAND_TIMEOUT_MS * 4,
			task: "TASK-167",
			evidence:
				"The owner reached the drawing step in about 5 seconds on the measured local runner; the bound leaves room for the write and a slower one.",
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
		await addBox(request, "payments", "pbox", "Payments");
		await addBox(request, "billing", "bbox", "Billing");
		const browser = resources.use(await createAgentBrowser());
		const initScript = join(ownerRoot, "occupancy-probe.js");
		writeFileSync(
			initScript,
			`{ window.__previewProbe = { requests: [] }; const nativeFetch = window.fetch.bind(window); window.fetch = async (input, init) => { const requestUrl = typeof input === 'string' ? input : input.url; const url = new URL(requestUrl, location.href); if (url.pathname === '/api/boards/preview') window.__previewProbe.requests.push({ board: url.searchParams.get('board') }); return nativeFetch(input, init); }; }`,
		);
		await browser.run([
			"--init-script",
			initScript,
			"open",
			`${canvas.base}/?paneA=payments&paneB=billing&pane=B`,
		]);
		await browser.run(["set", "viewport", "1920", "1080"]);
		const panes = (): Promise<PanesBody> =>
			request<PanesBody>("/api/panes").then((reply) => reply.body);
		const restored = await pollUntil(
			panes,
			(state) => state.paneCount === 2,
			"both panes of the addressed comparison to register",
		);
		// Each board says which pane is showing it, which is read from the server's
		// inventory rather than from this tab's own layout.
		await pollUntil(
			() => browser.eval<[string, string | null][]>(OCCUPANCY),
			(rows) => rows.some(([board, letter]) => board === "billing" && letter === "B"),
			"the navigator to mark billing as on screen in the second pane",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		const paneB = restored.panes.toSorted((a, b) => a.position - b.position)[1];
		expect(paneB?.board).toBe("billing");

		// A pane closed by its own control. The server drops it when its socket
		// closes and tells the surviving pane nothing, so the shell has to notice
		// on its own — well inside the half-minute its inventory counts as fresh.
		await browser.run(["click", `button[aria-label="Close pane ${paneB?.paneId}"]`]);
		await pollUntil(panes, (state) => state.paneCount === 1, "the closed pane to be retired");
		await pollUntil(
			() => browser.eval<[string, string | null][]>(OCCUPANCY),
			(rows) => rows.every(([, letter]) => letter !== "B"),
			"the navigator to stop saying billing is on screen",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);

		// The same close, driven by the address instead of the control: Back
		// restores the comparison and Forward closes the pane again.
		await browser.eval("window.history.back()");
		const reopened = await pollUntil(
			panes,
			(state) => state.paneCount === 2,
			"Back to restore the comparison",
		);
		// The address owns which board the restored pane lands on; this owns whether
		// the navigator says a second pane is showing one at all.
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

		// A board the person was working in is read again the moment they leave
		// it. While a pane holds a board the navigator draws that pane's own
		// scene, so nothing is read for it; ordinary drawing reaches the note
		// through change reports that no command outcome describes, and letting
		// go is the one signal that covers every way it can have been written.
		await installLiveEditSupport(browser);
		const before = await browser.eval<number>(PREVIEW_REQUESTS + ".length");
		expect(
			await applyPageEdit(browser, { kind: "move", id: "pbox", dx: 40, dy: 24 }),
		).toMatchObject({
			ok: true,
		});
		expect(await clickNavigatorRow(browser, "billing")).toBe(true);
		await pollUntil(
			panes,
			(state) => state.panes.every((pane) => pane.board === "billing"),
			"the pane to leave the board it was editing",
		);
		await pollUntil(
			() => browser.eval<string[]>(PREVIEW_REQUESTS),
			(requests) => requests.slice(before).includes("payments"),
			"the board that was left to be read from the server again",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS * 4,
);
