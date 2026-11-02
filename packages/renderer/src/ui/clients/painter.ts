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
					"Run `bun run build` with the tools that INSTALL.md names, then reload the page.",
			);
		}
	})();
	return loading;
}

/**
 * Why this browser's WebGPU does not paint, once the page's GPU is ready: its first frame is
 * drawn and finished, so the first frame a reader sees is not the one that compiles the pipelines.
 * @param stopped What to tell when this GPU stops.
 * @returns The reason, or null when it gave a real adapter.
 */
async function askForGpu(stopped: (reason: string) => void): Promise<string | null> {
	if (!("gpu" in navigator)) return "This browser has no WebGPU.";
	const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
	if (adapter === null) return "WebGPU gave no adapter.";
	if (adapter.info.isFallbackAdapter) return "WebGPU gave a software adapter.";
	await loadPainter();
	await Painter.warm(stopped);
	return null;
}

/** One GPU start and the stop notification that belongs to it. */
interface GpuAnswer {
	readonly refusal: string | null;
	readonly whenGpuStops: NonNullable<StartedPainter["whenGpuStops"]>;
}

let gpuAnswer: Promise<GpuAnswer> | undefined;

/**
 * Why this browser's WebGPU does not paint, asked once until the GPU stops.
 * @returns The reason, or null when the GPU is ready.
 */
function gpuRefusal(): Promise<GpuAnswer> {
	if (gpuAnswer !== undefined) return gpuAnswer;
	let stopped: string | null = null;
	const listeners = new Set<(reason: string) => void>();
	const answer = askForGpu((reason) => {
		stopped = reason;
		if (gpuAnswer === answer) gpuAnswer = undefined;
		for (const listener of listeners) listener(reason);
	})
		.catch((cause: unknown) => `WebGPU did not start: ${String(cause)}`)
		.then((refusal): GpuAnswer => ({
			refusal,
			/**
			 * Hear this GPU stop, including a stop before the stage subscribed.
			 * @param listener Who hears it.
			 * @returns Stop listening.
			 */
			whenGpuStops: (listener) => {
				if (stopped !== null) {
					listener(stopped);
					return () => undefined;
				}
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		}));
	gpuAnswer = answer;
	return answer;
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
 * @param whenGpuStops Hear when this GPU stops.
 * @returns The painter.
 */
function startGpu(
	canvas: HTMLCanvasElement,
	dark: boolean,
	whenGpuStops: GpuAnswer["whenGpuStops"],
): StartedPainter {
	return {
		painter: Painter.gpu(canvas, dark),
		canvas,
		kind: "gpu",
		reason: null,
		whenGpuStops,
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
 * Start the GPU painter of a canvas when the GPU allows it, otherwise the CPU painter.
 * @param target The canvas.
 * @param dark Whether the page is dark.
 * @param failed Why the last GPU painter of this canvas stopped, if it did.
 * @returns The painter, which says which it is and why.
 */
async function startBest(
	target: HTMLCanvasElement,
	dark: boolean,
	failed?: string,
): Promise<StartedPainter> {
	const { refusal, whenGpuStops } = await gpuRefusal();
	if (refusal !== null) return startCpu(target, dark, failed ?? refusal);
	try {
		return startGpu(target, dark, whenGpuStops);
	} catch (cause) {
		return startCpu(freshCanvas(target), dark, `WebGPU did not start: ${String(cause)}`);
	}
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
	if (failure === undefined) return startBest(canvas, dark);
	// A canvas that held a GPU context takes no 2D context, and its surface may be what failed.
	const target = freshCanvas(canvas);
	return failure.retry
		? startBest(target, dark, failure.reason)
		: startCpu(target, dark, failure.reason);
}

export { startPainter, warmPainter, type PainterFailure };
