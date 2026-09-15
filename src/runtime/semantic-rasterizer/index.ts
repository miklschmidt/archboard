// A semantic diagram to a bitmap, headlessly: one private Chromium started on
// demand, drawing the renderer's own SVG one capture at a time at a stated
// scale, and torn down provably.
//
// The renderer decides every coordinate and measures every word against the
// real font files; this module adds nothing to the picture. It loads the
// self-contained SVG in a page whose device scale is exactly the scale asked
// for, waits for the embedded faces, pauses the traffic animation at its first
// frame, and takes the shot of the whole page. A bitmap that is not the size
// the diagram asks for is refused, never cropped, scaled or padded to fit.

import {
	SEMANTIC_RASTER_CLEANUP_MS,
	SEMANTIC_RASTER_JOB_TIMEOUT_MS,
	SEMANTIC_RASTER_STARTUP_TIMEOUT_MS,
} from "@/shared/timing/timing";
import {
	RASTER_MAX_PIXELS,
	RASTER_MAX_SCALE,
	RASTER_MAX_SIDE_PX,
	RASTER_MIN_SCALE,
	bitmapSizeOf,
	boundsRefusal,
	type BitmapSize,
	type PageRegion,
	type RasterBounds,
} from "@/runtime/semantic-rasterizer/lib/bounds";
import { discoveredChromiumPath } from "@/runtime/semantic-rasterizer/lib/chromium";
import { readPngDimensions, type PngDimensions } from "@/runtime/semantic-rasterizer/lib/png";
import {
	RasterSession,
	SessionStartupError,
	abortReason,
	type Capture,
	type CaptureJob,
	type SessionCleanup,
	type SessionOptions,
} from "@/runtime/semantic-rasterizer/lib/session";

/** Why a capture was refused or failed. */
type RasterErrorCode =
	| "RASTERIZER_UNAVAILABLE"
	| "RASTER_BOUNDS_EXCEEDED"
	| "RASTER_FAILED"
	| "RASTERIZER_STOPPED";

/**
 * A capture that did not happen, with the stable half of why.
 *
 * The code is what a command maps to an exit; the message is for a person.
 */
class SemanticRasterError extends Error {
	/** Which failure this is. */
	readonly code: RasterErrorCode;

	/**
	 * Fail a capture, with a reason.
	 * @param code Which failure this is.
	 * @param message What a person should read.
	 * @param cause What failed underneath, when something did.
	 */
	constructor(code: RasterErrorCode, message: string, cause?: unknown) {
		super(message, cause === undefined ? undefined : { cause });
		this.name = "SemanticRasterError";
		this.code = code;
	}
}

/** What a caller may settle about the rasterizer. */
interface SemanticRasterizerOptions {
	/** The Chromium-family executable; the environment and PATH otherwise. */
	readonly chromiumPath?: string;
	readonly jobTimeoutMs?: number;
	readonly startupTimeoutMs?: number;
	readonly cleanupTimeoutMs?: number;
}

/** What the rasterizer is doing now. */
interface SemanticRasterizerStatus {
	readonly accepting: boolean;
	readonly active: boolean;
	readonly queued: number;
	readonly chromiumStarts: number;
	readonly chromiumPid: number | null;
	readonly tempRoot: string | null;
}

/** One rasterizer: lazy, serialised, cancellable, and stopped provably. */
interface SemanticRasterizer {
	/**
	 * Draw one document. Queued behind whatever is drawing, cancellable while
	 * it waits and while it draws.
	 * @param job The document and its bounds.
	 * @param signal Cancels it.
	 * @returns The bitmap and what it is.
	 */
	rasterize(job: CaptureJob, signal?: AbortSignal): Promise<Capture>;
	/** What it is doing now. */
	status(): SemanticRasterizerStatus;
	/**
	 * Stop accepting work, finish what is drawing, and tear Chromium down.
	 * @returns What the teardown proved; `clean` is false when something was left.
	 */
	stop(): Promise<SessionCleanup>;
}

