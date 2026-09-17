// The semantic renderer, running in this browser tab (TASK-247).
//
// The same renderer core the CLI and the canvas server's render route run
// (`@/transformers/semantic-renderer`), with this page as its host: the
// browser's own canvas measures text, in the diagram faces loaded into the
// page; a pool of Web Workers runs the layout engine; the theme colours are the
// ones the build read out of the shared stylesheet. What is drawn comes from the
// board the page read from the server and holds as a read-only cache (ADR 0023),
// so the picture is the server's picture of that board, measured the way this
// browser paints it.

import type { SemanticBoard } from "@/shared/semantic-board/index";
import type { SemanticPolicy } from "@/shared/semantic-policy/index";
import {
	renderBoard,
	type BoardRenderChoices,
	type BoardRenderOutcome,
} from "@/transformers/semantic-renderer/board";
import {
	installRendererHost,
	type RendererHost,
	type ThemeColors,
} from "@/transformers/semantic-renderer/host";
import { loadDiagramFaces } from "@/ui/browser-renderer/lib/diagram-faces";
import { loadDiagramIcons, loadedIconPaths } from "@/ui/browser-renderer/lib/diagram-icons";
import {
	createEnginePool,
	workerCeiling,
	type EngineWorker,
} from "@/ui/browser-renderer/lib/engine-pool";

/** What the page supplies to draw here. */
interface BrowserRendererSetup {
	/** The theme colours, as the build read them. */
	readonly themeColors: ThemeColors;
	/** Starts one layout engine worker. */
	readonly startWorker: () => EngineWorker;
}

let started: Promise<void> | undefined;

/** Two boxes and an edge: the least a layout can be, to start an engine on. */
const WARM_UP_GRAPH: Parameters<RendererHost["solve"]>[0] = {
	id: "warm-up",
	layoutOptions: { "elk.algorithm": "layered" },
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
		"A picture drawn in the browser links its faces; ask the canvas server for an embedded one.",
	);
}

/**
 * Make this page a renderer host. Once per page: later calls keep the first.
 * @param setup The theme colours and the engine worker.
 */
function startBrowserRenderer(setup: BrowserRendererSetup): void {
	if (started !== undefined) return;
	const solve = createEnginePool(setup.startWorker, workerCeiling(navigator.hardwareConcurrency));
	installRendererHost({
		solve,
		themeColors: setup.themeColors,
		fontBase64: noEmbeddedFaces,
		iconPaths: loadedIconPaths,
	});
	started = loadDiagramFaces();
	// Start one engine now, while the page boots and reads the board, rather
	// than when the first picture needs it: a worker's first solve pays for
	// fetching and compiling the engine, and a trivial graph pays it here.
	void solve(WARM_UP_GRAPH, {}).catch(() => undefined);
}

/**
 * Draw one variant of a board in this page, once its faces have loaded.
 * @param board The board, as the page read it.
 * @param choices The variant, view and theme; the faces are always linked.
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

// The pool is exported for its own contract test; the page starts it through startBrowserRenderer.
export { createEnginePool, workerCeiling, type EngineWorker };
export { drawBoardHere, startBrowserRenderer, type BrowserRendererSetup };
