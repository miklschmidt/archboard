import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	PANE_DEBOUNCE_MS,
	PANE_LAYOUT_TIMEOUT_MS,
	PANE_SETTLE_CAP_MS,
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
	TEST_PANE_DEBOUNCE_MARGIN_MS,
} from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { fixedPointElements, humanArrowInput } from "./fixtures/fixed-point-scene.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
} from "./support/agent-browser.ts";
import { inExcalidrawApp } from "./support/page-scene.ts";

type Rect = { x: number; y: number; width: number; height: number };
type Viewport = Rect & { zoom: number };
type Pane = {
	at?: string;
	board?: string;
	elementCount?: number;
	rect?: Rect;
	viewport?: Viewport;
};
type PanesBody = { panes?: Pane[] };
type Telemetry = { rect: Rect; viewport: Viewport };

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const serverPath = path.join(repoRoot, "src/server.ts");
const sleep = (milliseconds: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

function roundedGeometry(value: Partial<Telemetry> | null | undefined): Telemetry {
	return {
		rect: {
			x: Math.round(value?.rect?.x ?? Number.NaN),
			y: Math.round(value?.rect?.y ?? Number.NaN),
			width: Math.round(value?.rect?.width ?? Number.NaN),
			height: Math.round(value?.rect?.height ?? Number.NaN),
		},
		viewport: {
			x: Math.round(value?.viewport?.x ?? Number.NaN),
			y: Math.round(value?.viewport?.y ?? Number.NaN),
			width: Math.round(value?.viewport?.width ?? Number.NaN),
			height: Math.round(value?.viewport?.height ?? Number.NaN),
			zoom: Math.round(value?.viewport?.zoom ?? Number.NaN),
		},
	};
}

test(
	"non-finite pane telemetry is suppressed and the same finite publication can recover",
	async () => {
		await using resources = new AsyncDisposableStack();
		const { ownerRoot } = browserTestRoots();
		const vault = path.join(ownerRoot, "vault");
		fs.mkdirSync(vault, { recursive: true });
		const canvas = await startOwnedCanvas({ serverPath, vault, env: canvasTestEnvironment() });
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
		await api("/api/elements/changes?board=fixedpoint", {
			method: "POST",
			body: {
				upserts: [humanArrowInput],
				deletes: [],
				clientId: "fixed-point-person",
			},
		});
		await api("/api/elements/human-node?board=fixedpoint", {
			method: "PUT",
			body: { x: 1000, y: 1000 },
		});
		await api("/api/bridges?board=fixedpoint", {
			method: "POST",
			body: { over: "line1", under: "bridge-under", background: "#ffffff" },
		});

		await browser.run(["open", canvas.base]);
		expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/i);
		await pollUntil(
			() => api<PanesBody>("/api/panes").then((response) => response.body),
			(state) => Boolean(state.panes?.[0]),
			"the browser pane to register",
			{ timeoutMs: PANE_LAYOUT_TIMEOUT_MS },
		);
		await api("/api/boards/open", {
			method: "POST",
			body: { board: "fixedpoint", reload: true },
		});
		const published = await pollUntil(
			() => api<PanesBody>("/api/panes").then((response) => response.body.panes?.[0] ?? null),
			(pane) => pane?.board === "fixedpoint" && pane.elementCount === 18,
			"the fixed-point pane telemetry to settle",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		const expected = roundedGeometry(published);

		const installed = await browser.eval<boolean>(
			inExcalidrawApp(`
        const pane = document.querySelector('.pane-canvas');
        const expected = ${JSON.stringify(published)};
        if (!pane || !expected?.rect || !expected?.viewport) return false;
        const nativeFetch = window.fetch.bind(window);
        window.__task117PanePosts = [];
        window.fetch = (...args) => {
          const [input, init] = args;
          const url = typeof input === 'string' ? input : input?.url ?? '';
          if (url.includes('/api/panes') && init?.method === 'POST') {
            window.__task117PanePosts.push(init.body);
          }
          return nativeFetch(...args);
        };
        window.__task117PaneRect = pane.getBoundingClientRect.bind(pane);
        window.__task117PaneExpected = expected;
        window.__task117Excalidraw = app;
        pane.getBoundingClientRect = () => ({
          ...window.__task117PaneRect(),
          left: expected.rect.x,
          top: expected.rect.y,
          width: Infinity,
          height: expected.rect.height
        });
        app.updateScene({ appState: {
          scrollX: -expected.viewport.x + 1,
          scrollY: -expected.viewport.y,
          zoom: { value: expected.viewport.zoom }
        }});
        return true;
      `),
		);
		expect(installed).toBe(true); // check-fixed-point.mjs:1254

		await sleep(PANE_DEBOUNCE_MS + TEST_PANE_DEBOUNCE_MARGIN_MS);
		const suppressed = await browser.eval<unknown[]>("window.__task117PanePosts ?? []");
		expect(suppressed).toHaveLength(0); // check-fixed-point.mjs:1254

		const restored = await browser.eval<boolean>(`(() => {
      const pane = document.querySelector('.pane-canvas');
      const expected = window.__task117PaneExpected;
      const app = window.__task117Excalidraw;
      if (!pane || !app || !expected) return false;
      pane.getBoundingClientRect = () => ({
        ...window.__task117PaneRect(),
        left: expected.rect.x,
        top: expected.rect.y,
        width: expected.rect.width,
        height: expected.rect.height
      });
      window.__task117PanePosts = [];
      app.updateScene({ appState: {
        scrollX: -expected.viewport.x,
        scrollY: -expected.viewport.y,
        zoom: { value: expected.viewport.zoom }
      }});
      return true;
    })()`);
		expect(restored).toBe(true); // check-fixed-point.mjs:1303
		const recovered = await pollUntil(
			() =>
				browser.eval<Telemetry | null>(`(() => {
          const bodies = (window.__task117PanePosts ?? []).map(body => JSON.parse(body));
          return bodies.at(-1) ?? null;
        })()`),
			(value) => value !== null,
			"the corrected finite telemetry to post",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		expect(recovered).not.toBeNull(); // invalid publication key was cleared
		const recoveredValues = recovered
			? [...Object.values(recovered.rect), ...Object.values(recovered.viewport)]
			: [];
		expect(recoveredValues.every((value) => Number.isFinite(value))).toBe(true); // check-fixed-point.mjs:1303
		expect(roundedGeometry(recovered)).toEqual(expected); // check-fixed-point.mjs:1303

		const recoveredOnServer = await pollUntil(
			() => api<PanesBody>("/api/panes").then((response) => response.body.panes?.[0] ?? null),
			(pane) => pane?.at !== published?.at && roundedGeometry(pane).rect.x === expected.rect.x,
			"the server to receive the corrected telemetry",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		expect(recoveredOnServer?.at).not.toBe(published?.at); // check-fixed-point.mjs:1303
		expect(roundedGeometry(recoveredOnServer)).toEqual(expected); // check-fixed-point.mjs:1303
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
);