/** What a stopped rasterizer that never started proved, which is everything. */
const NOTHING_TO_CLEAN: SessionCleanup = {
	clean: true,
	pid: null,
	processGone: true,
	tempRootRemoved: true,
	errors: [],
};

/**
 * Everything the session needs settled: what the caller gave, else the
 * environment, else this machine's own executables and the shared timings.
 * @param options What the caller settled.
 * @returns The session options.
 */
function resolveOptions(options: SemanticRasterizerOptions): SessionOptions {
	return {
		chromiumPath:
			options.chromiumPath ??
			process.env["ARCHBOARD_RENDERER_CHROMIUM"] ??
			discoveredChromiumPath(),
		jobTimeoutMs: options.jobTimeoutMs ?? SEMANTIC_RASTER_JOB_TIMEOUT_MS,
		startupTimeoutMs: options.startupTimeoutMs ?? SEMANTIC_RASTER_STARTUP_TIMEOUT_MS,
		cleanupTimeoutMs: options.cleanupTimeoutMs ?? SEMANTIC_RASTER_CLEANUP_MS,
	};
}

/**
 * Race one promise against a caller's cancellation.
 * @param work The promise.
 * @param signal Cancels it.
 * @returns What the promise produced, unless the signal fired first.
 */
function abortable<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (!signal) return work;
	return new Promise<T>((resolveWork, rejectWork) => {
		/** Fail the race with the caller's reason. */
		const onAbort = (): void => {
			rejectWork(abortReason(signal));
		};
		if (signal.aborted) {
			onAbort();
			return;
		}
		signal.addEventListener("abort", onAbort, { once: true });
		work.then(resolveWork, rejectWork).finally(() => signal.removeEventListener("abort", onAbort));
	});
}

/**
 * The failure a capture is reported as: the caller's own cancellation, a
 * failure that already says which it is, or everything else as a capture
 * failure.
 * @param error What was thrown.
 * @param signal The caller's signal, when it had one.
 * @returns The failure to throw.
 */
function rasterFailure(error: unknown, signal?: AbortSignal): Error {
	if (signal?.aborted) return abortReason(signal);
	if (error instanceof SemanticRasterError) return error;
	return new SemanticRasterError(
		"RASTER_FAILED",
		error instanceof Error ? error.message : String(error),
		error,
	);
}

/** A capture's place in the queue. */
type QueueState = "queued" | "active" | "settled";

/** One rasterizer's private state, shared by its three operations. */
interface OwnerState {
	accepting: boolean;
	stopping: boolean;
	shutdown: AbortController;
	active: boolean;
	queued: number;
	chromiumStarts: number;
	session: RasterSession | null;
	acquisition: Promise<RasterSession> | null;
	tail: Promise<void>;
	stopPromise: Promise<SessionCleanup> | null;
	cleanup: SessionCleanup;
}

/**
 * Retain teardown proof and refuse new work if anything remains owned.
 * @param state The rasterizer's state.
 * @param cleanup The completed teardown.
 */
function rememberCleanup(state: OwnerState, cleanup: SessionCleanup): void {
	state.cleanup = cleanup;
	if (!cleanup.clean) state.accepting = false;
}

/**
 * Start the session, once, refusing when the rasterizer stopped meanwhile.
 * @param state The rasterizer's state.
 * @param options The session options.
 * @param signal Cancels acquisition.
 * @returns The session.
 */
