// One headless Chromium, started on demand, drawing one self-contained SVG at
// a time to a bitmap through DevTools, and proving what became of everything
// it owned when it closes.
//
// The page is the SVG itself, loaded from a file the session wrote. Nothing
// is served, nothing is fetched: the renderer embeds its faces, so the only
// bytes Chromium reads are the document it was pointed at.

import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
	HeadlessChromiumError,
	type HeadlessChromiumCleanup,
} from "#runtime/processes/headless-chromium/errors.ts";
import {
	launchHeadlessChromium,
	type HeadlessChromium,
} from "#runtime/processes/headless-chromium/launch.ts";
import { type DevTools } from "#runtime/clients/headless-chromium/devtools.ts";
import { PROCESS_GROUP_OBSERVATION_POLL_MS } from "@archboard/timing";

import { regionOf, type RasterBounds } from "#runtime/operations/rasterizer/bounds.ts";
import {
	READINESS_SCRIPT,
	checkedBitmap,
	checkedReadiness,
} from "#runtime/services/rasterizer/page.ts";

/** What the session was told about time and where Chromium is. */
interface SessionOptions {
	readonly chromiumPath: string;
	readonly jobTimeoutMs: number;
	readonly startupTimeoutMs: number;
	readonly cleanupTimeoutMs: number;
}

/** What one capture is: the document and the bitmap it should become. */
interface CaptureJob extends RasterBounds {
	/** The self-contained SVG document. */
	readonly svg: string;
}

/** What one capture produced. */
interface Capture {
	readonly png: Uint8Array;
	readonly width: number;
	readonly height: number;
}

/** What a closed session proved about its own teardown. */
type SessionCleanup = HeadlessChromiumCleanup;

/**
 * The flags a bitmap needs beyond every headless Chromium's: no GPU, no
 * scrollbars, no device scale or colour profile of its own.
 */
const RASTER_FLAGS = [
	"--disable-gpu",
	"--hide-scrollbars",
	"--force-device-scale-factor=1",
	"--force-color-profile=srgb",
] as const;

/**
 * The failure a caller's cancellation is reported as.
 * @param signal The aborted signal.
 * @returns Its reason, as an error.
 */
function abortReason(signal: AbortSignal): Error {
	return signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason));
}

/**
 * The message of anything thrown.
 * @param error What was thrown.
 * @returns Its message.
 */
function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** One headless Chromium drawing bitmaps, and the proof that it is gone. */
class RasterSession {
	#captures = 0;

	/**
	 * A session is started through acquire, which owns the teardown of a start
	 * that fails part way.
	 * @param options What the owner settled on.
	 * @param chromium The started Chromium.
	 * @param page The page every capture draws in.
	 */
	private constructor(
		readonly options: SessionOptions,
		readonly chromium: HeadlessChromium,
		readonly page: DevTools,
	) {}

	/**
	 * The Chromium process this session leads.
	 * @returns Its pid.
	 */
	get pid(): number {
		return this.chromium.pid;
	}

	/**
	 * The temporary root everything this session writes lives under.
	 * @returns The path.
	 */
	get tempRoot(): string {
		return this.chromium.tempRoot;
	}

	/**
	 * Start Chromium and open the page captures draw in. A start that fails
	 * part way tears down whatever it acquired, and the failure carries what
	 * that teardown proved.
	 * @param options What the owner settled on.
	 * @param signal Cancels startup.
	 * @returns The started session.
	 */
	static async acquire(options: SessionOptions, signal?: AbortSignal): Promise<RasterSession> {
		const chromium = await launchHeadlessChromium({
			chromiumPath: options.chromiumPath,
			extraArgs: RASTER_FLAGS,
			startupTimeoutMs: options.startupTimeoutMs,
			cleanupTimeoutMs: options.cleanupTimeoutMs,
			tempRootPrefix: "archboard-raster-",
			...(signal === undefined ? {} : { signal }),
		});
		try {
			const page = await chromium.openPage(options.startupTimeoutMs, signal);
			return new RasterSession(options, chromium, page);
		} catch (error) {
			const cleanup = await chromium.stop();
			throw new HeadlessChromiumError(
				"unavailable",
				`Chromium could not open a page: ${messageOf(error)}` +
					(cleanup.clean ? "" : `\nIts cleanup also failed: ${cleanup.errors.join("; ")}`),
				{ cause: error, cleanup },
			);
		}
	}

