// One headless Chromium, started on demand in its own process group and its
// own temporary root, drawing one self-contained SVG at a time to a bitmap
// through DevTools, and proving what became of everything it owned when it
// closes.
//
// The page is the SVG itself, loaded from a file the session wrote. Nothing
// is served, nothing is fetched: the renderer embeds its faces, so the only
// bytes Chromium reads are the document it was pointed at.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { CodexProcessGroupIdentity } from "@/runtime/codex-process/process-group";

import { regionOf, type RasterBounds } from "@/runtime/semantic-rasterizer/lib/bounds";
import {
	devToolsPortIn,
	openPageTarget,
	pollUntil,
	processGroups,
	removeTempRoot,
	spawnChromium,
	stopProcessGroup,
	tempParent,
	type ChromiumProcess,
} from "@/runtime/semantic-rasterizer/lib/chromium";
import { DevTools } from "@/runtime/semantic-rasterizer/lib/devtools";
import {
	READINESS_SCRIPT,
	checkedBitmap,
	checkedReadiness,
} from "@/runtime/semantic-rasterizer/lib/page";

/** What the session was told about time and where Chromium is. */
interface SessionOptions {
	readonly chromiumPath: string;
	readonly jobTimeoutMs: number;
	readonly startupTimeoutMs: number;
	readonly cleanupTimeoutMs: number;
}

/** What one capture is: the document and the bitmap it should become. */
interface CaptureJob extends RasterBounds {
	/** The self-contained SVG document, with its faces embedded. */
	readonly svg: string;
}

/** What one capture produced. */
interface Capture {
	readonly png: Uint8Array;
	readonly width: number;
	readonly height: number;
	/** How many faces the document declared, all of them loaded before the shot. */
	readonly fonts: number;
}

/** What a closed session proved about its own teardown. */
interface SessionCleanup {
	readonly clean: boolean;
	readonly pid: number | null;
	readonly processGone: boolean;
	readonly tempRootRemoved: boolean;
	readonly errors: readonly string[];
}

/** A startup failure retains its teardown proof for the owner. */
class SessionStartupError extends Error {
	/**
	 * Preserve both the original failure and the resource cleanup result.
	 * @param message What failed.
	 * @param cleanup The startup session's teardown proof.
	 * @param cause The original startup failure.
	 */
	constructor(
		message: string,
		readonly cleanup: SessionCleanup,
		cause: unknown,
	) {
		super(message, { cause });
	}
}

/** How much of Chromium's own output a failure quotes. */
const OUTPUT_TAIL_CHARACTERS = 4096;

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

/** One headless Chromium, and the proof that it is gone. */
class RasterSession {
	#tempRoot: string | null = null;
	#child: ChromiumProcess | null = null;
	#group: CodexProcessGroupIdentity | null = null;
	#devtools: DevTools | null = null;
	#closePromise: Promise<SessionCleanup> | null = null;
	#outputTail = "";
	#captures = 0;

	/**
	 * A session is started through acquire, which owns the teardown of a start
	 * that fails part way.
	 * @param options What the owner settled on.
	 */
	private constructor(readonly options: SessionOptions) {}

	/**
	 * The Chromium process this session leads.
	 * @returns Its pid, or null before it starts.
	 */
	get pid(): number | null {
		return this.#child?.pid ?? null;
	}

	/**
	 * The temporary root everything this session writes lives under.
	 * @returns The path, or null before it starts.
	 */
	get tempRoot(): string | null {
		return this.#tempRoot;
	}