async function startSession(
	state: OwnerState,
	options: SessionOptions,
	signal?: AbortSignal,
): Promise<RasterSession> {
	state.chromiumStarts += 1;
	let acquired: RasterSession;
	try {
		acquired = await RasterSession.acquire(
			options,
			signal === undefined
				? state.shutdown.signal
				: AbortSignal.any([signal, state.shutdown.signal]),
		);
	} catch (error) {
		if (error instanceof SessionStartupError) {
			rememberCleanup(state, error.cleanup);
		}
		throw new SemanticRasterError(
			"RASTERIZER_UNAVAILABLE",
			error instanceof Error ? error.message : String(error),
			error,
		);
	}
	if (state.stopping) {
		rememberCleanup(state, await acquired.close());
		throw new SemanticRasterError("RASTERIZER_STOPPED", "The rasterizer stopped during startup.");
	}
	state.session = acquired;
	return acquired;
}

/**
 * The running session, started if this is the first capture.
 * @param state The rasterizer's state.
 * @param options The session options.
 * @param signal Cancels acquisition.
 * @returns The session.
 */
function acquire(
	state: OwnerState,
	options: SessionOptions,
	signal?: AbortSignal,
): Promise<RasterSession> {
	if (state.session) return Promise.resolve(state.session);
	if (state.acquisition) return state.acquisition;
	state.acquisition = startSession(state, options, signal).finally(() => {
		state.acquisition = null;
	});
	return state.acquisition;
}

/**
 * Close the session a capture failed inside: a Chromium that failed one
 * capture is not trusted with the next. An unclean close joins the failure.
 * @param state The rasterizer's state.
 * @param error What the capture threw.
 * @returns The failure to throw.
 */
async function retireFailed(state: OwnerState, error: unknown): Promise<unknown> {
	const failed = state.session;
	if (failed === null) return error;
	state.session = null;
	const cleanup = await failed.close();
	rememberCleanup(state, cleanup);
	if (cleanup.clean) return error;
	const message = error instanceof Error ? error.message : String(error);
	return new SemanticRasterError(
		"RASTER_FAILED",
		`${message} Its cleanup also failed: ${cleanup.errors.join("; ")}`,
		error,
	);
}

/**
 * Run one capture on the session.
 * @param state The rasterizer's state.
 * @param options The session options.
 * @param job The document and its bounds.
 * @param signal Cancels it.
 * @returns The capture.
 */
async function runOnSession(
	state: OwnerState,
	options: SessionOptions,
	job: CaptureJob,
	signal?: AbortSignal,
): Promise<Capture> {
	let entered = false;
	try {
		const current = await acquire(state, options, signal);
		signal?.throwIfAborted();
		entered = true;
		return await abortable(current.capture(job, signal), signal);
	} catch (error) {
		throw rasterFailure(entered ? await retireFailed(state, error) : error, signal);
	}
}

/**
 * Why a capture cannot even be queued, or null when it can.
 * @param state The rasterizer's state.
 * @param job The document and its bounds.
 * @param signal The caller's signal, when it had one.
 * @returns The failure, or null.
 */
function admissionFailure(state: OwnerState, job: CaptureJob, signal?: AbortSignal): Error | null {
	if (!state.accepting) {
		return new SemanticRasterError("RASTERIZER_STOPPED", "The rasterizer is not accepting work.");
	}
	const refusal = boundsRefusal(job);
	if (refusal !== null) return new SemanticRasterError("RASTER_BOUNDS_EXCEEDED", refusal);
	if (signal?.aborted) return abortReason(signal);
	return null;
}

/**
 * Queue one capture behind whatever is drawing, cancellable while it waits.
 * @param state The rasterizer's state.
 * @param options The session options.
 * @param job The document and its bounds.
 * @param signal Cancels it.
 * @returns The capture.
 */
