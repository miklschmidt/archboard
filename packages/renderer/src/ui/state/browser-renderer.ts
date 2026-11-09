// The semantic renderer, running in this browser tab (TASK-247).
//
// The same renderer core the CLI and the Archboard server's render route run
// (`shared/render`), with this page as its host: the page fetches and
// compiles the core it serves and draws every picture with it on its own
// thread, and a pool of Web Workers, each handed that compiled core, runs the
// layout's solves. The core shapes every word itself, so a word is the same
// width here as on the server (ADR 0059). It holds no theme colours: a
// picture drawn here paints with the page's own colour tokens, so it takes
// whichever theme the page is in (TASK-346). What is drawn comes from the
// document the page read from the server and holds as a read-only cache (ADR 0023),
// so the picture is the server's picture of that document.

import type { LegacyBoard } from "@archboard/model/legacy-board";
import type { SemanticPolicy } from "@archboard/model/policy";
import { renderSemanticView } from "#shared/render/rules/diagram.ts";
import { scopedRequest } from "#shared/render/rules/drawing-key.ts";
import type {
	SemanticViewRenderRequest,
	RenderedDiagram,
} from "#shared/protocol/render-request.ts";
import {
	renderLegacyBoard,
	type LegacyRenderChoices,
	type LegacyRenderOutcome,
} from "#shared/render/rules/legacy-board.ts";
import { installRendererHost } from "#shared/render/rules/host.ts";
import { loadBrowserCore, type BrowserCore } from "#ui/clients/core.ts";
import { warmPainter } from "#ui/clients/painter.ts";
import { loadDiagramIcons, loadedIconPaths, readIconsFrom } from "#ui/state/diagram-icons.ts";
import {
	createEnginePool,
	workerCeiling,
	type EngineWorker,
} from "#shared/engine/rules/engine-pool.ts";

let started: Promise<void> | undefined;

/** The renderer core and its compiled module, once the page loaded them. */
let loaded: BrowserCore | undefined;

/**
 * The renderer core, which this page loads before it paints its first picture
 * or starts a layout worker.
 * @returns The core and its compiled module.
 * @throws {Error} When the page asks for either before the core is loaded.
 */
function loadedCore(): BrowserCore {
	if (loaded === undefined) throw new Error("The renderer core is not loaded yet.");
	return loaded;
}

/**
 * The renderer core that paints this page's pictures.
 * @returns The core.
 * @throws {Error} When the page asks for a picture before the core is loaded.
 */
function paintingCore(): BrowserCore["core"] {
	return loadedCore().core;
}

/**
 * Start one layout engine worker, handed the core this page compiled.
 * @returns The worker.
 * @throws {Error} When the core is not loaded yet.
 */
function startLayoutWorker(): EngineWorker {
	const { module } = loadedCore();
	const worker = new Worker(new URL("../workers/layout-worker.ts", import.meta.url), {
		type: "module",
	});
	// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage has no target origin
	worker.postMessage({ core: module });
	return worker;
}

/** Two boxes and an edge: the least a layout can be, to start an engine on. */
const WARM_UP_GRAPH = JSON.stringify({
	id: "warm-up",
	children: [
		{ id: "a", width: 10, height: 10 },
		{ id: "b", width: 10, height: 10 },
	],
	edges: [{ id: "a-b", sources: ["a"], targets: ["b"] }],
});

/**
 * Make this page a renderer host. Once per page: later calls keep the first host.
 * @param options What the page brings with it.
 * @param options.icons The path data of each icon its pictures name, by name, when the page carries
 * them, as a model snapshot does. The page then fetches no icon, and an icon the set lacks is missing.
 */
function startBrowserRenderer(
	options: { readonly icons?: Readonly<Record<string, readonly string[]>> } = {},
): void {
	if (options.icons !== undefined) readIconsFrom(options.icons);
	// A browser takes up to a second to compile the GPU's pipelines, so the page's painter
	// starts as the page starts, ahead of its first picture.
	warmPainter();
	if (started !== undefined) return;
	const solve = createEnginePool(startLayoutWorker, workerCeiling(navigator.hardwareConcurrency));
	installRendererHost({
		core: paintingCore,
		solve,
		iconPaths: loadedIconPaths,
	});
	// The core is ready before the first picture is painted, and before the
	// first worker starts. A picture waits for it (`drawLegacyBoardHere`), so no solve
	// is asked for before it.
	const core = loadBrowserCore().then((ready) => (loaded = ready));
	started = core.then(() => undefined);
	// Start one engine as soon as the core is ready, while the page boots and
	// reads the document, rather than when the first picture needs it: a worker's
	// first solve instantiates its core, and a trivial graph pays that cost here.
	void core.then(() => solve(WARM_UP_GRAPH)).catch(() => undefined);
}

/**
 * Draw one variant of a document in this page, once the core has loaded.
 * @param document The document, as the page read it.
 * @param choices The variant and view; the picture takes the page's theme.
 * @param policy The vault's presentation policy, as the page read it.
 * @returns The same answer the render route would give for this document.
 * @throws {Error} When this page never started the renderer.
 */
async function drawLegacyBoardHere(
	document: LegacyBoard,
	choices: LegacyRenderChoices,
	policy: SemanticPolicy,
): Promise<LegacyRenderOutcome> {
	if (started === undefined) {
		throw new Error("startBrowserRenderer was not called before drawing a document.");
	}
	await Promise.all([started, loadDiagramIcons(policy)]);
	return renderLegacyBoard(document, choices, policy);
}

/**
 * Prepare a scoped drawing.
 * @param scoped The visible content, complete model, and presentation policy.
 * @returns Its local rendering operation.
 */
function prepareContentHere(scoped: Omit<SemanticViewRenderRequest, "theme">) {
	const request = scopedRequest(scoped);
	return {
		/**
		 * Render only after the renderer core and the icons are available.
		 * @returns The picture and its interaction geometry.
		 * @throws {Error} When the browser renderer is not started or rendering fails.
		 */
		draw: async (): Promise<RenderedDiagram> => {
			if (started === undefined)
				throw new Error("Start the browser renderer before drawing content.");
			await Promise.all([started, loadDiagramIcons(request.policy)]);
			return renderSemanticView(request);
		},
	};
}

export { drawLegacyBoardHere, prepareContentHere, startBrowserRenderer };
