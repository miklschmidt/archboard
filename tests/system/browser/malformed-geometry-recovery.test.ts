import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	PANE_LAYOUT_TIMEOUT_MS,
	PANE_SETTLE_CAP_MS,
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";
import { renderBoardNote } from "../../../src/runtime/engine/board.ts";
import { expandElements } from "../../../src/runtime/engine/expand-elements.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { legacyTextInput } from "./fixtures/fixed-point-scene.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
} from "./support/agent-browser.ts";
import { inExcalidrawApp } from "./support/page-scene.ts";

type Pane = {
	board?: string;
	elementCount?: number;
	viewport?: Record<string, unknown>;
};
type PanesBody = { paneCount?: number; panes?: Array<Pane & { clientId?: string }> };
type FailureState = {
	text?: string | null;
	elementIds?: string[];
	finiteZoom?: boolean;
	hasNaNZoom?: boolean;
};
type CorrectedState = {
	board?: string;
	rendered?: boolean;
	zoom?: number | null;
	hasNaNZoom?: boolean;
};

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const serverPath = path.join(repoRoot, "src/server.ts");
const finite = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value);

function makeLegacyNotes(): {
	malformed: string;
	malformedScene: Parameters<typeof renderBoardNote>[0];
	valid: string;
} {
	const elements = expandElements(
		[structuredClone(legacyTextInput) as unknown as Parameters<typeof expandElements>[0][number]],
		{ deterministic: true },
	);
	const scene: Parameters<typeof renderBoardNote>[0] = {
		type: "excalidraw",
		version: 2,
		source: "archboard",
		elements,
		appState: { gridSize: 20, viewBackgroundColor: "#ffffff" },
		files: {},
	};
	const identity = { board: "legacy-geometry", variant: "current" };
	const valid = renderBoardNote(scene, null, identity);
	const malformedElements = structuredClone(elements) as unknown as Array<Record<string, unknown>>;
	delete malformedElements[0]!.width;
	delete malformedElements[0]!.height;
	const malformedScene = { ...scene, elements: malformedElements };
	return { malformed: renderBoardNote(malformedScene, null, identity), malformedScene, valid };
}

