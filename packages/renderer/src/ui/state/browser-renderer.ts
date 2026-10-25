// The semantic renderer, running in this browser tab (TASK-247).
//
// The same renderer core the CLI and the Archboard server's render route run
// (`shared/rules/render`), with this page as its host: the
// browser's own canvas measures text, in the diagram faces loaded into the
// page; a pool of Web Workers runs the layout engine. It holds no theme
// colours: a picture drawn here paints with the page's own colour tokens, so it
// takes whichever theme the page is in (TASK-346). What is drawn comes from the
// board the page read from the server and holds as a read-only cache (ADR 0023),
// so the picture is the server's picture of that board, measured the way this
// browser paints it.

import { DEFAULT_LAYOUT_ENGINE } from "@archboard/board/render-reply";
import type { SemanticBoard } from "@archboard/board/document";
import type { SemanticPolicy } from "@archboard/board/policy";
import {
	renderBoard,
	type BoardRenderChoices,
	type BoardRenderOutcome,
} from "#shared/rules/render/board.ts";
import { installRendererHost, SOLVE_STAGE, type RendererHost } from "#shared/rules/render/host.ts";
import { loadDiagramFaces } from "#ui/state/diagram-faces.ts";
import { loadDiagramIcons, loadedIconPaths } from "#ui/state/diagram-icons.ts";
import {
	createEnginePool,
	workerCeiling,
	type EngineWorker,
} from "#shared/rules/engine/engine-pool.ts";

/**
 * Start one layout engine worker.
 * @returns The worker.
 */
function startLayoutWorker(): EngineWorker {
	return new Worker(new URL("../workers/layout-worker.ts", import.meta.url), { type: "module" });
}

let started: Promise<void> | undefined;

/** Two boxes and an edge: the least a layout can be, to start an engine on. */
const WARM_UP_GRAPH: Parameters<RendererHost["solve"]>[0] = {
	id: "warm-up",
	children: [
		{ id: "a", width: 10, height: 10 },
		{ id: "b", width: 10, height: 10 },
	],
	edges: [{ id: "a-b", sources: ["a"], targets: ["b"] }],
};

/**
 * The embedded font bytes, which a page never has at hand synchronously and
 * never needs: a pane links its faces.
 * @throws {Error} Always.
 */
function noEmbeddedFaces(): never {
	throw new Error(
		"A picture drawn in the browser links its faces; ask the Archboard server for an embedded one.",
	);
}

/** Make this page a renderer host. Once per page: later calls keep the first. */
function startBrowserRenderer(): void {
	if (started !== undefined) return;
	const solve = createEnginePool(startLayoutWorker, workerCeiling(navigator.hardwareConcurrency));
	installRendererHost({
		solve,
		fontBase64: noEmbeddedFaces,
		iconPaths: loadedIconPaths,
	});
	started = loadDiagramFaces();
	// Start one engine now, while the page boots and reads the board, rather
	// than when the first picture needs it: a worker's first solve initializes
	// its engines, and a trivial graph pays that cost here.
	void solve(WARM_UP_GRAPH, { [SOLVE_STAGE]: DEFAULT_LAYOUT_ENGINE }).catch(() => undefined);
}

/**
 * Draw one variant of a board in this page, once its faces have loaded.
 * @param board The board, as the page read it.
 * @param choices The variant and view; the faces are always linked, and the picture takes the page's theme.
 * @param policy The vault's presentation policy, as the page read it.
 * @returns The same answer the render route would give for this board.
 * @throws {Error} When this page never started the renderer.
 */
async function drawBoardHere(
	board: SemanticBoard,
	choices: Omit<BoardRenderChoices, "fonts">,
	policy: SemanticPolicy,
): Promise<BoardRenderOutcome> {
	if (started === undefined) {
		throw new Error("startBrowserRenderer was not called before drawing a board.");
	}
	await Promise.all([started, loadDiagramIcons(policy)]);
	return renderBoard(board, { ...choices, fonts: "linked" }, policy);
}

export { drawBoardHere, startBrowserRenderer };
