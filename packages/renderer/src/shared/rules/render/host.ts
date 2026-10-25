// What the renderer asks of the place it runs in.
//
// The renderer is the same core under Bun (the CLI, the rasterizer, the
// Archboard server's render route) and in a browser tab (TASK-247). The core
// draws every picture (ADR 0057); four things differ between those places,
// and only four, so they arrive as a host installed once before the first
// picture:
//
//   the renderer core: under Bun the build of this checkout's sources,
//     refused when it is stale; in a browser the build the page serves
//   the layout engine: a pool of workers, Bun Workers on the server and Web
//     Workers in the browser, each solving one graph at a time
//   the theme colours a document that stands alone carries: parsed from
//     packages/renderer/assets/theme.css, which Bun reads from disk; a browser draws
//     only pictures for its own page, which take the page's colours, so it
//     has none
//   the Remix Icon path data a policy's node kinds name: the whole set under
//     Bun, and in a browser only the icons it fetched, so a page does not
//     carry three thousand icons to draw a dozen

import type * as CoreBuild from "#shared/protocol/generated/core/archboard_renderer_wasm.js";
import type { ThemeColors } from "#shared/protocol/generated/core/types.ts";

/** What the renderer asks of the core where it runs: a render. */
type CoreRenderer = Pick<typeof CoreBuild, "render">;

/** The place the renderer runs in. */
interface RendererHost {
	/**
	 * The renderer core, loaded once and ready to draw.
	 * @returns The core.
	 * @throws {Error} When the host has no core to draw with.
	 */
	readonly core: () => CoreRenderer;
	/**
	 * Solve one graph with the layout engine, laid out the way its root
	 * options name, as the core's `layOutBoard` answers it.
	 * @param graph The complete measured graph, as the core wrote it.
	 * @param signal Calls the solve off: one still waiting for the engine is
	 * never solved, and is refused with the signal's reason; one the engine
	 * holds finishes normally.
	 * @returns Its solved geometry, as the core wrote it.
	 */
	readonly solve: (graph: string, signal?: AbortSignal) => Promise<string>;
	/** The theme colours, where a document that stands alone can be drawn. */
	readonly themeColors?: ThemeColors | undefined;
	/**
	 * One Remix Icon's path data, by export name.
	 * @param name The icon's export name, e.g. `RiServerLine`.
	 * @returns Its paths, or nothing when the host has no such icon.
	 */
	readonly iconPaths: (name: string) => readonly string[] | undefined;
}

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

export { installRendererHost, rendererHost, type RendererHost };
