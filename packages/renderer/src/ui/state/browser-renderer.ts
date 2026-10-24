// The semantic renderer, running in this browser tab (TASK-247).
//
// The same renderer core the CLI and the Archboard server's render route run
// (`shared/rules/render`), with this page as its host: the
// browser's own canvas measures text, in the diagram faces loaded into the
// page; a pool of Web Workers runs the layout engine; the renderer core this
// page serves paints, on the page's own thread. It holds no theme
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
import initCore, * as core from "#shared/protocol/generated/core/archboard_renderer_wasm.js";
import { loadDiagramFaces } from "#ui/state/diagram-faces.ts";
import { loadDiagramIcons, loadedIconPaths } from "#ui/state/diagram-icons.ts";
import {
	createEnginePool,
	workerCeiling,
	type EngineWorker,
} from "#shared/rules/engine/engine-pool.ts";

/** What the page supplies to draw here. */
interface BrowserRendererSetup {
	/** Where the page serves the routing engine's WebAssembly from. */
	readonly avoidWasmUrl: string;
}

/**
 * Start one layout engine worker and tell it where the routing engine is served.
 * @param avoidWasmUrl Where the page serves the routing engine's WebAssembly from.
 * @returns The worker.
 */
function startLayoutWorker(avoidWasmUrl: string): EngineWorker {
	const worker = new Worker(new URL("../workers/layout-worker.ts", import.meta.url), {
		type: "module",
	});
	// oxlint-disable-next-line unicorn/require-post-message-target-origin -- Worker.postMessage has no target origin; this rule applies to windows.
	worker.postMessage({ cmd: "init", wasmUrl: avoidWasmUrl });
	return worker;
}

let started: Promise<void> | undefined;

/** The renderer core, once its glue fetched and started its WebAssembly. */
let loaded: typeof core | undefined;

/**
 * The renderer core, which this page loads before it paints its first picture.
 * @returns The core.
 * @throws {Error} When the page asks for a picture before the core is loaded.
 */
function loadedCore(): typeof core {
	if (loaded === undefined) throw new Error("The renderer core is not loaded yet.");
	return loaded;
}

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

/**
 * Make this page a renderer host. Once per page: later calls keep the first.
 * @param setup Where the routing engine is served from.
 */
function startBrowserRenderer(setup: BrowserRendererSetup): void {
	if (started !== undefined) return;
	const solve = createEnginePool(
		() => startLayoutWorker(setup.avoidWasmUrl),
		workerCeiling(navigator.hardwareConcurrency),
	);
	// The core's glue fetches its WebAssembly beside it, as the build serves it,
	// and is ready before the first picture is painted.
	const painter = initCore().then(() => (loaded = core));
	installRendererHost({
		core: loadedCore,
		solve,
		fontBase64: noEmbeddedFaces,
		iconPaths: loadedIconPaths,
	});
	started = Promise.all([loadDiagramFaces(), painter]).then(() => undefined);
	// Start one engine now, while the page boots and reads the board, rather
	// than when the first picture needs it: a worker's first solve initializes
	// both engines, and a trivial graph pays that cost here.
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

export { drawBoardHere, startBrowserRenderer, type BrowserRendererSetup };
