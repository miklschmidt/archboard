import { declareTestWallClockBudget } from "../repository-policy/support/test-wall-clock.ts";
import { editingModifier } from "./support/keyboard.ts";
// Accepted agent work is the starting point for a person's next undoable move.
import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { extractSceneJsonFromObsidianMd } from "../../../src/runtime/engine/obsidian-md.ts";
import { hydrateElementTracking } from "../../../src/runtime/engine/metadata.ts";
import type { AgentElementInput } from "../../../src/runtime/engine/apply-element-input.ts";
import type { ServerElement } from "../../../src/runtime/engine/types.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { TEST_HUMAN_UNDO_CASE_TIMEOUT_MS } from "../support/timing.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
} from "./support/agent-browser.ts";
import { dragPageElement, inExcalidrawApp, snapshotOf } from "./support/page-scene.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const BOARD = "undo";
type Document = { elements: ServerElement[] };

for (const operation of ["creation", "modification"] as const) {
	test(
		`human move undo and redo preserve agent ${operation} in the canvas and note`,
		async () => {
			if (process.platform === "darwin") {
				declareTestWallClockBudget({
					test: `human move undo and redo preserve agent ${operation} in the canvas and note`,
					reason:
						"Two real pointer drags, undo and redo must agree with the persisted note; macOS Chromium input acknowledgements add about 20 seconds.",
					outerBoundMs: TEST_HUMAN_UNDO_CASE_TIMEOUT_MS,
					task: "TASK-163",
					evidence:
						"Chrome for Testing on macOS completed all 30 creation assertions in 30.76 seconds; each of four mouse-move acknowledgements took about 5.04 seconds.",
				});
			}

			await using resources = new AsyncDisposableStack();
			const root = mkdtempSync(join(browserTestRoots().ownerRoot, "undo-"));
			resources.defer(() => rmSync(root, { recursive: true, force: true }));
			const canvas = await startOwnedCanvas({
				serverPath: join(repoRoot, "src/server.ts"),
				vault: join(root, "vault"),
				env: canvasTestEnvironment({ LOG_FILE_PATH: join(root, "canvas.log") }),
			});
			resources.defer(() => canvas.dispose());
			registerCanvasBase(canvas.base);
			const request = createJsonRequester(canvas);
			const write = async (upserts: AgentElementInput[]): Promise<void> => {
				expect(
					(
						await request(`/api/elements/changes?board=${BOARD}`, {
							method: "POST",
							body: { origin: "agent", upserts },
							doing: `checking undo after agent ${operation}`,
						})
					).status,
				).toBe(200);
			};
			expect(
				(
					await request("/api/boards/new", {
						method: "POST",
						body: { board: BOARD, level: "service" },
					})
				).status,
			).toBe(200);
			await write([
				{
					id: "box",
					type: "rectangle",
					x: 200,
					y: 200,
					width: 160,
					height: 100,
					backgroundColor: "#a5d8ff",
					fillStyle: "solid",
				},
			]);
			const info = await request<{ file: string }>(`/api/boards/info?board=${BOARD}`);
			expect(info.status).toBe(200);
			const persisted = (): ServerElement[] =>
				(
					JSON.parse(
						extractSceneJsonFromObsidianMd(readFileSync(info.body.file, "utf8")),
					) as Document
				).elements.map(hydrateElementTracking);

			const browser = resources.use(await createAgentBrowser());
			await browser.run(["open", canvas.base]);
			await browser.run(["set", "viewport", "1920", "1080"]);
			expect(await browser.eval<string>("navigator.userAgent")).toMatch(/Headless/i);
			await pollUntil(
				async () => (await request<{ paneCount: number }>("/api/panes")).body.paneCount,
				(count) => count === 1,
				"the undo browser to register its pane",
			);
			expect(
				(
					await request("/api/boards/open", {
						method: "POST",
						body: { board: BOARD, reload: true },
					})
				).status,
			).toBe(200);
			const scene = (): Promise<ServerElement[]> =>
				browser.eval(
					inExcalidrawApp(
						"return app.scene.getElementsIncludingDeleted().filter(element => !element.isDeleted);",
					),
				);
			const agreement = async (expected: ServerElement[]): Promise<void> => {
				const wanted = snapshotOf(expected);
				await pollUntil(
					async () => ({ pane: snapshotOf(await scene()), note: snapshotOf(persisted()) }),
					(value) =>
						JSON.stringify(value.pane) === JSON.stringify(wanted) &&
						JSON.stringify(value.note) === JSON.stringify(wanted),
					"the canvas and persisted note to hold the expected document",
				);
				expect(snapshotOf(await scene())).toEqual(wanted);
				expect(snapshotOf(persisted())).toEqual(wanted);
			};
			await agreement(persisted());

			const moveUndoRedo = async (id: string): Promise<void> => {
				const before = await scene();
				const target = before.find((element) => element.id === id)!;
				expect(Number.isFinite(target.version)).toBe(true);
				await browser.run(["press", "Escape"]);
				await dragPageElement(browser, id, 60, 30);
				const moved = await scene();
				expect(moved.find((element) => element.id === id)?.x).not.toBe(target.x);
				expect(moved.find((element) => element.id === id)!.version).toBeGreaterThan(target.version);
				await agreement(moved);
				await browser.run(["press", `${editingModifier}+z`]);
				// Read the whole document: unchanged properties and unrelated elements
				// must survive, including when the box was just created by the agent.
				expect(snapshotOf(await scene())).toEqual(snapshotOf(before));
				await agreement(before);
				await browser.run(["press", `${editingModifier}+Shift+z`]);
				await agreement(moved);
			};

			// Keep ordinary human undo/redo, and establish history before the agent
			// edits an existing box (the reported mixed human/agent workflow).
			await moveUndoRedo("box");
			const id = operation === "creation" ? "agentbox" : "box";
			await write([
				{
					id,
					type: "rectangle",
					x: 500,
					y: 300,
					width: 210,
					height: 120,
					backgroundColor: "#ffc9c9",
					strokeColor: "#c92a2a",
					fillStyle: "solid",
				},
			]);
			await agreement(persisted());
			await moveUndoRedo(id);
		},
		TEST_HUMAN_UNDO_CASE_TIMEOUT_MS,
	);
}
