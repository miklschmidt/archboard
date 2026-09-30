// Recording one walkthrough of a board to a video file, narrated by the Codex
// voice (TASK-304).
//
// The recording is made by the Archboard server's own page, opened on the board in a
// private headless Chromium the recorder owns: the page shows the one pane,
// paces the talk by the voice and captures its own tab. The recorder starts
// the browser the way the page needs it (a window exactly the reference size,
// tab capture accepted without a prompt, audio allowed to play, a silent
// microphone granted), drives the page through the shared recording contract,
// streams the finished file out and tears the browser down, whatever happened.
// An interrupt tears it down at once, so every call still waiting on it fails
// and nothing is written. It runs against the server the CLI talks to, because
// that server owns the Codex sign-in the voice needs.

import { mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { DiagramTheme } from "@/shared/semantic-board/index";
import { SHELL_VIEWPORT } from "@/shared/shell-geometry";
import {
	RECORDING_BROWSER_START_MS,
	RECORDING_BROWSER_STOP_MS,
	RECORDING_CALL_MS,
} from "@/shared/timing/timing";
import {
	RECORDING_LANGUAGE_SEARCH_PARAM,
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
	type HeadlessWindow,
} from "@/runtime/headless-chromium";

import {
	RecordingPageError,
	drive,
	messageOf,
	type RecordingPageHandle,
} from "@/runtime/walkthrough-recorder/lib/drive";
import { discoveredFfmpeg, playableEverywhere } from "@/runtime/walkthrough-recorder/lib/playable";
import { writeSilence } from "@/runtime/walkthrough-recorder/lib/silence";

/** Why a recording did not happen. */
type WalkthroughRecordingErrorCode =
	/** No Chromium-family browser was found, or it would not start. */
	| "RECORDER_UNAVAILABLE"
	/** The page could not start recording, or failed before it showed a step: nothing was recorded. */
	| "RECORDING_REFUSED"
	/** The recording showed a step and did not finish. */
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
	/** The server the page is served by. */
	readonly serverUrl: string;
	/** The board, as a pane addresses it: its name, or name@variant. */
	readonly boardKey: string;
	/** The walkthrough, by id. */
	readonly walkthrough: string;
	/** The language the voice narrates it in, as a BCP 47 tag. */
	readonly language: string;
	readonly container: RecordingContainer;
	/** Which palette the page draws in. */
	readonly theme: DiagramTheme;
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
	/** What stopping the recording's browser could not prove gone; empty when it was clean. */
	readonly leftBehind: readonly string[];
	/** What the caller should be told about how the file plays; empty when nothing. */
	readonly notes: readonly string[];
}

/**
 * The address of the recording page.
 * @param request What to record.
 * @returns The page's URL.
 */
function pageUrl(request: WalkthroughRecordingRequest): string {
	const url = new URL("/", request.serverUrl);
	url.searchParams.set("paneA", request.boardKey);
	url.searchParams.set(RECORDING_SEARCH_PARAM, request.walkthrough);
	url.searchParams.set(RECORDING_LANGUAGE_SEARCH_PARAM, request.language);
	return url.toString();
}

/**
 * What the recording's browser is started with, beyond what every private browser is.
 * @param microphone The silent file the fake microphone plays.
 * @returns The extra flags.
 */
