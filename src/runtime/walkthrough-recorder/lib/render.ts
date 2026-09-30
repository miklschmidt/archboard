// Rendering a recorded talk to a video file, frame by frame (TASK-381).
//
// The picture is not captured while the voice speaks. It is drawn afterwards, by the Archboard
// server's own page opened as a replay in a private headless Chromium: the page is given the
// talk, and draws frame n when asked for it, on a clock the page controls, so every frame is
// fully drawn whatever the machine is doing. Each frame is screenshotted as a JPEG and written to
// one ffmpeg, which encodes the frames with the talk's voice. The file is written beside where it
// goes and renamed into place only once ffmpeg has finished it.
//
// There is no capture, microphone or autoplay here, and no GPU: the browser rasterizes and
// composites in software, so a frame is the same on every machine.

import { renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import type { DiagramTheme } from "@/shared/semantic-board/index";
import { SHELL_VIEWPORT } from "@/shared/shell-geometry";
import {
	RECORDING_CALL_MS,
	RECORDING_FRAME_CALL_MS,
	RECORDING_PAGE_READY_MS,
	RECORDING_POLL_MS,
} from "@/shared/timing/timing";
import type { RecordingContainer } from "@/shared/walkthrough-recording";
import {
	REPLAY_PAGE_GLOBAL,
	REPLAY_SEARCH_PARAM,
	TALK_FRAME_RATE,
	TALK_VOICE_FILE,
	framesOf,
	type Talk,
} from "@/shared/walkthrough-recording/talk";
import {
	isJsonRecord,
	type HeadlessChromium,
	type HeadlessWindow,
} from "@/runtime/headless-chromium";
import { openVideoEncoder, type FfmpegCommand, type VideoEncoder } from "@/runtime/video-encoder";
import { WalkthroughRecordingError } from "@/runtime/walkthrough-recorder/lib/errors";
import { resolveEncoder, startBrowser } from "@/runtime/walkthrough-recorder/lib/tools";

/** What to render, and where. */
interface RenderTalkRequest {
	/** The Archboard server that serves the replay page. */
	readonly serverUrl: string;
	/** The talk, read from its directory. */
	readonly talk: Talk;
	/** The talk's directory, which holds its voice and is named when the render fails. */
	readonly directory: string;
	readonly container: RecordingContainer;
	/** Which palette the page draws in. */
	readonly theme: DiagramTheme;
	/** The file to write, absolute. */
	readonly out: string;
	readonly signal: AbortSignal;
	/**
	 * Told what the render is doing, in a sentence.
	 * @param line The sentence.
	 */
	readonly say: (line: string) => void;
	/** The browser to render in; the one the environment names or this machine has otherwise. */
	readonly chromiumPath?: string;
	/** An ffmpeg already proven able to encode the container; found and proven here when absent. */
	readonly ffmpeg?: FfmpegCommand;
}

/** A finished render. */
interface RenderedTalk {
	readonly file: string;
	readonly bytes: number;
	readonly mimeType: string;
	/** How many frames the video has. */
	readonly frames: number;
	/** How long the video plays. */
	readonly durationMs: number;
	/** What stopping the render's browser could not prove gone; empty when it was clean. */
	readonly leftBehind: readonly string[];
}

/** Say how far the render is every this many frames: once a second of video. */
const PROGRESS_EVERY_FRAMES = TALK_FRAME_RATE;

const PAGE = `window[${JSON.stringify(REPLAY_PAGE_GLOBAL)}]`;

/**
 * What the render's browser is started with, beyond what every private browser is.
 *
 * It draws in software, on purpose: a frame then depends on nothing but the talk. The screen is
 * larger than the window, or the window is held to the headless default. The page's timers and
 * frames must not slow down because the window is not looked at.
 * @returns The extra flags.
 */
function renderFlags(): readonly string[] {
	return [
		"--disable-gpu",
		// A partial raster reuses a tile's old content, so a frame's pixels would depend on how many
		// real frames Chromium drew while the page waited; two renders of a talk then differ.
		"--disable-partial-raster",
		"--hide-scrollbars",
		"--force-device-scale-factor=1",
		"--force-color-profile=srgb",
		"--mute-audio",
		"--screen-info={2560x1600}",
		"--disable-background-timer-throttling",
		"--disable-renderer-backgrounding",
		"--disable-backgrounding-occluded-windows",
	];
}

/**
 * The address of the replay page.
 * @param serverUrl The server that serves it.
 * @returns The URL.
 */
function replayUrl(serverUrl: string): string {
	const url = new URL("/", serverUrl);
	url.searchParams.set(REPLAY_SEARCH_PARAM, "1");
	return url.toString();
}

/**
 * Open the replay page: a window the reference size, the theme asked for, then the page.
 * @param chromium The browser.
 * @param request What to render.
 * @returns The window.
 * @throws {Error} When the page could not be opened.
 */
async function openReplayPage(
	chromium: HeadlessChromium,
	request: RenderTalkRequest,
): Promise<HeadlessWindow> {
	const window = await chromium.openWindow("about:blank", SHELL_VIEWPORT, RECORDING_CALL_MS);
	const { page } = window;
	await page.call(
		"Emulation.setEmulatedMedia",
		{ features: [{ name: "prefers-color-scheme", value: request.theme }] },
		RECORDING_CALL_MS,
	);
	const url = replayUrl(request.serverUrl);
	const navigation = await page.call("Page.navigate", { url }, RECORDING_CALL_MS);
	const refused = navigation["errorText"];
	if (typeof refused === "string" && refused !== "") {
		throw new Error(
			`Chromium could not open ${url}: ${refused}. Check the Archboard server is running.`,
		);
	}
	return window;
}

/**
 * Wait for the page to publish its replay.
 * @param window The window.
 * @param signal Cancels the wait.
 * @throws {Error} When the page never publishes it: the server serves a frontend built without.
 */
async function pageReady(window: HeadlessWindow, signal: AbortSignal): Promise<void> {
	const deadline = performance.now() + RECORDING_PAGE_READY_MS;
	for (;;) {
		signal.throwIfAborted();
		// oxlint-disable-next-line no-await-in-loop -- each look waits for the answer of the one before
		const published = await window.page.evaluate(`typeof ${PAGE}?.frame === "function"`, {
			timeoutMs: RECORDING_CALL_MS,
		});
		if (published === true) return;
		if (performance.now() >= deadline) {
			throw new Error(
				`The canvas page never offered a replay within ${RECORDING_PAGE_READY_MS / 1000} seconds: the Archboard server serves a frontend built without it. Rebuild the frontend (bun run build:frontend) and restart the server.`,
			);
		}
		// oxlint-disable-next-line no-await-in-loop -- a poll waits between looks
		await delay(RECORDING_POLL_MS, undefined, { signal });
	}
}

/**
 * Hand the page the talk, and prove it renders as many frames as the talk has.
 * @param window The window.
 * @param request What to render.
 * @param frames How many frames the talk has.
 * @throws {Error} When the page refuses the talk or counts other frames.
 */
async function loadTalk(
	window: HeadlessWindow,
	request: RenderTalkRequest,
	frames: number,
): Promise<void> {
	const loaded = await window.page.evaluate(
		`${PAGE}.load(${JSON.stringify(request.talk)}, ${JSON.stringify({ theme: request.theme })})`,
		{ timeoutMs: RECORDING_FRAME_CALL_MS },
	);
	const counted = isJsonRecord(loaded) ? loaded["frames"] : undefined;
	if (counted !== frames) {
		throw new Error(
			`The canvas page counts ${String(counted)} frames in the talk and this archboard counts ${frames}. Rebuild the frontend (bun run build:frontend) and restart the Archboard server.`,
		);
	}
	const size = await window.page.evaluate("[window.innerWidth, window.innerHeight]", {
		timeoutMs: RECORDING_CALL_MS,
	});
	if (
		!Array.isArray(size) ||
		size[0] !== SHELL_VIEWPORT.width ||
		size[1] !== SHELL_VIEWPORT.height
	) {
		throw new Error(
			`The render's window is ${String(size)} rather than ${SHELL_VIEWPORT.width}x${SHELL_VIEWPORT.height}, so its frames would not be that size.`,
		);
	}
}

/**
 * Draw every frame of the talk in order, and hand each to the encoder.
 * @param window The window.
 * @param encoder Takes the frames.
 * @param request What to render.
 * @param frames How many frames the talk has.
 */
async function drawFrames(
	window: HeadlessWindow,
	encoder: VideoEncoder,
	request: RenderTalkRequest,
	frames: number,
): Promise<void> {
	for (let index = 0; index < frames; index++) {
		request.signal.throwIfAborted();
		// oxlint-disable-next-line no-await-in-loop -- frame n is drawn on the page's clock only after frame n-1
		await window.page.evaluate(`${PAGE}.frame(${index})`, { timeoutMs: RECORDING_FRAME_CALL_MS });
		// oxlint-disable-next-line no-await-in-loop -- the page holds still only until the next frame is asked for
		const shot = await window.page.call(
			"Page.captureScreenshot",
			{ format: "jpeg", quality: 92, optimizeForSpeed: true, fromSurface: true },
			RECORDING_CALL_MS,
		);
		const data = shot["data"];
		if (typeof data !== "string")
			throw new Error(`Chromium returned no picture of frame ${index}.`);
		// oxlint-disable-next-line no-await-in-loop -- a slow encoder slows the render instead of filling memory
		await encoder.writeFrame(Buffer.from(data, "base64"));
		if ((index + 1) % PROGRESS_EVERY_FRAMES === 0 || index + 1 === frames) {
			request.say(`Rendering frame ${index + 1} of ${frames}.`);
		}
	}
}

/**
 * The failure a render that did not happen is refused with.
 * @param error What stopped it.
 * @param request What was rendered.
 * @param leftBehind What stopping the browser could not prove gone.
 * @returns The refusal, naming the talk that was kept.
 */
function renderFailed(
	error: unknown,
	request: RenderTalkRequest,
	leftBehind: readonly string[],
): WalkthroughRecordingError {
	const why = error instanceof Error ? error.message : String(error);
	const also =
		leftBehind.length === 0 ? "" : ` Stopping the browser also failed: ${leftBehind.join("; ")}`;
	return new WalkthroughRecordingError(
		"RENDER_FAILED",
		`Rendering the talk failed: ${why}${also} The talk is kept in ${request.directory}; render it again with: archboard semantic replay ${request.directory} --out <file>`,
		error,
	);
}

/**
 * Render a recorded talk to a video file.
 * @param request What to render, and where.
 * @returns The finished file.
 * @throws {EncoderUnavailableError} With code ENCODER_UNAVAILABLE when no ffmpeg can encode it;
 *   nothing was started then.
 * @throws {WalkthroughRecordingError} With code RECORDER_UNAVAILABLE when there is no browser, or
 *   RENDER_FAILED when the render did not finish; nothing is written then, and the talk is kept. A
 *   cancelled render throws the signal's reason, and writes nothing either.
 */
async function renderTalk(request: RenderTalkRequest): Promise<RenderedTalk> {
	const { signal } = request;
	const ffmpeg = request.ffmpeg ?? (await resolveEncoder(request.container, request.say, signal));
	const chromium = await startBrowser({
		chromiumPath: request.chromiumPath,
		flags: renderFlags(),
		tempRootPrefix: "archboard-render-",
		signal,
	});
	const frames = framesOf(request.talk);
	const partial = join(dirname(request.out), `.${Date.now()}.recording.partial`);
	/** Stop the browser the moment the render is cancelled. */
	const cancel = (): void => {
		void chromium.stop();
	};
	signal.addEventListener("abort", cancel, { once: true });
	let encoder: VideoEncoder | null = null;
	try {
		encoder = openVideoEncoder({
			command: ffmpeg,
			container: request.container,
			frames,
			voice: join(request.directory, TALK_VOICE_FILE),
			out: partial,
			signal,
		});
		const window = await openReplayPage(chromium, request);
		await pageReady(window, signal);
		await loadTalk(window, request, frames);
		await drawFrames(window, encoder, request, frames);
		// The picture is drawn: free the browser before ffmpeg finishes the file.
		const cleanup = await chromium.stop();
		const made = await encoder.finish();
		// Nothing from here awaits, so no interrupt lands between this look and the file moving in.
		signal.throwIfAborted();
		renameSync(partial, request.out);
		return {
			file: request.out,
			bytes: made.bytes,
			mimeType: made.mimeType,
			frames,
			durationMs: Math.round((frames * 1000) / TALK_FRAME_RATE),
			leftBehind: cleanup.clean ? [] : cleanup.errors,
		};
	} catch (error) {
		encoder?.abort();
		signal.throwIfAborted();
		const cleanup = await chromium.stop();
		throw renderFailed(error, request, cleanup.clean ? [] : cleanup.errors);
	} finally {
		signal.removeEventListener("abort", cancel);
		await chromium.stop();
		rmSync(partial, { force: true });
	}
}

export { renderFlags, renderTalk, type RenderTalkRequest, type RenderedTalk };