	/**
	 * Draw one document to a bitmap at the stated scale, and answer the bytes
	 * once they are known to be the size that was asked for.
	 * @param job The document and its bounds.
	 * @param signal Cancels the capture.
	 * @returns The PNG and what it is.
	 */
	async capture(job: CaptureJob, signal?: AbortSignal): Promise<Capture> {
		const devtools = this.ready();
		const file = join(this.tempRoot, `capture-${this.#captures++}.svg`);
		writeFileSync(file, job.svg, "utf8");
		try {
			signal?.throwIfAborted();
			await this.load(devtools, file, signal);
			checkedReadiness(
				await devtools.evaluate(READINESS_SCRIPT, { timeoutMs: this.options.jobTimeoutMs }),
			);
			signal?.throwIfAborted();
			return checkedBitmap(await this.shoot(devtools, job), job);
		} catch (error) {
			throw this.captureFailure(error, devtools, signal);
		} finally {
			rmSync(file, { force: true });
		}
	}

	/**
	 * Stop this session, once, and prove what became of everything it owned.
	 * @returns What the teardown proved.
	 */
	close(): Promise<SessionCleanup> {
		return this.chromium.stop();
	}

	/**
	 * Navigate the page to the document and wait until it has loaded.
	 * @param devtools The connection.
	 * @param file The document on disk.
	 * @param signal Cancels the wait.
	 */
	private async load(devtools: DevTools, file: string, signal?: AbortSignal): Promise<void> {
		const timeoutMs = this.options.jobTimeoutMs;
		const deadline = Date.now() + timeoutMs;
		await devtools.call("Page.navigate", { url: pathToFileURL(file).href }, timeoutMs);
		// oxlint-disable-next-line no-await-in-loop -- readiness is polled: each probe decides whether to probe again
		while ((await devtools.evaluate("document.readyState", { timeoutMs })) !== "complete") {
			signal?.throwIfAborted();
			if (Date.now() > deadline) throw new Error("The document did not finish loading in time.");
			// oxlint-disable-next-line no-await-in-loop -- the pause between two probes of one poll
			await Bun.sleep(PROCESS_GROUP_OBSERVATION_POLL_MS);
		}
	}

	/**
	 * Size the viewport to the page, set the device scale to the job's scale
	 * and take the shot of the requested rectangle.
	 * @param devtools The connection.
	 * @param job What to draw.
	 * @returns The DevTools answer.
	 */
	private async shoot(devtools: DevTools, job: CaptureJob): Promise<unknown> {
		const timeout = this.options.jobTimeoutMs;
		await devtools.call(
			"Emulation.setDeviceMetricsOverride",
			{
				width: Math.ceil(job.width),
				height: Math.ceil(job.height),
				deviceScaleFactor: job.scale,
				mobile: false,
			},
			timeout,
		);
		return devtools.call(
			"Page.captureScreenshot",
			{
				format: "png",
				clip: { ...regionOf(job), scale: 1 },
				captureBeyondViewport: true,
				fromSurface: true,
			},
			timeout,
		);
	}

	/**
	 * What a failed capture throws: the caller's own cancellation, or the
	 * failure with what the page had logged.
	 * @param error What the capture threw.
	 * @param devtools The connection, for its diagnostics.
	 * @param signal The caller's signal, when it had one.
	 * @returns The failure to throw.
	 */
	private captureFailure(error: unknown, devtools: DevTools, signal?: AbortSignal): Error {
		if (signal?.aborted) return abortReason(signal);
		const diagnostics = devtools.diagnostics();
		const message = messageOf(error);
		return new Error(
			diagnostics.length === 0
				? message
				: `${message}\nThe page reported: ${JSON.stringify(diagnostics)}`,
			{ cause: error },
		);
	}

	/**
	 * The connection a capture runs against, whose process must still run.
	 * @returns The DevTools connection.
	 */
	private ready(): DevTools {
		const exit = this.chromium.exitStatus();
		if (exit !== null) {
			throw new Error(`The rasterizer's Chromium exited with ${exit}.`);
		}
		return this.page;
	}
}

export {
	RasterSession,
	abortReason,
	type Capture,
	type CaptureJob,
	type SessionCleanup,
	type SessionOptions,
};
