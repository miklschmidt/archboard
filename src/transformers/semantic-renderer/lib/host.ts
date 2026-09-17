// What the renderer asks of the place it runs in.
//
// The renderer is the same code under Bun (the CLI, the rasterizer, the
// canvas server's render route) and in a browser tab (TASK-247). Three things
// differ between those places, and only three, so they arrive as a host
// installed once before the first picture:
//
//   the layout engine: a pool of workers, Bun Workers on the server and Web
//     Workers in the browser, each solving one graph at a time
//   the theme colours: parsed from src/shared/theme/theme.css, which Bun reads
//     from disk and a browser build reads at build time
//   the diagram fonts as base64, for a document that embeds its faces, which
//     only a host with the files at hand can give
//
// Text is measured by the host's canvas, through the global `OffscreenCanvas`
// Pretext itself uses: the browser's own, which measures exactly what that
// browser paints, and one backed by @napi-rs/canvas under Bun. The host makes
// sure that canvas exists and has the diagram faces loaded before measuring.

import type { ElkNode, LayoutOptions } from "@archboard/elk-rs";
import type { DiagramTheme } from "@/shared/semantic-board/index";

/** Every theme colour by theme and custom property name. */
type ThemeColors = Readonly<Record<DiagramTheme, Readonly<Record<string, string>>>>;

/** The place the renderer runs in. */
interface RendererHost {
	/**
	 * Solve one graph with the layout engine.
	 * @param graph The complete measured graph.
	 * @param layoutOptions The options for this solve.
	 * @returns Its solved geometry.
	 */
	readonly solve: (graph: ElkNode, layoutOptions: LayoutOptions) => Promise<ElkNode>;
	/** The theme colours. */
	readonly themeColors: ThemeColors;
	/**
	 * One diagram font file as base64, for a document that embeds its faces.
	 * @param file The file's name.
	 * @returns Its bytes, base64 encoded.
	 */
	readonly fontBase64: (file: string) => string;
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
			"No renderer host is installed: import the renderer through @/runtime/semantic-renderer under Bun, or install a browser host first.",
		);
	}
	return installed;
}

/**
 * A theme colour, resolved to a literal a standalone SVG can carry.
 * @param theme The theme.
 * @param name The CSS colour custom property.
 * @returns The colour.
 * @throws {Error} When the theme does not define the property.
 */
function themeColor(theme: DiagramTheme, name: string): string {
	const color = rendererHost().themeColors[theme][name];
	if (color === undefined) {
		throw new Error(
			`Missing ${theme} theme color ${name}. Define it in src/shared/theme/theme.css.`,
		);
	}
	return color;
}

export { installRendererHost, rendererHost, themeColor, type RendererHost, type ThemeColors };
