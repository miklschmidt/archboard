// Recording one walkthrough of a board to a video file, narrated by the Codex
// voice (TASK-304).
//
// The recording is made by the canvas's own page, opened on the board in a
// private headless Chromium the recorder owns: the page shows the one pane,
// paces the talk by the voice and captures its own tab. The recorder starts
// the browser the way the page needs it (a window exactly the reference size,
// tab capture accepted without a prompt, audio allowed to play, a silent
// microphone granted), drives the page through the shared recording contract,
// streams the finished file out and tears the browser down, whatever happened.
// It runs against the canvas the CLI talks to, because that canvas owns the
// Codex sign-in the voice needs.

import { mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { SHELL_VIEWPORT } from "@/shared/shell-geometry";
import {
	RECORDING_BROWSER_START_MS,
	RECORDING_BROWSER_STOP_MS,
	RECORDING_CALL_MS,
} from "@/shared/timing/timing";
import {
	RECORDING_SEARCH_PARAM,
	type RecordingContainer,
	type RecordingState,
} from "@/shared/walkthrough-recording";
import {
	HeadlessChromiumError,
	discoveredChromiumPath,
	isJsonRecord,
	launchHeadlessChromium,
	type DevTools,
	type HeadlessChromium,
} from "@/runtime/headless-chromium";

import {
	RecordingPageError,
	drive,
	type RecordingPageHandle,
} from "@/runtime/walkthrough-recorder/lib/drive";
import { writeSilence } from "@/runtime/walkthrough-recorder/lib/silence";

/** Why a recording did not happen. */
type WalkthroughRecordingErrorCode =
	/** No Chromium-family browser was found, or it would not start. */
	| "RECORDER_UNAVAILABLE"
	/** The page could not start recording: nothing was captured. */
	| "RECORDING_REFUSED"
	/** The recording started and did not finish. */
	| "RECORDING_FAILED";

/** A recording that did not happen, with the stable half of why. */
class WalkthroughRecordingError extends Error {
	readonly code: WalkthroughRecordingErrorCode;

	/**
	 * Fail a recording.
	 * @param code Which failure.
	 * @param message What happened and what to do.
	 * @param cause What failed underneath.
	 */
	constructor(code: WalkthroughRecordingErrorCode, message: string, cause?: unknown) {
		super(message, cause === undefined ? undefined : { cause });
		this.name = "WalkthroughRecordingError";
		this.code = code;
	}
}

/** What to record, and where. */
interface WalkthroughRecordingRequest {
	/** The canvas the page is served by. */
	readonly canvasUrl: string;
	/** The board, as a pane addresses it: its name, or name@variant. */
	readonly boardKey: string;
	/** The walkthrough, by id. */
	readonly walkthrough: string;
	readonly container: RecordingContainer;
	/** Which palette the page draws in. */
	readonly theme: "light" | "dark";
	/** The file to write, absolute. */
	readonly out: string;
	readonly signal: AbortSignal;
	/**
	 * Told each new phase and step of the talk.
	 * @param state The page's state.
	 */
	readonly onProgress: (state: RecordingState) => void;
	/** The browser to record in; the one the environment names or this machine has otherwise. */
	readonly chromiumPath?: string;
}

/** A finished recording. */
interface RecordedWalkthrough {
	readonly file: string;
	readonly bytes: number;
	readonly mimeType: string;
	readonly durationMs: number;
	/** How many steps the talk went through. */
	readonly steps: number;
}

/**
 * The address of the recording page.
 * @param request What to record.
 * @returns The page's URL.
 */
function pageUrl(request: WalkthroughRecordingRequest): string {
	const url = new URL("/", request.canvasUrl);
	url.searchParams.set("paneA", request.boardKey);
	url.searchParams.set(RECORDING_SEARCH_PARAM, request.walkthrough);
	return url.toString();
}

/**
 * What the recording's browser is started with, beyond what every private browser is.
 * @param microphone The silent file the fake microphone plays.
 * @returns The extra flags.
 */
function recordingFlags(microphone: string): readonly string[] {
	return [
		// A screen larger than the window, or the tab capture is held to the headless default.
		"--screen-info={2560x1600}",
		"--auto-accept-this-tab-capture",
		"--autoplay-policy=no-user-gesture-required",
		"--use-fake-device-for-media-stream",
		`--use-file-for-fake-audio-capture=${microphone}`,
		"--hide-scrollbars",
		"--force-device-scale-factor=1",
		"--force-color-profile=srgb",
	];
}

/**
 * One page as the page driver speaks to it.
 * @param page The page's DevTools connection.
 * @returns The handle.
 */
function pageHandle(page: DevTools): RecordingPageHandle {
	return {
		/**
		 * Evaluate an expression in the page and hand back its value.
		 * @param expression The expression.
		 * @param options Whether it runs as a user gesture, and how long it may take.
		 * @returns Its value.
		 */
		evaluate: (expression, options) =>
			page.evaluate(expression, {
				awaitPromise: true,
				returnByValue: true,
				userGesture: options.userGesture === true,
				timeoutMs: options.timeoutMs,
			}),
		/**
		 * Stream a Blob the expression evaluates to into a file.
		 * @param expression An expression whose value is a Blob.
		 * @param path Where to write it.
		 * @param timeoutMs How long the whole stream may take.
		 * @returns How many bytes were written.
		 */
		saveBlob: async (expression, path, timeoutMs) => {
			const remote = await page.evaluate(expression, {
				returnByValue: false,
				timeoutMs: RECORDING_CALL_MS,
			});
			const objectId = isJsonRecord(remote) ? remote["objectId"] : undefined;
			if (typeof objectId !== "string") {
				throw new RecordingPageError("The canvas page finished without a file to hand over.", true);
			}
			return (await page.readBlobTo(objectId, path, timeoutMs)).bytes;
		},
	};
}

/**
 * Open the recording page: a window the reference size, the theme asked for, the microphone
 * granted, then the page itself.
 * @param chromium The browser.
 * @param request What to record.
 * @returns The page.
 */
async function openRecordingPage(
	chromium: HeadlessChromium,
	request: WalkthroughRecordingRequest,
): Promise<DevTools> {
	const url = pageUrl(request);
	await chromium.browser.call(
		"Browser.grantPermissions",
		{ origin: new URL(url).origin, permissions: ["audioCapture"] },
		RECORDING_CALL_MS,
	);
	const { page } = await chromium.openWindow("about:blank", SHELL_VIEWPORT, RECORDING_CALL_MS);
	await page.call(
		"Emulation.setEmulatedMedia",
		{ features: [{ name: "prefers-color-scheme", value: request.theme }] },
		RECORDING_CALL_MS,
	);
	await page.call("Page.navigate", { url }, RECORDING_CALL_MS);
	return page;
}

/**
 * Start the recording's browser.
 * @param request What to record.
 * @param microphone The silent file the fake microphone plays.
 * @returns The browser.
 * @throws {WalkthroughRecordingError} When there is no browser, or it would not start.
 */
async function startBrowser(
	request: WalkthroughRecordingRequest,
	microphone: string,
): Promise<HeadlessChromium> {
	const chromiumPath = request.chromiumPath ?? discoveredChromiumPath();
	try {
		return await launchHeadlessChromium({
			chromiumPath,
			extraArgs: recordingFlags(microphone),
			startupTimeoutMs: RECORDING_BROWSER_START_MS,
			cleanupTimeoutMs: RECORDING_BROWSER_STOP_MS,
			tempRootPrefix: "archboard-recording-",
			signal: request.signal,
		});
	} catch (error) {
		if (!(error instanceof HeadlessChromiumError)) throw error;
		throw new WalkthroughRecordingError("RECORDER_UNAVAILABLE", error.message, error);
	}
}

/**
 * Record while the browser is up, writing the file beside where it goes and moving it into
 * place only once it is whole.
 * @param chromium The browser.
 * @param request What to record.
 * @returns The finished recording.
 */
async function recordIn(
	chromium: HeadlessChromium,
	request: WalkthroughRecordingRequest,
): Promise<RecordedWalkthrough> {
	const page = await openRecordingPage(chromium, request);
	const partial = join(dirname(request.out), `.${Date.now()}.recording.partial`);
	try {
		const { state, bytes } = await drive(pageHandle(page), {
			container: request.container,
			path: partial,
			signal: request.signal,
			onProgress: request.onProgress,
		});
		renameSync(partial, request.out);
		return {
			file: request.out,
			bytes,
			mimeType: state.mimeType ?? "",
			durationMs: Math.round(state.durationMs ?? 0),
			steps: state.of ?? 0,
		};
	} finally {
		rmSync(partial, { force: true });
	}
}

/**
 * Record one walkthrough to a video file.
 * @param request What to record, and where.
 * @returns The finished recording.
 * @throws {WalkthroughRecordingError} When it did not happen; nothing is written then.
 */
async function recordWalkthrough(
	request: WalkthroughRecordingRequest,
): Promise<RecordedWalkthrough> {
	const scratch = mkdtempSync(join(tmpdir(), "archboard-recording-"));
	const microphone = join(scratch, "silence.wav");
	writeSilence(microphone);
	try {
		const chromium = await startBrowser(request, microphone);
		try {
			return await recordIn(chromium, request);
		} finally {
			await chromium.stop();
		}
	} catch (error) {
		if (!(error instanceof RecordingPageError)) throw error;
		throw new WalkthroughRecordingError(
			error.began ? "RECORDING_FAILED" : "RECORDING_REFUSED",
			error.message,
			error,
		);
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

export {
	WalkthroughRecordingError,
	recordWalkthrough,
	type RecordedWalkthrough,
	type WalkthroughRecordingErrorCode,
	type WalkthroughRecordingRequest,
};