function enqueue(
	state: OwnerState,
	options: SessionOptions,
	job: CaptureJob,
	signal?: AbortSignal,
): Promise<Capture> {
	state.queued += 1;
	const place: { value: QueueState } = { value: "queued" };
	let resolveResult!: (capture: Capture) => void;
	let rejectResult!: (error: unknown) => void;
	const result = new Promise<Capture>((resolveJob, rejectJob) => {
		resolveResult = resolveJob;
		rejectResult = rejectJob;
	});
	/** Settle a queued capture the caller cancelled before it began. */
	const onAbort = (): void => {
		if (place.value !== "queued" || !signal) return;
		place.value = "settled";
		state.queued -= 1;
		rejectResult(abortReason(signal));
	};
	signal?.addEventListener("abort", onAbort, { once: true });
	/** Take the capture's turn: run it, or say the rasterizer stopped first. */
	const turn = async (): Promise<void> => {
		if (place.value === "settled") return;
		state.queued -= 1;
		place.value = "active";
		if (!state.accepting) {
			rejectResult(
				new SemanticRasterError(
					"RASTERIZER_STOPPED",
					"The rasterizer stopped before queued work began.",
				),
			);
			return;
		}
		state.active = true;
		try {
			resolveResult(await runOnSession(state, options, job, signal));
		} catch (error) {
			rejectResult(error);
		} finally {
			state.active = false;
		}
	};
	state.tail = state.tail.then(turn).finally(() => {
		place.value = "settled";
		signal?.removeEventListener("abort", onAbort);
	});
	return result;
}

/**
 * Stop accepting work, begin closing the session before the queue drains so
 * work inside it settles against a closing Chromium, then wait for the queue.
 * @param state The rasterizer's state.
 * @returns What the teardown proved.
 */
async function stopOnce(state: OwnerState): Promise<SessionCleanup> {
	state.accepting = false;
	state.stopping = true;
	state.shutdown.abort(new Error("The rasterizer stopped."));
	const acquired = (await state.acquisition?.catch(() => null)) ?? null;
	const current = state.session ?? acquired;
	state.session = null;
	const closing = current?.close();
	await state.tail;
	return (await closing) ?? state.cleanup;
}

/**
 * Make a rasterizer. Chromium starts with the first capture, not here.
 * @param options What the caller settles.
 * @returns The rasterizer.
 */
function createSemanticRasterizer(options: SemanticRasterizerOptions = {}): SemanticRasterizer {
	const settled = resolveOptions(options);
	const state: OwnerState = {
		accepting: true,
		stopping: false,
		shutdown: new AbortController(),
		active: false,
		queued: 0,
		chromiumStarts: 0,
		session: null,
		acquisition: null,
		tail: Promise.resolve(),
		stopPromise: null,
		cleanup: NOTHING_TO_CLEAN,
	};
	return {
		/**
		 * Draw one document, queued behind whatever is drawing.
		 * @param job The document and its bounds.
		 * @param signal Cancels it.
		 * @returns The bitmap and what it is.
		 */
		rasterize(job, signal) {
			const failure = admissionFailure(state, job, signal);
			return failure === null ? enqueue(state, settled, job, signal) : Promise.reject(failure);
		},
		/**
		 * What it is doing now.
		 * @returns The status.
		 */
		status() {
			return {
				accepting: state.accepting,
				active: state.active,
				queued: state.queued,
				chromiumStarts: state.chromiumStarts,
				chromiumPid: state.session?.pid ?? null,
				tempRoot: state.session?.tempRoot ?? null,
			};
		},
		/**
		 * Stop, once.
		 * @returns What the teardown proved.
		 */
		stop() {
			state.stopPromise ??= stopOnce(state);
			return state.stopPromise;
		},
	};
}

export {
	RASTER_MAX_PIXELS,
	RASTER_MAX_SCALE,
	RASTER_MAX_SIDE_PX,
	RASTER_MIN_SCALE,
	SemanticRasterError,
	bitmapSizeOf,
	boundsRefusal,
	createSemanticRasterizer,
	discoveredChromiumPath,
	readPngDimensions,
	type BitmapSize,
	type Capture,
	type CaptureJob,
	type PageRegion,
	type PngDimensions,
	type RasterBounds,
	type RasterErrorCode,
	type SemanticRasterizer,
	type SemanticRasterizerOptions,
	type SemanticRasterizerStatus,
	type SessionCleanup,
};
