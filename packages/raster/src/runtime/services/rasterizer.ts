// Pictures to bitmaps, headlessly: one private Chromium for one run over the
// pictures, started when the first picture needs it, drawing the renderer's own
// SVG one capture at a time at a stated scale, and torn down provably when the
// run ends, however it ends.
//
// The renderer decides every coordinate and measures every word against the
// real font files; this module adds nothing to the picture. It loads the
// self-contained SVG in a page whose device scale is exactly the scale asked
// for, waits for the embedded faces, pauses the traffic animation at its first
// frame, and takes the shot of the whole page. A bitmap that is not the size
// the diagram asks for is refused, never cropped, scaled or padded to fit.

import { discoveredChromiumPath } from "@archboard/headless-chromium";
import { durationMs } from "@archboard/timing";
import { boundsRefusal } from "#runtime/operations/bounds.ts";
import {
	RasterSession,
	abortReason,
	type Capture,
	type CaptureJob,
	type SessionOptions,
} from "#runtime/services/session.ts";

/** Why a capture was refused or failed. */
type RasterErrorCode = "RASTERIZER_UNAVAILABLE" | "RASTER_BOUNDS_EXCEEDED" | "RASTER_FAILED";

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

/** What a caller may settle about one run. */
interface RasterizeOptions {
	/** Cancels the run: the capture under way, and every one after it. */
	readonly signal?: AbortSignal | undefined;
	/** The Chromium-family executable; the environment and PATH otherwise. */
	readonly chromiumPath?: string | undefined;
}

/**
 * The message of anything thrown.
 * @param error What was thrown.
 * @returns Its message.
 */
function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
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
 * Start the run's Chromium.
 * @param options The session options.
 * @param signal Cancels the start.
 * @returns The session.
 */
async function startSession(options: SessionOptions, signal?: AbortSignal): Promise<RasterSession> {
	try {
		return await RasterSession.acquire(options, signal);
	} catch (error) {
		if (signal?.aborted) throw abortReason(signal);
		throw new SemanticRasterError("RASTERIZER_UNAVAILABLE", messageOf(error), error);
	}
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
	return new SemanticRasterError("RASTER_FAILED", messageOf(error), error);
}

/**
 * Close the run's Chromium and hold the run to the proof of its teardown: a run
 * that leaves something behind fails, with whatever already failed it.
 * @param session The run's Chromium, if it started.
 * @param failure What already failed the run, if anything.
 * @throws {SemanticRasterError} When the teardown left something behind.
 */
async function shutDown(session: RasterSession | null, failure: unknown): Promise<void> {
	if (session === null) return;
	const cleanup = await session.close();
	if (cleanup.clean) return;
	const left = cleanup.errors.join("; ");
	throw new SemanticRasterError(
		"RASTER_FAILED",
		failure === undefined
			? `The rasterizer did not stop cleanly: ${left}`
			: `${messageOf(failure)} Its cleanup also failed: ${left}`,
		failure,
	);
}

/**
 * What the run's Chromium is settled with: the caller's executable, else the one the environment
 * names or this machine has, and the shared timings.
 * @param chromiumPath The caller's executable, if any.
 * @returns The session options.
 */
function sessionOptions(chromiumPath: string | undefined): SessionOptions {
	return {
		chromiumPath: chromiumPath ?? discoveredChromiumPath(),
		jobTimeoutMs: durationMs("raster.jobTimeout"),
		startupTimeoutMs: durationMs("raster.startupTimeout"),
		cleanupTimeoutMs: durationMs("raster.cleanup"),
	};
}

/**
 * Refuse a picture before any browser draws it: one the bounds refuse, or any once the caller
 * has cancelled.
 * @param job The picture.
 * @param signal The caller's signal, when it has one.
 * @throws {Error} The refusal, or the caller's reason.
 */
function admit(job: CaptureJob, signal?: AbortSignal): void {
	const refusal = boundsRefusal(job);
	if (refusal !== null) throw new SemanticRasterError("RASTER_BOUNDS_EXCEEDED", refusal);
	if (signal?.aborted) throw abortReason(signal);
}

/**
 * Capture one picture on the run's Chromium.
 * @param session The run's Chromium.
 * @param job The picture.
 * @param signal Cancels it.
 * @returns The capture.
 */
async function captureOn(
	session: RasterSession,
	job: CaptureJob,
	signal?: AbortSignal,
): Promise<Capture> {
	try {
		return await abortable(session.capture(job, signal), signal);
	} catch (error) {
		throw rasterFailure(error, signal);
	}
}

/**
 * Capture each picture in order, in one private Chromium for the whole run. Chromium starts with
 * the first picture, not before, and a picture the bounds refuse is refused before it starts. The
 * run ends when the pictures do, when one fails, when the caller cancels and when the caller stops
 * reading; each way, Chromium is provably gone before the run hands control back.
 * @param jobs The pictures: each SVG with its page size, scale and optional region.
 * @param options What the run settles.
 * @yields {Capture} Each picture's PNG, in the order asked.
 */
async function* rasterizeAll(
	jobs: Iterable<CaptureJob> | AsyncIterable<CaptureJob>,
	options: RasterizeOptions = {},
): AsyncGenerator<Capture, void, undefined> {
	const { signal } = options;
	const settled = sessionOptions(options.chromiumPath);
	let session: RasterSession | null = null;
	let failure: unknown = undefined;
	try {
		for await (const job of jobs) {
			admit(job, signal);
			session ??= await startSession(settled, signal);
			yield await captureOn(session, job, signal);
		}
	} catch (error) {
		failure = error;
		throw error;
	} finally {
		await shutDown(session, failure);
	}
}

export { rasterizeAll };
