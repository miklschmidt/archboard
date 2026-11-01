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

/** A painter at work on a canvas. */
interface StartedPainter {
	readonly painter: Painter;
	/** The canvas it draws on: another than the one asked for when the GPU failed to start. */
	readonly canvas: HTMLCanvasElement;
	/** Which painter draws it. */
	readonly kind: "gpu" | "cpu";
	/** Why the GPU does not paint, or null when it does. */
	readonly reason: string | null;
	/**
	 * Hear that the GPU of this page stopped.
	 * @param listener What to tell, with the reason.
	 * @returns Stop listening.
	 */
	readonly whenGpuStops?: (listener: (reason: string) => void) => () => void;
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

/** Who hears that the GPU of this page stopped. */
const stopListeners = new Set<(reason: string) => void>();

/**
 * The GPU of this page stopped. The next painter starts it again.
 * @param reason Why it stopped.
 */
function gpuStopped(reason: string): void {
	gpuAnswer = undefined;
	for (const listener of [...stopListeners]) listener(reason);
}

/**
 * Why this browser's WebGPU does not paint, once the page's GPU is ready: its first frame is
 * drawn and finished, so the first frame a reader sees is not the one that compiles the pipelines.
 * @returns The reason, or null when it gave a real adapter.
 */
async function askForGpu(): Promise<string | null> {
	if (!("gpu" in navigator)) return "This browser has no WebGPU.";
	const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
	if (adapter === null) return "WebGPU gave no adapter.";
	if (adapter.info.isFallbackAdapter) return "WebGPU gave a software adapter.";
	await loadPainter();
	await Painter.warm(gpuStopped);
	return null;
}

let gpuAnswer: Promise<string | null> | undefined;

/**
 * Why this browser's WebGPU does not paint, asked once until the GPU stops.
 * @returns The reason, or null when the GPU is ready.
 */
function gpuRefusal(): Promise<string | null> {
	gpuAnswer ??= askForGpu().catch((cause: unknown) => `WebGPU did not start: ${String(cause)}`);
	return gpuAnswer;
}

/** Start what a painter needs as the page starts, so that it is ready for the first picture. */
function warmPainter(): void {
	void loadPainter().catch(() => undefined);
	void gpuRefusal();
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
 * Start Vello on WebGPU.
 * @param canvas The canvas.
 * @param dark Whether the page is dark.
 * @returns The painter.
 */
function startGpu(canvas: HTMLCanvasElement, dark: boolean): StartedPainter {
	return {
		painter: Painter.gpu(canvas, dark),
		canvas,
		kind: "gpu",
		reason: null,
		whenGpuStops: (listener) => {
			stopListeners.add(listener);
			return () => stopListeners.delete(listener);
		},
	};
}

/** Why a canvas's GPU painter stopped at work, and what comes next. */
interface PainterFailure {
	/** What went wrong. */
	readonly reason: string;
	/** Whether the GPU gets another try: a second failure soon after the first ends that. */
	readonly retry: boolean;
}

/**
 * Start the painter of a canvas.
 * @param canvas The canvas, sized in pixels.
 * @param dark Whether the page is dark.
 * @param failure Why the GPU painter of this canvas stopped, when it stopped at work.
 * @returns The painter, which says which it is and why.
 */
async function startPainter(
	canvas: HTMLCanvasElement,
	dark: boolean,
	failure?: PainterFailure,
): Promise<StartedPainter> {
	await loadPainter();
	// A canvas that held a GPU context takes no 2D context, and its surface may be what failed.
	const target = failure === undefined ? canvas : freshCanvas(canvas);
	if (failure !== undefined && !failure.retry) return startCpu(target, dark, failure.reason);
	const refusal = await gpuRefusal();
	if (refusal !== null) return startCpu(target, dark, failure?.reason ?? refusal);
	try {
		return startGpu(target, dark);
	} catch (cause) {
		return startCpu(freshCanvas(target), dark, `WebGPU did not start: ${String(cause)}`);
	}
}

export { startPainter, warmPainter, type PainterFailure };