function recordingFlags(microphone: string): readonly string[] {
	return [
		// Composite on the GPU when Chromium finds a usable one: headless Chromium composites in
		// software otherwise, too slowly for a glide under a cross-fade to keep 30 frames a
		// second. Without a usable GPU Chromium falls back to software compositing by itself.
		"--enable-gpu",
		// Rasterize in software as before: GPU rasterization held the capture 67 to 106 ms
		// whenever a step drew new content.
		"--disable-gpu-rasterization",
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
 * Whether a page's viewport is the reference size.
 * @param page The page.
 * @returns True when it is.
 */
async function atReferenceSize(page: DevTools): Promise<boolean> {
	const size = await page.evaluate("[window.innerWidth, window.innerHeight]", {
		timeoutMs: RECORDING_CALL_MS,
	});
	return (
		Array.isArray(size) && size[0] === SHELL_VIEWPORT.width && size[1] === SHELL_VIEWPORT.height
	);
}

/**
 * One page as the page driver speaks to it.
 * @param chromium The browser the page is in.
 * @param window The page's window.
 * @returns The handle.
 */
function pageHandle(chromium: HeadlessChromium, window: HeadlessWindow): RecordingPageHandle {
	const { page } = window;
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
		 * @param readTimeoutMs How long resolving the Blob, and each read of it, may take.
		 * @returns How many bytes were written.
		 */
		saveBlob: async (expression, path, readTimeoutMs) => {
			const remote = await page.evaluate(expression, {
				returnByValue: false,
				timeoutMs: RECORDING_CALL_MS,
			});
			const objectId = isJsonRecord(remote) ? remote["objectId"] : undefined;
			if (typeof objectId !== "string") {
				throw new RecordingPageError("The canvas page finished without a file to hand over.", true);
			}
			return (await page.readBlobTo(objectId, path, readTimeoutMs)).bytes;
		},
		/**
		 * Size the window again whenever the browser took room from the page.
		 * @returns When the page is the reference size.
		 */
		keepSize: async () => {
			if (await atReferenceSize(page)) return;
			await chromium.fitWindow(window, SHELL_VIEWPORT, RECORDING_CALL_MS);
		},
	};
}

/**
 * Open the recording page: a window the reference size, the theme asked for, the microphone
 * granted, then the page itself.
 * @param chromium The browser.
 * @param request What to record.
 * @returns The page.
 * @throws {RecordingPageError} When the page could not be opened; nothing was recorded.
 */
async function openRecordingPage(
	chromium: HeadlessChromium,
	request: WalkthroughRecordingRequest,
): Promise<HeadlessWindow> {
	const url = pageUrl(request);
	try {
		await chromium.browser.call(
			"Browser.grantPermissions",
			{ origin: new URL(url).origin, permissions: ["audioCapture"] },
			RECORDING_CALL_MS,
		);
		const window = await chromium.openWindow("about:blank", SHELL_VIEWPORT, RECORDING_CALL_MS);
		const { page } = window;
		await page.call(
			"Emulation.setEmulatedMedia",
			{ features: [{ name: "prefers-color-scheme", value: request.theme }] },
			RECORDING_CALL_MS,
		);
		const navigation = await page.call("Page.navigate", { url }, RECORDING_CALL_MS);
		const refused = navigation["errorText"];
		if (typeof refused === "string" && refused !== "") {
			throw new Error(
				`Chromium could not open ${url}: ${refused}. Check the Archboard server is running.`,
			);
		}
		return window;
	} catch (error) {
		throw new RecordingPageError(messageOf(error), false);
	}
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
 * Record while the browser is up, into a file beside where it goes. Moving it into place is
 * the caller's, once the browser is stopped.
 * @param chromium The browser.
 * @param request What to record.
 * @param partial Where to write it.
 * @returns The finished recording.
 * @throws {RecordingPageError} When it did not happen.
 */
async function recordIn(
	chromium: HeadlessChromium,
	request: WalkthroughRecordingRequest,
	partial: string,
): Promise<Omit<RecordedWalkthrough, "leftBehind" | "notes">> {
	request.signal.throwIfAborted();
	const window = await openRecordingPage(chromium, request);
	const { state, bytes } = await drive(pageHandle(chromium, window), {
		container: request.container,
		path: partial,
		signal: request.signal,
		onProgress: request.onProgress,
	});
	return {
		file: request.out,
		bytes,
		mimeType: state.mimeType ?? "",
		durationMs: Math.round(state.durationMs ?? 0),
		steps: state.of ?? 0,
	};
}

/**
 * The recorded file made to play with sound everywhere it can, or what stopped the recording.
 * @param outcome What recording in the browser came to.
 * @param partial Where the file was written.
 * @param signal Cancels making it playable.
 * @returns The finished recording, before it moves into place.
 * @throws {unknown} What stopped the recording.
 */
async function playableRecording(
	outcome:
		| { readonly made: Omit<RecordedWalkthrough, "leftBehind" | "notes"> }
		| { readonly error: unknown },
	partial: string,
	signal: AbortSignal,
): Promise<Omit<RecordedWalkthrough, "leftBehind">> {
	if ("error" in outcome) throw outcome.error;
	const played = await playableEverywhere(partial, outcome.made.mimeType, {
		ffmpeg: discoveredFfmpeg(),
		signal,
	});
	return { ...outcome.made, mimeType: played.mimeType, bytes: played.bytes, notes: played.notes };
}

/**
 * Move a whole recording to where it goes, synchronously.
 * @param partial Where it was written.
 * @param out Where it goes.
 * @throws {RecordingPageError} When it could not be moved; the talk was recorded.
 */
function moveIntoPlace(partial: string, out: string): void {
	try {
		renameSync(partial, out);
	} catch (error) {
		throw new RecordingPageError(messageOf(error), true);
	}
}

/**
 * What a recording that did not happen fails with.
 * @param error What stopped it.
 * @param leftBehind What stopping its browser could not prove gone.
 * @returns The recording's failure, or the error itself when it is not the page's.
 */
function failure(error: unknown, leftBehind: readonly string[]): unknown {
	if (!(error instanceof RecordingPageError)) return error;
	const also =
		leftBehind.length === 0
			? ""
			: `\nStopping the recording's browser also failed: ${leftBehind.join("; ")}`;
	return new WalkthroughRecordingError(
		error.began ? "RECORDING_FAILED" : "RECORDING_REFUSED",
		`${error.message}${also}`,
		error,
	);
}

/**
 * Record in a started browser and stop it, whatever happened: at once when the recording is
 * cancelled, so every call still waiting on it fails rather than running on. The file moves
 * into place only once the browser is stopped, in the same synchronous turn as the last look
 * at the signal, so an interrupt that lands anywhere leaves nothing where it goes.
 * @param chromium The browser.
 * @param request What to record.
 * @returns The finished recording.
 * @throws {WalkthroughRecordingError} When it did not happen; the signal's reason when cancelled.
 */
async function recordedWith(
	chromium: HeadlessChromium,
	request: WalkthroughRecordingRequest,
): Promise<RecordedWalkthrough> {
	/** Stop the browser the moment the recording is cancelled. */
	const cancel = (): void => {
		void chromium.stop();
	};
	const partial = join(dirname(request.out), `.${Date.now()}.recording.partial`);
	try {
		request.signal.addEventListener("abort", cancel, { once: true });
		const outcome = await recordIn(chromium, request, partial).then(
			(made) => ({ made }),
			(error: unknown) => ({ error }),
		);
		request.signal.removeEventListener("abort", cancel);
		const cleanup = await chromium.stop();
		const leftBehind = cleanup.clean ? [] : cleanup.errors;
		try {
			const made = await playableRecording(outcome, partial, request.signal);
			// Nothing from here awaits, so no interrupt lands between this look and the file moving in.
			request.signal.throwIfAborted();
			moveIntoPlace(partial, request.out);
			return { ...made, leftBehind };
		} catch (error) {
			throw failure(error, leftBehind);
		}
	} finally {
		rmSync(partial, { force: true });
	}
}

/**
 * Record one walkthrough to a video file.
 * @param request What to record, and where.
 * @returns The finished recording.
 * @throws {WalkthroughRecordingError} When it did not happen; nothing is written then. A cancelled
 *   recording throws the signal's reason, and writes nothing either.
 */
async function recordWalkthrough(
	request: WalkthroughRecordingRequest,
): Promise<RecordedWalkthrough> {
	const scratch = mkdtempSync(join(tmpdir(), "archboard-recording-"));
	try {
		const microphone = join(scratch, "silence.wav");
		writeSilence(microphone);
		return await recordedWith(await startBrowser(request, microphone), request);
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

export { playableEverywhere } from "@/runtime/walkthrough-recorder/lib/playable";
export {
	WalkthroughRecordingError,
	drive,
	recordWalkthrough,
	recordingFlags,
	type RecordedWalkthrough,
	type RecordingPageHandle,
	type WalkthroughRecordingErrorCode,
	type WalkthroughRecordingRequest,
};
