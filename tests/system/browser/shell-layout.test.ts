import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { PANE_SETTLE_CAP_MS } from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { activityLines, fixedPointElements } from "./fixtures/fixed-point-scene.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
} from "./support/agent-browser.ts";

type PanesBody = { paneCount?: number; panes?: Array<{ board?: string }> };
type DesktopShell = {
	navLeftOfCanvas: boolean;
	railRightOfCanvas: boolean;
	columnsAlign: boolean;
	actionHeights: number[];
	currentBoard: string;
};
type ActivityLayout = {
	lineCount: number;
	linesFit: boolean;
	panelFits: boolean;
	canvasClear: boolean;
	timestampsAlign: boolean;
};
type NarrowShell = {
	navAboveCanvas: boolean;
	railBelowCanvas: boolean;
	fitsViewport: boolean;
	pageWidth: number;
	viewportWidth: number;
	actionHeights: number[];
};

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const serverPath = join(repoRoot, "src/server.ts");

test("the shell stays usable from desktop width through 420 pixels", async () => {
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
	const browser = resources.use(await createAgentBrowser());
	const api = createJsonRequester(canvas);

	await api("/api/boards/new", {
		method: "POST",
		body: { board: "fixedpoint", level: "service" },
	});
	await api("/api/elements/batch?board=fixedpoint", {
		method: "POST",
		body: { elements: fixedPointElements },
	});
	await api("/api/boards/save", { method: "POST", body: { board: "fixedpoint" } });

	await browser.run(["open", canvas.base]);
	expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/i);
	await browser.run(["set", "viewport", "1440", "900"]);
	await pollUntil(
		() => api<PanesBody>("/api/panes").then((response) => response.body),
		(state) => (state.paneCount ?? 0) === 1,
		"the shell pane to register",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	await api("/api/boards/open", {
		method: "POST",
		body: { board: "fixedpoint", reload: true },
	});
	await pollUntil(
		() => browser.eval<string | null>("document.querySelector('.board-name')?.textContent.trim()"),
		(board) => board === "fixedpoint",
		"fixedpoint to become the visible board",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);

	const desktop = await browser.eval<DesktopShell | null>(`(() => {
    const nav = document.querySelector('.board-nav');
    const canvas = document.querySelector('.canvas-zone');
    const rail = document.querySelector('.agent-rail');
    const actions = [...document.querySelectorAll('.bar-actions .btn')];
    const current = document.querySelector('.board-nav-row[aria-current="page"]');
    if (!nav || !canvas || !rail || !current) return null;
    const navRect = nav.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const railRect = rail.getBoundingClientRect();
    return {
      navLeftOfCanvas: navRect.right <= canvasRect.left + 0.5,
      railRightOfCanvas: railRect.left >= canvasRect.right - 0.5,
      columnsAlign: Math.abs(navRect.top - canvasRect.top) < 1 &&
        Math.abs(navRect.bottom - canvasRect.bottom) < 1 &&
        Math.abs(railRect.top - canvasRect.top) < 1,
      actionHeights: actions.map(button => button.getBoundingClientRect().height),
      currentBoard: current.textContent.trim()
    };
  })()`);
	expect(desktop?.navLeftOfCanvas).toBe(true); // check-fixed-point.mjs:1955
	expect(desktop?.railRightOfCanvas).toBe(true); // check-fixed-point.mjs:1955
	expect(desktop?.columnsAlign).toBe(true); // check-fixed-point.mjs:1955
	expect(desktop?.actionHeights.length).toBeGreaterThanOrEqual(5); // check-fixed-point.mjs:1962
	expect(desktop?.actionHeights.every((height) => height >= 43.5)).toBe(true); // check-fixed-point.mjs:1962
	expect(desktop?.currentBoard.includes("Current")).toBe(true); // check-fixed-point.mjs:1968

	await browser.run(["set", "viewport", "420", "700"]);
	for (const [index, doing] of activityLines.entries()) {
		const wrote = await api(`/api/elements?board=fixedpoint&doing=${encodeURIComponent(doing)}`, {
			method: "POST",
			body: {
				id: `activity-${index}`,
				type: "rectangle",
				x: 900 + index * 20,
				y: 500,
				width: 10,
				height: 10,
			},
		});
		expect([200, 201]).toContain(wrote.status); // check-fixed-point.mjs:1997
	}
	const activity = await pollUntil(
		() =>
			browser.eval<ActivityLayout | null>(`(() => {
        const rail = document.querySelector('.agent-rail');
        const panel = document.querySelector('.pane-doing');
        const lines = [...document.querySelectorAll('.pane-doing-line')];
        const canvas = document.querySelector('.canvas-zone');
        if (!rail || !panel || !canvas || lines.length !== 5) return null;
        const railRect = rail.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const timestamps = [...document.querySelectorAll('.pane-doing-when')]
          .map(node => node.getBoundingClientRect().left);
        return {
          lineCount: lines.length,
          linesFit: lines.every(line => line.scrollWidth <= line.clientWidth),
          panelFits: panelRect.left >= railRect.left && panelRect.right <= railRect.right &&
            panelRect.bottom <= railRect.bottom,
          canvasClear: railRect.top >= canvas.getBoundingClientRect().bottom - 0.5,
          timestampsAlign: timestamps.every(left => Math.abs(left - timestamps[0]) < 0.5)
        };
      })()`),
		(layout) => layout?.lineCount === 5,
		"all five activity rows to render",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(activity?.lineCount).toBe(5); // check-fixed-point.mjs:2028
	expect(activity?.linesFit).toBe(true); // check-fixed-point.mjs:2033
	expect(activity?.panelFits).toBe(true); // check-fixed-point.mjs:2033
	expect(activity?.canvasClear).toBe(true); // check-fixed-point.mjs:2033
	expect(activity?.timestampsAlign).toBe(true); // check-fixed-point.mjs:2040

	const narrow = await browser.eval<NarrowShell | null>(`(() => {
    const nav = document.querySelector('.board-nav');
    const pane = document.querySelector('.pane');
    const bar = document.querySelector('.bar');
    const canvas = document.querySelector('.canvas-zone');
    const rail = document.querySelector('.agent-rail');
    const actions = [...document.querySelectorAll('.bar-actions .btn')];
    if (!nav || !pane || !bar || !canvas || !rail) return null;
    const navRect = nav.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    const railRect = rail.getBoundingClientRect();
    return {
      navAboveCanvas: navRect.bottom < paneRect.top,
      railBelowCanvas: railRect.top >= canvas.getBoundingClientRect().bottom - 0.5,
      fitsViewport: [navRect, paneRect, barRect, railRect].every(rect =>
        rect.left >= -0.5 && rect.right <= innerWidth + 0.5),
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      actionHeights: actions.map(button => button.getBoundingClientRect().height)
    };
  })()`);
	expect(narrow?.viewportWidth).toBe(420); // approved 420-pixel contract
	expect(narrow?.navAboveCanvas).toBe(true); // check-fixed-point.mjs:2067
	expect(narrow?.railBelowCanvas).toBe(true); // check-fixed-point.mjs:2067
	expect(narrow?.fitsViewport).toBe(true); // check-fixed-point.mjs:2072
	expect(narrow?.pageWidth).toBe(narrow?.viewportWidth); // check-fixed-point.mjs:2072
	expect(narrow?.actionHeights.every((height) => height >= 43.5)).toBe(true); // check-fixed-point.mjs:2072

	const switchStarted = await browser.eval<boolean>(`(() => {
    const row = document.querySelector('.board-group[aria-label="scratch"] .board-nav-row');
    if (!row) return false;
    row.click();
    return true;
  })()`);
	const scratch = await pollUntil(
		() => browser.eval<string | null>("document.querySelector('.board-name')?.textContent.trim()"),
		(board) => board === "scratch",
		"the navigator to open scratch",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(switchStarted).toBe(true); // check-fixed-point.mjs:2091
	expect(scratch).toBe("scratch"); // check-fixed-point.mjs:2091

	const returnStarted = await browser.eval<boolean>(`(() => {
    const row = document.querySelector('.board-group[aria-label="fixedpoint"] .board-nav-row');
    if (!row) return false;
    row.click();
    return true;
  })()`);
	const returned = await pollUntil(
		() => browser.eval<string | null>("document.querySelector('.board-name')?.textContent.trim()"),
		(board) => board === "fixedpoint",
		"the navigator to return to the original fixedpoint board",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(returnStarted).toBe(true); // check-fixed-point.mjs:2103
	expect(returned).toBe("fixedpoint"); // approved exact original-board return
});
