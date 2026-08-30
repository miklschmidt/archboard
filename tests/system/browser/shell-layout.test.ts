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
	navWidth: number;
	workbenchBelowPane: boolean;
	workbenchInsideCanvas: boolean;
	columnsAlign: boolean;
	canvasLargest: boolean;
	actionHeights: number[];
	currentBoard: string;
};
type ThemeSnapshot = {
	theme: "light" | "dark";
	wordmark: string;
	brandIconCount: number;
	headerHeight: number;
	selection: string;
	status: string;
	background: string;
	inkContrast: number;
	flatSurfaces: boolean;
	shadowlessSurfaces: boolean;
	visibleFocus: boolean;
	monospacedSecondary: boolean;
	boardIdentity: string;
	level: string;
	connectionState: string;
	persistenceState: string;
	vaultState: string;
	paneIdentity: string;
	actionTargets: Array<{ width: number; height: number }>;
};
type ThemeTransitionState = {
	theme: string | null;
	toggleLabel: string | null;
	shellCount: number;
	rootChildCount: number;
	url: string;
	bodyText: string;
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
	navHeight: number;
	navWidth: number;
	workbenchBelowPane: boolean;
	fitsViewport: boolean;
	canvasLargest: boolean;
	wordmarkVisible: boolean;
	brandIconCount: number;
	headerHeight: number;
	theme: "light" | "dark";
	selection: string;
	status: string;
	pageWidth: number;
	viewportWidth: number;
	actionHeights: number[];
	actionWidths: number[];
	actionsFit: boolean;
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

	const readTheme = () =>
		browser.eval<ThemeSnapshot | null>(`(() => {
      const shell = document.querySelector('.shell');
      const bar = document.querySelector('.bar');
      const wordmark = document.querySelector('.wordmark');
      const open = document.querySelector('.bar-actions [aria-label="Open board"]');
      const board = document.querySelector('.board-name');
      const level = document.querySelector('.level-tag');
      const connection = document.querySelector('.status');
      const persistence = document.querySelector('.meta-vault, .chip-held, .chip-elsewhere');
      const vault = document.querySelector('.vault-name');
      const pane = document.querySelector('.pane-tab.focused');
      const actions = [...document.querySelectorAll('.bar-actions .btn')];
      if (!shell || !bar || !wordmark || !open || !board || !level || !connection ||
          !persistence || !vault || !pane) return null;
      const style = getComputedStyle(shell);
      const flat = [
        '.shell', '.bar', '.board-nav', '.board-group.active-group',
        '.board-nav-row-current', '.scratch-section', '.scratch-card',
        '.canvas-zone', '.pane-bar', '.agent-rail', '.claim-card',
        '.statusbar', '.btn-primary'
      ].map(selector => document.querySelector(selector)).filter(Boolean);
      const rgb = value => (value.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
      const luminance = value => {
        const channels = rgb(value).map(channel => {
          const unit = channel / 255;
          return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      };
      const foreground = luminance(getComputedStyle(wordmark).color);
      const backdrop = luminance(getComputedStyle(bar).backgroundColor);
      open.focus();
      const focus = getComputedStyle(open);
      return {
        theme: shell.dataset.theme,
        wordmark: wordmark.textContent.trim(),
        brandIconCount: document.querySelectorAll('.bar-brand svg, .brand-mark').length,
        headerHeight: bar.getBoundingClientRect().height,
        selection: style.getPropertyValue('--selection').trim().toLowerCase(),
        status: style.getPropertyValue('--status').trim().toLowerCase(),
        background: getComputedStyle(shell).backgroundColor,
        inkContrast: (Math.max(foreground, backdrop) + 0.05) /
          (Math.min(foreground, backdrop) + 0.05),
        flatSurfaces: flat.every(node => getComputedStyle(node).backgroundImage === 'none'),
        shadowlessSurfaces: flat.every(node => getComputedStyle(node).boxShadow === 'none'),
        visibleFocus: focus.outlineStyle !== 'none' && parseFloat(focus.outlineWidth) >= 2,
        monospacedSecondary: /mono|consolas/i.test(getComputedStyle(vault).fontFamily),
        boardIdentity: board.textContent.trim(),
        level: level.textContent.trim(),
        connectionState: connection.textContent.trim(),
        persistenceState: persistence.textContent.trim(),
        vaultState: vault.textContent.trim(),
        paneIdentity: pane.textContent.trim(),
        actionTargets: actions.map(button => {
          const rect = button.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        })
      };
    })()`);
	const firstTheme = await readTheme();
	expect(firstTheme).not.toBeNull();
	const nextTheme = firstTheme?.theme === "light" ? "dark" : "light";
	const themeToggled = await browser.eval<boolean>(`(() => {
    const button = document.querySelector('.bar-actions [aria-label="Use ${nextTheme} theme"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
	expect(themeToggled).toBe(true);
	const themeTransition = await pollUntil(
		() =>
			browser.eval<ThemeTransitionState>(`(() => {
        const shells = [...document.querySelectorAll('.shell')];
        const shell = shells[0];
        const toggle = document.querySelector('.bar-actions [aria-label^="Use "][aria-label$=" theme"]');
        return {
          theme: shell?.getAttribute('data-theme') ?? null,
          toggleLabel: toggle?.getAttribute('aria-label') ?? null,
          shellCount: shells.length,
	          rootChildCount: document.getElementById('root')?.childElementCount ?? 0,
	          url: location.href,
	          bodyText: document.body.innerText.slice(0, 240)
	        };
      })()`),
		(state) =>
			state.theme === nextTheme &&
			state.toggleLabel === `Use ${firstTheme?.theme ?? "light"} theme`,
		`${nextTheme} theme to become visible`,
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(themeTransition.shellCount).toBe(1);
	expect(themeTransition.rootChildCount).toBe(1);
	const secondTheme = await readTheme();
	const themes = [firstTheme, secondTheme].filter(
		(snapshot): snapshot is ThemeSnapshot => snapshot !== null,
	);
	expect(themes.map(({ theme }) => theme).toSorted()).toEqual(["dark", "light"]); // matched theme contract
	for (const snapshot of themes) {
		expect(snapshot.wordmark).toBe("archboard"); // approved lowercase wordmark
		expect(snapshot.brandIconCount).toBe(0); // the wordmark has no decorative icon tile
		expect(snapshot.headerHeight).toBeCloseTo(56, 0); // approved compact desktop bar
		expect(snapshot.selection).toBe("#155eef"); // literal cobalt selection token
		expect(snapshot.status).toBe("#a3e635"); // literal acid-lime status token
		expect(snapshot.inkContrast).toBeGreaterThanOrEqual(4.5);
		expect(snapshot.flatSurfaces).toBe(true);
		expect(snapshot.shadowlessSurfaces).toBe(true);
		expect(snapshot.visibleFocus).toBe(true);
		expect(snapshot.monospacedSecondary).toBe(true);
		expect(snapshot.boardIdentity).toBe("fixedpoint");
		expect(snapshot.level.toLowerCase()).toBe("service");
		expect(snapshot.connectionState).toContain("Live board");
		expect(snapshot.persistenceState).toContain("in the vault");
		expect(snapshot.vaultState).toContain("/ autowrite");
		expect(snapshot.paneIdentity).toContain("fixedpoint");
		expect(
			snapshot.actionTargets.every(({ width, height }) => width >= 43.5 && height >= 43.5),
		).toBe(true);
	}
	expect(themes[0]?.background).not.toBe(themes[1]?.background); // themes keep distinct neutral fields

	const desktop = await browser.eval<DesktopShell | null>(`(() => {
	    const nav = document.querySelector('.board-nav');
	    const canvas = document.querySelector('.canvas-zone');
	    const rail = document.querySelector('.agent-rail');
	    const pane = document.querySelector('.pane');
    const actions = [...document.querySelectorAll('.bar-actions .btn')];
    const current = document.querySelector('.board-nav-row[aria-current="page"]');
	    if (!nav || !canvas || !rail || !pane || !current) return null;
    const navRect = nav.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
	    const railRect = rail.getBoundingClientRect();
	    const paneRect = pane.getBoundingClientRect();
	    return {
      navLeftOfCanvas: navRect.right <= canvasRect.left + 0.5,
      navWidth: navRect.width,
	      workbenchBelowPane: railRect.top >= paneRect.bottom - 0.5,
	      workbenchInsideCanvas: railRect.left >= canvasRect.left - 0.5 &&
	        railRect.right <= canvasRect.right + 0.5 && railRect.bottom <= canvasRect.bottom + 0.5,
	      columnsAlign: Math.abs(navRect.top - canvasRect.top) < 1 &&
	        Math.abs(navRect.bottom - canvasRect.bottom) < 1,
	      canvasLargest: canvasRect.width > navRect.width && paneRect.height > railRect.height,
      actionHeights: actions.map(button => button.getBoundingClientRect().height),
      currentBoard: current.textContent.trim()
    };
  })()`);
	expect(desktop?.navLeftOfCanvas).toBe(true); // check-fixed-point.mjs:1955
	expect(desktop?.navWidth).toBeCloseTo(184, 0); // approved compact desktop operator strip
	expect(desktop?.workbenchBelowPane).toBe(true);
	expect(desktop?.workbenchInsideCanvas).toBe(true);
	expect(desktop?.columnsAlign).toBe(true); // check-fixed-point.mjs:1955
	expect(desktop?.canvasLargest).toBe(true); // approved canvas-primary desktop composition
	expect(desktop?.actionHeights.length).toBeGreaterThanOrEqual(5); // check-fixed-point.mjs:1962
	expect(desktop?.actionHeights.every((height) => height >= 43.5)).toBe(true); // check-fixed-point.mjs:1962
	expect(desktop?.currentBoard.includes("Current")).toBe(true); // check-fixed-point.mjs:1968

	const collapsedPaneHeight = await browser.eval<number>(
		"document.querySelector('.pane').getBoundingClientRect().height",
	);
	expect(
		await browser.eval<boolean>(
			"document.querySelector('.workbench-toggle').getAttribute('aria-expanded') === 'false'",
		),
	).toBe(true);
	await browser.run(["click", ".workbench-toggle"]);
	const expandedPaneHeight = await pollUntil(
		() => browser.eval<number>("document.querySelector('.pane').getBoundingClientRect().height"),
		(height) => height < collapsedPaneHeight - 100,
		"the expanded workbench to yield space from the canvas",
	);
	expect(expandedPaneHeight).toBeLessThan(collapsedPaneHeight);
	await browser.run(["click", ".workbench-toggle"]);
	await pollUntil(
		() => browser.eval<number>("document.querySelector('.pane').getBoundingClientRect().height"),
		(height) => Math.abs(height - collapsedPaneHeight) < 1,
		"collapse to restore the canvas height",
	);

	await browser.run(["set", "viewport", "420", "700"]);
	await browser.run(["click", ".workbench-toggle"]);
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
	        const pane = document.querySelector('.pane');
	        if (!rail || !panel || !canvas || !pane || lines.length !== 5) return null;
        const railRect = rail.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const timestamps = [...document.querySelectorAll('.pane-doing-when')]
          .map(node => node.getBoundingClientRect().left);
        return {
          lineCount: lines.length,
          linesFit: lines.every(line => line.scrollWidth <= line.clientWidth),
          panelFits: panelRect.left >= railRect.left && panelRect.right <= railRect.right &&
            panelRect.bottom <= railRect.bottom,
	          canvasClear: railRect.top >= pane.getBoundingClientRect().bottom - 0.5,
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
	await browser.run(["click", ".workbench-toggle"]);

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
    const canvasRect = canvas.getBoundingClientRect();
    const railRect = rail.getBoundingClientRect();
    const wordmark = document.querySelector('.wordmark');
    const shell = document.querySelector('.shell');
    const actionBar = document.querySelector('.bar-actions');
    if (!wordmark || !shell || !actionBar) return null;
    const shellStyle = getComputedStyle(shell);
    return {
      navAboveCanvas: navRect.bottom < paneRect.top,
      navHeight: navRect.height,
      navWidth: navRect.width,
	      workbenchBelowPane: railRect.top >= paneRect.bottom - 0.5,
      fitsViewport: [navRect, paneRect, barRect, railRect].every(rect =>
        rect.left >= -0.5 && rect.right <= innerWidth + 0.5),
      canvasLargest: paneRect.height > navRect.height && paneRect.height > railRect.height,
      wordmarkVisible: wordmark.getBoundingClientRect().width > 0,
      brandIconCount: document.querySelectorAll('.bar-brand svg, .brand-mark').length,
      headerHeight: barRect.height,
      theme: shell.dataset.theme,
      selection: shellStyle.getPropertyValue('--selection').trim().toLowerCase(),
      status: shellStyle.getPropertyValue('--status').trim().toLowerCase(),
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      actionHeights: actions.map(button => button.getBoundingClientRect().height),
      actionWidths: actions.map(button => button.getBoundingClientRect().width),
      actionsFit: actionBar.scrollWidth <= actionBar.clientWidth
    };
  })()`);
	expect(narrow?.viewportWidth).toBe(420); // approved 420-pixel contract
	expect(narrow?.navAboveCanvas).toBe(true); // check-fixed-point.mjs:2067
	expect(narrow?.navHeight).toBeCloseTo(136, 0); // strip stays inside its reserved workspace row
	expect(narrow?.navWidth).toBeCloseTo(420, 0); // strip never covers or widens the canvas
	expect(narrow?.workbenchBelowPane).toBe(true);
	expect(narrow?.fitsViewport).toBe(true); // check-fixed-point.mjs:2072
	expect(narrow?.canvasLargest).toBe(true); // canvas remains the largest stacked region
	expect(narrow?.wordmarkVisible).toBe(true);
	expect(narrow?.brandIconCount).toBe(0);
	expect(narrow?.headerHeight).toBeCloseTo(104, 0);
	expect(narrow?.selection).toBe("#155eef");
	expect(narrow?.status).toBe("#a3e635");
	expect(narrow?.pageWidth).toBe(narrow?.viewportWidth); // check-fixed-point.mjs:2072
	expect(narrow?.actionHeights.every((height) => height >= 43.5)).toBe(true); // check-fixed-point.mjs:2072
	expect(narrow?.actionWidths.every((width) => width >= 43.5)).toBe(true); // exact touch-target contract
	expect(narrow?.actionsFit).toBe(true); // every action remains visible without an internal scroller

	const otherNarrowTheme = narrow?.theme === "light" ? "dark" : "light";
	const narrowThemeToggled = await browser.eval<boolean>(`(() => {
    const button = document.querySelector('.bar-actions [aria-label="Use ${otherNarrowTheme} theme"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
	expect(narrowThemeToggled).toBe(true);
	const narrowTheme = await pollUntil(
		() =>
			browser.eval<{ theme?: string; width?: number; wordmark?: string }>(`(() => {
        const shell = document.querySelector('.shell');
        const wordmark = document.querySelector('.wordmark');
        if (!shell || !wordmark) return {};
        return {
          theme: shell.dataset.theme,
          width: document.documentElement.scrollWidth,
          wordmark: wordmark.textContent.trim()
        };
      })()`),
		(state) => state.theme === otherNarrowTheme,
		`${otherNarrowTheme} theme to remain usable at 420 pixels`,
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
	expect(narrowTheme.theme).toBe(otherNarrowTheme);
	expect(narrowTheme.width).toBe(420);
	expect(narrowTheme.wordmark).toBe("archboard");
});
