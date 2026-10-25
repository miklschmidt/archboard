// What the renderer asks of the place it runs in.
//
// The renderer is the same code under Bun (the CLI, the rasterizer, the
// Archboard server's render route) and in a browser tab (TASK-247). Five things
// differ between those places, and only five, so they arrive as a host
// installed once before the first picture:
//
//   the renderer core, which paints every picture (ADR 0057): under Bun the
//     build of this checkout's sources, refused when it is stale; in a browser
//     the build the page serves
//   the layout engine: a pool of workers, Bun Workers on the server and Web
//     Workers in the browser, each solving one graph at a time
//   the theme colours a document that stands alone carries: parsed from
//     packages/renderer/assets/theme.css, which Bun reads from disk; a browser draws
//     only pictures for its own page, which take the page's colours, so it
//     has none
//   the diagram fonts as base64, for a document that embeds its faces, which
//     only a host with the files at hand can give
//   the Remix Icon path data a policy's node kinds name: the whole set under
//     Bun, and in a browser only the icons it fetched, so a page does not
//     carry three thousand icons to draw a dozen
//
// Text is measured by the host's canvas, through the global `OffscreenCanvas`
// Pretext itself uses: the browser's own, which measures exactly what that
// browser paints, and one backed by @napi-rs/canvas under Bun. The host makes
// sure that canvas exists and has the diagram faces loaded before measuring.

import type { ElkNode, LayoutOptions } from "@archboard/elk-rs";
import type { DiagramTheme } from "@archboard/board/render-reply";
import type * as CoreBuild from "#shared/protocol/generated/core/archboard_renderer_wasm.js";

/** What the renderer asks of the core. */
type CorePainter = Pick<typeof CoreBuild, "paintDocument" | "paintScene">;

/** Every theme colour by theme and custom property name. */
type ThemeColors = Readonly<Record<DiagramTheme, Readonly<Record<string, string>>>>;

/** The place the renderer runs in. */
interface RendererHost {
	/**
	 * The renderer core, loaded once and ready to paint.
	 * @returns The core.
	 * @throws {Error} When the host has no core to paint with.
	 */
	readonly core: () => CorePainter;
	/**
	 * Solve one graph with the layout engine, for the engine its options name
	 * as their {@link SOLVE_STAGE}. The engine solves a copy
	 * of the graph (a worker receives one), so the caller's graph is never
	 * changed and may share its parts with other graphs.
	 * @param graph The complete measured graph.
	 * @param layoutOptions The options for this solve.
	 * @param signal Calls the solve off: one still waiting for the engine is
	 * never solved, and is refused with the signal's reason; one the engine
	 * holds finishes normally.
	 * @returns Its solved geometry.
	 */
	readonly solve: (
		graph: ElkNode,
		layoutOptions: LayoutOptions,
		signal?: AbortSignal,
	) => Promise<ElkNode>;
	/** The theme colours, where a document that stands alone can be drawn. */
	readonly themeColors?: ThemeColors | undefined;
	/**
	 * One diagram font file as base64, for a document that embeds its faces.
	 * @param file The file's name.
	 * @returns Its bytes, base64 encoded.
	 */
	readonly fontBase64: (file: string) => string;
	/**
	 * One Remix Icon's path data, by export name.
	 * @param name The icon's export name, e.g. `RiServerLine`.
	 * @returns Its paths, or nothing when the host has no such icon.
	 */
	readonly iconPaths: (name: string) => readonly string[] | undefined;
}

/**
 * The option that names which engine a solve places a graph for: `track`
 * (TASK-349) or `blocks` (TASK-351). Either answers every card, frame and
 * label its box and every relationship's polyline. A solve that names neither
 * is refused.
 */
const SOLVE_STAGE = "archboard.stage";

let installed: RendererHost | undefined;

/**
 * Install the host the renderer runs in. The last installation wins, so a
 * test can install a host of its own.
 * @param host The host.
 */
function installRendererHost(host: RendererHost): void {
	installed = host;
}

/**
 * The installed host.
 * @returns The host.
 * @throws {Error} When nothing installed one: the caller imported the renderer core instead of a host's entrypoint.
 */
function rendererHost(): RendererHost {
	if (installed === undefined) {
		throw new Error(
			"No renderer host is installed: import the renderer through @archboard/renderer/bun under Bun, or install a browser host first.",
		);
	}
	return installed;
}

export { installRendererHost, SOLVE_STAGE, rendererHost, type RendererHost, type ThemeColors };
