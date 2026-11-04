// The painter of this page's canvas (ADR 0071, ADR 0074): Vello on WebGPU where
// the browser gives a real adapter, Vello GPU on WebGL2 where it gives a
// hardware WebGL2 context, and Vello on the CPU otherwise. The choice is made
// once for a canvas, from what the browser says, and the caller shows it.

import initPainter, {
	Painter,
	sourceHash,
} from "#shared/protocol/generated/core/archboard_painter_wasm.js";

/** The painter's WebAssembly, as the build serves it beside its glue. */
const PAINTER_WASM = new URL(
	"../../shared/protocol/generated/core/archboard_painter_wasm_bg.wasm",
	import.meta.url,
);

/** Which painter draws a canvas: Vello on WebGPU, Vello GPU on WebGL2, or Vello on the CPU. */
type PainterKind = "gpu" | "webgl" | "cpu";

/** A painter at work on a canvas. */
interface StartedPainter {
	readonly painter: Painter;
	/** The canvas it draws on: another than the one asked for when a GPU painter failed to start. */
	readonly canvas: HTMLCanvasElement;
	/** Which painter draws it. */
	readonly kind: PainterKind;
	/** Why WebGPU does not paint, and why WebGL2 does not, or null when WebGPU paints. */
	readonly reason: string | null;
	/**
	 * Hear that the GPU under this painter stopped: the page's WebGPU device, or this canvas's
	 * WebGL2 context.
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
 * @param reason Why no GPU paints.
 * @returns The painter.
 */
function startCpu(canvas: HTMLCanvasElement, dark: boolean, reason: string): StartedPainter {
	return { painter: Painter.cpu(canvas, dark), canvas, kind: "cpu", reason };
}

/**
 * A detached canvas that has held no context. A canvas that
 * took a WebGPU or a WebGL2 context never takes a 2D one.
 * @param canvas The canvas.
 * @returns The new canvas, ready for a painter to start before it replaces the old one.
 */
function freshCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
	const fresh = canvas.cloneNode(false);
	if (!(fresh instanceof HTMLCanvasElement)) throw new Error("A canvas did not copy as a canvas.");
	return fresh;
}

/**
 * Hear a canvas lose its WebGL2 context, which Vello GPU does not report: its calls go on
 * with no error and draw nothing.
 * @param canvas The canvas.
 * @returns The stop notification of the painter on it.
 */
function contextLoss(canvas: HTMLCanvasElement): NonNullable<StartedPainter["whenGpuStops"]> {
	return (listener) => {
		/** Tell the loss. */
		const lost = (): void => {
			listener("The WebGL2 context was lost.");
		};
		canvas.addEventListener("webglcontextlost", lost, { once: true });
		return () => canvas.removeEventListener("webglcontextlost", lost);
	};
}

/**
 * Start Vello GPU on WebGL2, or Vello on the CPU on a fresh canvas when WebGL2 refuses.
 * @param canvas The canvas.
 * @param dark Whether the page is dark.
 * @param reason Why WebGPU does not paint.
 * @returns The painter.
 */
function startWebgl(canvas: HTMLCanvasElement, dark: boolean, reason: string): StartedPainter {
	try {
		const painter = Painter.webgl(canvas, dark);
		return { painter, canvas, kind: "webgl", reason, whenGpuStops: contextLoss(canvas) };
	} catch (cause) {
		const refused = cause instanceof Error ? cause.message : String(cause);
		return startCpu(freshCanvas(canvas), dark, `${reason} ${refused}`);
	}
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
	/** The painter that stopped. */
	readonly painter: Exclude<PainterKind, "cpu">;
	/** What went wrong. */
	readonly reason: string;
	/** Whether WebGPU gets another try: a second failure soon after the first ends that. */
	readonly retry: boolean;
}

/**
 * Start the best painter that the browser allows on a canvas: WebGPU, then WebGL2, then the CPU.
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
	if (refusal !== null) return startWebgl(target, dark, failed ?? refusal);
	try {
		return startGpu(target, dark, whenGpuStops);
	} catch (cause) {
		return startWebgl(freshCanvas(target), dark, `WebGPU did not start: ${String(cause)}`);
	}
}

/**
 * Start the painter of a canvas. A GPU painter that stopped at work leaves its canvas, and the
 * next painter down takes a fresh one: WebGPU once more, unless it failed again soon, then
 * WebGL2, then the CPU.
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
	let next: StartedPainter;
	if (failure === undefined) {
		next = await startBest(canvas, dark);
	} else {
		// A canvas that held a GPU context takes no 2D context, and its surface may be what failed.
		const target = freshCanvas(canvas);
		next =
			failure.painter === "webgl"
				? startCpu(target, dark, failure.reason)
				: failure.retry
					? await startBest(target, dark, failure.reason)
					: startWebgl(target, dark, failure.reason);
	}
	// A failed start leaves the caller's canvas in place, so it can still dispose or retry it.
	if (next.canvas !== canvas) canvas.replaceWith(next.canvas);
	return next;
}

export { startPainter, warmPainter };