test(
	"malformed persisted geometry is refused visibly and recovers after correction",
	async () => {
		await using resources = new AsyncDisposableStack();
		const { ownerRoot } = browserTestRoots();
		const vault = path.join(ownerRoot, "vault");
		const stateDirectory = path.join(vault, ".archboard");
		fs.mkdirSync(stateDirectory, { recursive: true });

		const legacy = makeLegacyNotes();
		const legacyFile = path.join(vault, "legacy-geometry.excalidraw.md");
		fs.writeFileSync(legacyFile, legacy.malformed);
		const scratchFile = path.join(stateDirectory, "scratch.excalidraw.md");
		const scratchIdentity = { board: "scratch", variant: "current" };
		const scratchMalformed = renderBoardNote(legacy.malformedScene, null, scratchIdentity);
		const scratchValid = renderBoardNote(
			{
				type: "excalidraw",
				version: 2,
				source: "archboard",
				elements: [],
				appState: {},
				files: {},
			},
			null,
			scratchIdentity,
		);
		fs.writeFileSync(scratchFile, scratchMalformed);

		const canvas = await startOwnedCanvas({ serverPath, vault, env: canvasTestEnvironment() });
		resources.defer(() => canvas.dispose());
		registerCanvasBase(canvas.base);
		expect((await fetch(`${canvas.base}/health`)).ok).toBe(true); // check-fixed-point.mjs:644
		const browser = resources.use(await createAgentBrowser());
		const api = createJsonRequester(canvas);
		await browser.run(["open", canvas.base]);
		expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/i);

		const panes = await pollUntil(
			() => api<PanesBody>("/api/panes").then((response) => response.body),
			(state) => (state.paneCount ?? 0) >= 1,
			"the malformed scratch pane to register",
			{ timeoutMs: PANE_LAYOUT_TIMEOUT_MS },
		);
		expect(panes.paneCount).toBe(1);
		const scratchFailure = await pollUntil(
			() =>
				browser.eval<FailureState>(
					inExcalidrawApp(`
            const alert = document.querySelector('[role="alert"]');
            return {
              text: alert?.textContent ?? null,
              elementIds: app.scene.getElementsIncludingDeleted().map(element => element.id),
              finiteZoom: Number.isFinite(app.state.zoom?.value),
              hasNaNZoom: document.body.innerText.includes('%NaN%')
            };
          `),
				),
			(state) => state.text?.includes("helv (text): width, height") === true,
			"the malformed scratch error to appear",
			{ timeoutMs: PANE_LAYOUT_TIMEOUT_MS },
		);
		expect(scratchFailure.text).toContain("helv (text): width, height"); // check-fixed-point.mjs:1026
		expect(scratchFailure.elementIds).not.toContain("helv"); // check-fixed-point.mjs:1031
		expect(scratchFailure.finiteZoom).toBe(true); // check-fixed-point.mjs:1031
		expect(scratchFailure.hasNaNZoom).toBe(false); // check-fixed-point.mjs:1031
		expect(fs.readFileSync(scratchFile, "utf8")).toBe(scratchMalformed); // check-fixed-point.mjs:1038

		fs.writeFileSync(scratchFile, scratchValid);
		const recoveredScratch = await api<{ error?: string }>("/api/boards/open", {
			method: "POST",
			body: { board: "scratch", reload: true, pane: panes.panes?.[0]?.clientId },
		});
		expect(recoveredScratch.status).toBe(200); // check-fixed-point.mjs:1053
		await browser.eval(`(() => {
      document.querySelector('.notice-dismiss')?.click();
      return true;
    })()`);

		const legacyRowReady = await pollUntil(
			() =>
				browser.eval<boolean>(
					`Boolean(document.querySelector('.board-group[aria-label="legacy-geometry"] .board-nav-row'))`,
				),
			Boolean,
			"the legacy board row to appear",
			{ timeoutMs: PANE_LAYOUT_TIMEOUT_MS },
		);
		expect(legacyRowReady).toBe(true); // check-fixed-point.mjs:1101
		const legacyOpenStarted = await browser.eval<boolean>(`(() => {
      const row = document.querySelector('.board-group[aria-label="legacy-geometry"] .board-nav-row');
      if (!row) return false;
      row.click();
      return true;
    })()`);
		expect(legacyOpenStarted).toBe(true); // check-fixed-point.mjs:1101
		const legacyFailure = await pollUntil(
			() =>
				browser.eval<FailureState>(
					inExcalidrawApp(`
            const alert = document.querySelector('[role="alert"]');
            return {
              text: alert?.textContent ?? null,
              finiteZoom: Number.isFinite(app.state.zoom?.value),
              hasNaNZoom: document.body.innerText.includes('%NaN%')
            };
          `),
				),
			(state) => state.text?.includes("helv (text): width, height") === true,
			"the malformed legacy-board error to appear",
			{ timeoutMs: PANE_LAYOUT_TIMEOUT_MS },
		);
		expect(legacyFailure.text).toContain("helv (text): width, height"); // check-fixed-point.mjs:1101
		expect(legacyFailure.finiteZoom).toBe(true); // check-fixed-point.mjs:1108
		expect(legacyFailure.hasNaNZoom).toBe(false); // check-fixed-point.mjs:1108
		expect(fs.readFileSync(legacyFile, "utf8")).toBe(legacy.malformed); // check-fixed-point.mjs:1113

		fs.writeFileSync(legacyFile, legacy.valid);
		const correctedOpenStarted = await browser.eval<boolean>(`(() => {
      const row = document.querySelector('.board-group[aria-label="legacy-geometry"] .board-nav-row');
      if (!row) return false;
      row.click();
      return true;
    })()`);
		expect(correctedOpenStarted).toBe(true); // check-fixed-point.mjs:1157
		const corrected = await pollUntil(
			() =>
				browser.eval<CorrectedState>(
					inExcalidrawApp(`
            const board = document.querySelector('.board-name')?.textContent.trim();
            return {
              board,
              rendered: app.scene.getElementsIncludingDeleted()
                .some(element => element.id === 'helv' && !element.isDeleted),
              zoom: app.state.zoom?.value ?? null,
              hasNaNZoom: document.body.innerText.includes('%NaN%')
            };
          `),
				),
			(state) => state.board === "legacy-geometry" && state.rendered === true,
			"the corrected legacy board to render",
			{ timeoutMs: PANE_LAYOUT_TIMEOUT_MS },
		);
		expect(corrected.board).toBe("legacy-geometry"); // check-fixed-point.mjs:1157
		expect(corrected.rendered).toBe(true); // check-fixed-point.mjs:1157

		const correctedPanes = await pollUntil(
			() => api<PanesBody>("/api/panes").then((response) => response.body),
			(state) => state.panes?.[0]?.board === "legacy-geometry" && state.panes[0].elementCount === 1,
			"the corrected legacy pane telemetry to settle",
			{ timeoutMs: PANE_SETTLE_CAP_MS },
		);
		const correctedPane = correctedPanes.panes?.[0];
		expect(finite(corrected.zoom)).toBe(true); // check-fixed-point.mjs:1164
		expect(corrected.hasNaNZoom).toBe(false); // check-fixed-point.mjs:1164
		expect(correctedPane?.board).toBe("legacy-geometry"); // check-fixed-point.mjs:1164
		expect(correctedPane?.elementCount).toBe(1); // check-fixed-point.mjs:1164
		expect(Object.values(correctedPane?.viewport ?? {}).every(finite)).toBe(true); // check-fixed-point.mjs:1164
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
);
