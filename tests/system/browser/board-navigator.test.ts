import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { PanesReport } from "../../../src/runtime/engine/panes.ts";
import { PANE_SETTLE_CAP_MS } from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
} from "./support/agent-browser.ts";

type PanesBody = PanesReport & { success: boolean };
type Requester = ReturnType<typeof createJsonRequester>;

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const serverPath = join(repoRoot, "src/server.ts");

async function createBoard(
	request: Requester,
	board: string,
	options: { save?: boolean; variant?: string } = {},
): Promise<string> {
	const key = options.variant ? `${board}@${options.variant}` : board;
	expect(
		(
			await request("/api/boards/new", {
				method: "POST",
				body: { board, variant: options.variant, level: "service" },
			})
		).status,
	).toBe(200);
	if (options.save !== false) {
		expect(
			(await request("/api/boards/save", { method: "POST", body: { board: key } })).status,
		).toBe(200);
	}
	return key;
}

test("the operator strip keeps empty, loading, retry, and scratch naming states actionable", async () => {
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
	const request = createJsonRequester(canvas);
	const initScript = join(ownerRoot, "delay-board-listing.js");
	writeFileSync(
		initScript,
		`{
  const nativeFetch = window.fetch.bind(window);
  let delayed = false;
  window.fetch = (input, init) => {
    const requestUrl = typeof input === 'string' ? input : input.url;
    const url = new URL(requestUrl, location.href);
    if (!delayed && url.pathname === '/api/boards') {
      delayed = true;
      return new Promise((resolve, reject) => {
        setTimeout(() => nativeFetch(input, init).then(resolve, reject), 350);
      });
    }
    return nativeFetch(input, init);
  };
}`,
	);

	await browser.run(["--init-script", initScript, "open", canvas.base]);
	expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/i);
	await browser.run(["set", "viewport", "420", "700"]);
	await pollUntil(
		() => request<PanesBody>("/api/panes").then((response) => response.body),
		(state) => state.paneCount === 1,
		"the empty-vault pane to register",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	const loading = await pollUntil(
		() =>
			browser.eval<string | null>("document.querySelector('.board-nav-empty')?.textContent.trim()"),
		(text) => text === "Reading the vault…",
		"the delayed real board listing to expose its loading state",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(loading).toBe("Reading the vault…");
	await pollUntil(
		() =>
			browser.eval<string | null>("document.querySelector('.board-nav-empty')?.textContent.trim()"),
		(text) => text === "No named boards yet.",
		"the real empty named-board state",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);

	const empty = await browser.eval<{
		actionLabels: string[];
		targets: Array<{ height: number; width: number }>;
		currentScratch: boolean;
		pageFits: boolean;
	}>(`(() => {
    const targets = [...document.querySelectorAll(
      '.board-nav-tools button, .scratch-top, .name-button'
    )];
    return {
      actionLabels: [...document.querySelectorAll('.board-nav-tools button')]
        .map(button => button.getAttribute('aria-label')),
      targets: targets.map(node => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
      currentScratch: Boolean(
        document.querySelector('.scratch-section .board-nav-row[aria-current="page"]')
      ),
      pageFits: document.documentElement.scrollWidth === innerWidth
    };
  })()`);
	expect(empty.actionLabels).toEqual(["Refresh boards", "New board"]);
	expect(empty.targets).toHaveLength(4);
	expect(empty.targets.every(({ width, height }) => width >= 43.5 && height >= 43.5)).toBe(true);
	expect(empty.currentScratch).toBe(true);
	expect(empty.pageFits).toBe(true);

	expect(
		await browser.eval<boolean>(`(() => {
      const button = document.querySelector('.name-button');
      if (!button) return false;
      button.click();
      return true;
    })()`),
	).toBe(true);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				"Boolean(document.querySelector('dialog[aria-label=\"Save this board as\"]'))",
			),
		Boolean,
		"contextual scratch naming to open",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(
		await browser.eval<boolean>(`(() => {
      const button = document.querySelector('.modal-close[aria-label="Close dialog"]');
      if (!button) return false;
      button.click();
      return true;
    })()`),
	).toBe(true);

	expect(
		await browser.eval<boolean>(`(() => {
      if (window.__archboardNativeFetch) return false;
      window.__archboardNativeFetch = window.fetch;
      window.fetch = async (input, init) => {
        const requestUrl = typeof input === 'string' ? input : input.url;
        const url = new URL(requestUrl, location.href);
        if (url.pathname === '/api/boards') {
          return new Response(JSON.stringify({ success: false, error: 'forced board-list failure' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return window.__archboardNativeFetch(input, init);
      };
      document.querySelector('.board-nav-tools [aria-label="Refresh boards"]')?.click();
      return true;
    })()`),
	).toBe(true);
	const retry = await pollUntil(
		() =>
			browser.eval<{ height?: number; label?: string; text?: string }>(`(() => {
        const button = document.querySelector('.board-nav-error');
        if (!button) return {};
        return {
          label: button.getAttribute('aria-label'),
          text: button.textContent.trim(),
          height: button.getBoundingClientRect().height
        };
      })()`),
		(state) => state.label === "Retry board listing",
		"the board-list retry state",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(retry.text).toBe("Could not read the vault. Try again.");
	expect(retry.height ?? 0).toBeGreaterThanOrEqual(43.5);
	expect(
		await browser.eval<boolean>(`(() => {
      const retry = document.querySelector('.board-nav-error');
      if (!retry || !window.__archboardNativeFetch) return false;
      window.fetch = window.__archboardNativeFetch;
      delete window.__archboardNativeFetch;
      retry.click();
      return true;
    })()`),
	).toBe(true);
	await pollUntil(
		() =>
			browser.eval<boolean>(`!document.querySelector('.board-nav-error') &&
        document.querySelector('.board-nav-empty')?.textContent.trim() === 'No named boards yet.'`),
		Boolean,
		"the empty list to recover after retry",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
});

test("the strip keeps every real board reachable and replaces the focused pane", async () => {
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
	const primary = await createBoard(request, "primary");
	const option = await createBoard(request, "primary", { variant: "option-a" });
	for (const board of ["alpha", "beta", "gamma", "secondary"]) await createBoard(request, board);
	await createBoard(request, "draft-probe", { save: false });

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", canvas.base]);
	expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/i);
	await browser.run(["set", "viewport", "1440", "900"]);
	await pollUntil(
		() => request<PanesBody>("/api/panes").then((response) => response.body),
		(state) => state.paneCount === 1,
		"the navigator pane to register",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	await pollUntil(
		() =>
			browser.eval<number>(
				"document.querySelectorAll('.board-group:not(.scratch-section)').length",
			),
		(count) => count === 6,
		"all real named boards to enter the strip",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);

	const desktop = await browser.eval<{
		boardCount: number;
		draftMarkers: string[];
		navWidth: number;
		primaryVariants: string[];
		targets: Array<{ height: number; width: number }>;
	}>(`(() => {
    const nav = document.querySelector('.board-nav');
    const primaryRows = [...document.querySelectorAll(
      '.board-group[aria-label="primary"] .board-nav-row'
    )];
    const targets = [...document.querySelectorAll(
      '.board-nav-tools button, .board-variants .board-nav-row, .scratch-top, .name-button'
    )];
    return {
      boardCount: document.querySelectorAll('.board-group:not(.scratch-section)').length,
      draftMarkers: [...document.querySelectorAll(
        '.board-group[aria-label="draft-probe"] .board-nav-markers > span'
      )].map(node => node.textContent.trim()),
      navWidth: nav.getBoundingClientRect().width,
      primaryVariants: primaryRows.map(row => row.dataset.boardKey),
      targets: targets.map(node => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      })
    };
  })()`);
	expect(desktop.boardCount).toBe(6);
	expect(desktop.navWidth).toBeCloseTo(184, 0);
	expect(desktop.primaryVariants).toEqual([primary, option]);
	expect(desktop.draftMarkers).toEqual(["open", "draft"]);
	expect(desktop.targets.every(({ width, height }) => width >= 43.5 && height >= 43.5)).toBe(true);

	expect(
		await browser.eval<boolean>(`(() => {
      const row = document.querySelector('[data-board-key=${JSON.stringify(primary)}]');
      if (!row) return false;
      row.click();
      return true;
    })()`),
	).toBe(true);
	await pollUntil(
		() => browser.eval<string | null>("document.querySelector('.board-name')?.textContent.trim()"),
		(name) => name === primary,
		"the primary board to open",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(
		await browser.eval<boolean>(`(() => {
      const split = document.querySelector('.bar-actions [aria-label="Split"]');
      if (!split) return false;
      split.click();
      return true;
    })()`),
	).toBe(true);
	const split = await pollUntil(
		() => request<PanesBody>("/api/panes").then((response) => response.body),
		(state) => state.paneCount === 2,
		"the shell to expose two panes",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	const rightPaneId = split.panes.toSorted((a, b) => a.position - b.position)[1]?.paneId;
	expect(rightPaneId).toBeTruthy();
	expect(
		await browser.eval<boolean>(`(() => {
      const tabs = [...document.querySelectorAll('.pane-tab')];
      const right = tabs.at(-1);
      if (!right) return false;
      right.click();
      return true;
    })()`),
	).toBe(true);
	await pollUntil(
		() => request<PanesBody>("/api/panes").then((response) => response.body),
		(state) => state.focused === rightPaneId,
		"the right pane to become focused",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(
		await browser.eval<boolean>(`(() => {
      const row = document.querySelector('[data-board-key=${JSON.stringify(option)}]');
      if (!row) return false;
      row.click();
      return true;
    })()`),
	).toBe(true);
	const replaced = await pollUntil(
		() => request<PanesBody>("/api/panes").then((response) => response.body),
		(state) =>
			state.focused === rightPaneId &&
			state.panes.find((pane) => pane.paneId === rightPaneId)?.board === option,
		"the selected variant to replace only the focused pane",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(replaced.panes.find((pane) => pane.paneId !== rightPaneId)?.board).toBe(primary);

	await browser.run(["set", "viewport", "420", "900"]);
	const narrow = await pollUntil(
		() =>
			browser.eval<{
				canvasOverlap: boolean;
				currentFirst: boolean;
				currentVisible: boolean;
				lastReachable: boolean;
				outerScrollable: boolean;
				pageFits: boolean;
				variantScrollable: boolean;
			}>(`(() => {
        const nav = document.querySelector('.board-nav');
        const list = document.querySelector('.board-nav-list');
        const canvas = document.querySelector('.canvas-zone');
        const groups = [...document.querySelectorAll('.board-nav-list .board-group')];
        const current = document.querySelector('.board-nav-row[aria-current="page"]');
        const currentGroup = current?.closest('.board-group');
        const variants = current?.closest('.board-variants');
        if (!nav || !list || !canvas || !current || !currentGroup || !variants) return {
          canvasOverlap: true, currentFirst: false, currentVisible: false,
          lastReachable: false, outerScrollable: false, pageFits: false,
          variantScrollable: false
        };
        const listRect = list.getBoundingClientRect();
        const currentRect = current.getBoundingClientRect();
        const navRect = nav.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const last = groups.at(-1);
        list.scrollLeft = list.scrollWidth;
        const lastRect = last?.getBoundingClientRect();
        return {
          canvasOverlap: navRect.bottom > canvasRect.top + 0.5,
          currentFirst: groups[0] === currentGroup,
          currentVisible: currentRect.left >= listRect.left - 0.5 && currentRect.right <= listRect.right + 0.5,
          lastReachable: !!lastRect && lastRect.right <= listRect.right + 0.5 && lastRect.left < listRect.right,
          outerScrollable: list.scrollWidth > list.clientWidth,
          pageFits: document.documentElement.scrollWidth === innerWidth,
          variantScrollable: variants.scrollWidth >= variants.clientWidth
        };
      })()`),
		(state) => state.currentFirst && state.currentVisible && state.lastReachable,
		"the current and final board groups to remain reachable at 420 pixels",
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(narrow.canvasOverlap).toBe(false);
	expect(narrow.outerScrollable).toBe(true);
	expect(narrow.pageFits).toBe(true);
	expect(narrow.variantScrollable).toBe(true);
});
