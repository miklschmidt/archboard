// The painter of this page's canvas (ADR 0071): Vello on WebGPU where the
// browser gives a real adapter, and Vello on the CPU otherwise. The choice is
// made once for a canvas, from what the browser says, and the caller shows it.

import initPainter, {
	Painter,
	sourceHash,
} from "#shared/protocol/generated/core/archboard_painter_wasm.js";

/** The painter's WebAssembly, as the build serves it beside its glue. */
const PAINTER_WASM = new URL(
	"../../shared/protocol/generated/core/archboard_painter_wasm_bg.wasm",
	import.meta.url,
);

/** Which painter draws a canvas. */
type PainterKind = "gpu" | "cpu";

/** A painter at work on a canvas. */
interface StartedPainter {
	readonly painter: Painter;
	/** The canvas it draws on: another than the one asked for when the GPU failed to start. */
	readonly canvas: HTMLCanvasElement;
	readonly kind: PainterKind;
	/** Why the GPU does not paint, or null when it does. */
	readonly reason: string | null;
}

let loading: Promise<void> | undefined;

/**
 * Load the painter once, and refuse an artifact from another source build.
 * @returns After it is ready.
 */
function loadPainter(): Promise<void> {
	loading ??= (async (): Promise<void> => {
		await initPainter({ module_or_path: PAINTER_WASM });
		const built = sourceHash();
		if (built !== ARCHBOARD_CORE_SOURCE_HASH) {
			throw new Error(
				`CORE_BUILD_STALE: The painter records ${built}, but this page expects ${ARCHBOARD_CORE_SOURCE_HASH}. ` +
					"Run `bun run build` inside `nix develop`, then reload the page.",
			);
		}
	})();
	return loading;
}

/**
 * Why this browser's WebGPU does not paint.
 * @returns The reason, or null when it gave a real adapter.
 */
async function gpuRefusal(): Promise<string | null> {
	if (!("gpu" in navigator)) return "This browser has no WebGPU.";
	const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
	if (adapter === null) return "WebGPU gave no adapter.";
	return adapter.info.isFallbackAdapter ? "WebGPU gave a software adapter." : null;
}

/**
 * Start Vello on the CPU.
 * @param canvas The canvas.
 * @param dark Whether the page is dark.
 * @param reason Why the GPU does not paint.
 * @returns The painter.
 */
function startCpu(canvas: HTMLCanvasElement, dark: boolean, reason: string): StartedPainter {
	return { painter: Painter.cpu(canvas, dark), canvas, kind: "cpu", reason };
}

/**
 * A canvas that has held no context, in place of one that has. A canvas that
 * took a WebGPU context never takes a 2D one.
 * @param canvas The canvas.
 * @returns The new canvas, in the same place.
 */
function freshCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
	const fresh = canvas.cloneNode(false);
	if (!(fresh instanceof HTMLCanvasElement)) throw new Error("A canvas did not copy as a canvas.");
	canvas.replaceWith(fresh);
	return fresh;
}

/**
 * Start the painter of a canvas.
 * @param canvas The canvas, sized in pixels.
 * @param dark Whether the page is dark.
 * @returns The painter, which says which it is and why.
 */
async function startPainter(canvas: HTMLCanvasElement, dark: boolean): Promise<StartedPainter> {
	await loadPainter();
	const refusal = await gpuRefusal();
	if (refusal !== null) return startCpu(canvas, dark, refusal);
	try {
		return { painter: await Painter.gpu(canvas, dark), canvas, kind: "gpu", reason: null };
	} catch (cause) {
		return startCpu(freshCanvas(canvas), dark, `WebGPU did not start: ${String(cause)}`);
	}
}

/**
 * Start Vello on the CPU in place of a GPU painter that failed at work.
 * @param canvas The canvas the GPU painter drew on.
 * @param dark Whether the page is dark.
 * @param reason Why the GPU painter stopped.
 * @returns The painter.
 */
function fallBackToCpu(canvas: HTMLCanvasElement, dark: boolean, reason: string): StartedPainter {
	return startCpu(freshCanvas(canvas), dark, reason);
}

export { fallBackToCpu, startPainter, type PainterKind, type StartedPainter };