	/**
	 * Start Chromium and connect to its DevTools endpoint. A start that fails
	 * part way tears down whatever it acquired and says so when that was not
	 * clean.
	 * @param options What the owner settled on.
	 * @param signal Cancels startup.
	 * @returns The started session.
	 */
	static async acquire(options: SessionOptions, signal?: AbortSignal): Promise<RasterSession> {
		const session = new RasterSession(options);
		try {
			signal?.throwIfAborted();
			session.spawn();
			await session.connect(signal);
			return session;
		} catch (error) {
			throw await session.startupFailure(error);
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
		const file = join(this.tempRootOrThrow(), `capture-${this.#captures++}.svg`);
		writeFileSync(file, job.svg, "utf8");
		try {
			signal?.throwIfAborted();
			await this.load(devtools, file, signal);
			const readiness = checkedReadiness(
				await devtools.evaluate(READINESS_SCRIPT, this.options.jobTimeoutMs),
			);
			signal?.throwIfAborted();
			const bitmap = checkedBitmap(await this.shoot(devtools, job), job);
			return { ...bitmap, fonts: readiness.fonts };
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
		this.#closePromise ??= this.closeOnce();
		return this.#closePromise;
	}

	/**
	 * Start Chromium on a blank page in its own group and temporary root.
	 * @throws {Error} When no executable was found.
	 */
	private spawn(): void {
		if (this.options.chromiumPath === "") {
			throw new Error(
				"no Chromium or Google Chrome executable was found on PATH; install one or set ARCHBOARD_RENDERER_CHROMIUM to its path.",
			);
		}
		const tempRoot = mkdtempSync(join(tempParent(), "archboard-raster-"));
		this.#tempRoot = tempRoot;
		const child = spawnChromium(this.options.chromiumPath, tempRoot);
		this.#child = child;
		this.#group = processGroups.capture(child.pid);
		void this.drain(child.stderr);
		void this.drain(child.stdout);
	}

	/**
	 * Keep the tail of one output pipe for a failure to quote, and let the
	 * pipe drain so the process never blocks on it.
	 * @param stream The pipe.
	 */
	private async drain(stream: ReadableStream<Uint8Array>): Promise<void> {
		const decoder = new TextDecoder();
		try {
			for await (const chunk of stream) {
				this.#outputTail = (this.#outputTail + decoder.decode(chunk)).slice(
					-OUTPUT_TAIL_CHARACTERS,
				);
			}
		} catch {
			// A closed pipe is the end of the process, which the teardown proves.
		}
	}

	/**
	 * Find the DevTools endpoint, open a page target and enable what a capture needs.
	 * @param signal Cancels startup.
	 */
	private async connect(signal?: AbortSignal): Promise<void> {
		const deadline = Date.now() + this.options.startupTimeoutMs;
		const tempRoot = this.tempRootOrThrow();
		const port = await pollUntil(
			() => {
				signal?.throwIfAborted();
				return Promise.resolve(this.exitedEarly() ?? devToolsPortIn(tempRoot));
			},
			deadline,
			"Chromium did not open its DevTools port in time.",
		);
		if (typeof port !== "number") throw port;
		const socketUrl = await openPageTarget(port, Math.max(1, deadline - Date.now()), signal);
		const devtools = await DevTools.connect(socketUrl, Math.max(1, deadline - Date.now()), signal);
		this.#devtools = devtools;
		/** Close pending setup calls immediately when startup is cancelled. */
		const cancel = (): void => {
			devtools.close();
		};
		signal?.addEventListener("abort", cancel, { once: true });
		try {
			signal?.throwIfAborted();
			await devtools.call("Page.enable", {}, Math.max(1, deadline - Date.now()));
			await devtools.call("Runtime.enable", {}, Math.max(1, deadline - Date.now()));
			await devtools.call("Log.enable", {}, Math.max(1, deadline - Date.now()));
			signal?.throwIfAborted();
		} finally {
			signal?.removeEventListener("abort", cancel);
		}
	}

	/**
	 * The failure to report when Chromium exited before it listened, or null
	 * while it is still running.
	 * @returns The failure, or null.
	 */
	private exitedEarly(): Error | null {
		const child = this.#child;
		if (child === null) return new Error("Chromium was not started.");
		if (child.exitCode === null && child.signalCode === null) return null;
		return new Error(
			`Chromium exited with ${child.signalCode ?? child.exitCode} before it listened.`,
		);
	}

	/**
	 * Navigate the page to the document and wait until it has loaded.
	 * @param devtools The connection.
	 * @param file The document on disk.
	 * @param signal Cancels the wait.
	 */
	private async load(devtools: DevTools, file: string, signal?: AbortSignal): Promise<void> {
		const timeout = this.options.jobTimeoutMs;
		await devtools.call("Page.navigate", { url: pathToFileURL(file).href }, timeout);
		await pollUntil(
			async () => {
				signal?.throwIfAborted();
				const state = await devtools.evaluate("document.readyState", timeout);
				return state === "complete" ? true : null;
			},
			Date.now() + timeout,
			"The document did not finish loading in time.",
		);
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
	 * What a start that failed part way throws, after its own teardown.
	 * @param error What failed.
	 * @returns The failure to throw.
	 */
	private async startupFailure(error: unknown): Promise<SessionStartupError> {
		const cleanup = await this.close();
		const tail = this.#outputTail.trim();
		return new SessionStartupError(
			`The rasterizer's Chromium could not start: ${messageOf(error)}` +
				(tail === "" ? "" : `\n${tail}`) +
				(cleanup.clean ? "" : `\nIts cleanup also failed: ${cleanup.errors.join("; ")}`),
			cleanup,
			error,
		);
	}

	/**
	 * The connection a capture runs against, which must be there with its
	 * process still running.
	 * @returns The DevTools connection.
	 */
	private ready(): DevTools {
		const devtools = this.#devtools;
		const child = this.#child;
		if (devtools === null || child === null) {
			throw new Error("The rasterizer is not ready.");
		}
		if (child.exitCode !== null || child.signalCode !== null) {
			throw new Error(
				`The rasterizer's Chromium exited with ${child.signalCode ?? child.exitCode}.`,
			);
		}
		return devtools;
	}

	/**
	 * The temporary root, which every step after spawn may rely on.
	 * @returns The path.
	 */
	private tempRootOrThrow(): string {
		if (this.#tempRoot === null) throw new Error("The rasterizer has no temporary root.");
		return this.#tempRoot;
	}

	/**
	 * Stop the process group, if one was started, and say whether the leader
	 * really exited.
	 * @param errors Where to record a leader that stayed.
	 * @returns Whether the process is gone.
	 */
	private async stopChild(errors: string[]): Promise<boolean> {
		const child = this.#child;
		if (child === null) return true;
		try {
			if (this.#group === null) {
				child.kill("SIGKILL");
				throw new Error("Chromium process group ownership could not be established.");
			}
			const gone = await stopProcessGroup(child, this.#group, this.options.cleanupTimeoutMs);
			if (!gone) errors.push(`Chromium group ${child.pid} did not exit after SIGKILL`);
			return gone;
		} catch (error) {
			errors.push(messageOf(error));
			return false;
		}
	}

	/**
	 * Remove the temporary root, if one was made, and say whether it is gone.
	 * @param errors Where to record a root that stayed.
	 * @returns Whether it is gone.
	 */
	private removeTempRoot(errors: string[]): boolean {
		const tempRoot = this.#tempRoot;
		return tempRoot === null ? true : removeTempRoot(tempRoot, errors);
	}

	/**
	 * Close DevTools, stop the process group, wait for the leader to go, and
	 * remove the temporary root; record every step that did not happen.
	 * @returns What the teardown proved.
	 */
	private async closeOnce(): Promise<SessionCleanup> {
		const errors: string[] = [];
		this.#devtools?.close();
		this.#devtools = null;
		const processGone = await this.stopChild(errors);
		const tempRootRemoved = processGone && this.removeTempRoot(errors);
		// Every step that did not happen recorded why, so no errors is clean.
		return { clean: errors.length === 0, pid: this.pid, processGone, tempRootRemoved, errors };
	}
}

export {
	RasterSession,
	SessionStartupError,
	abortReason,
	type Capture,
	type CaptureJob,
	type SessionCleanup,
	type SessionOptions,
};
