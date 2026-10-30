// Rendering a recorded talk to a video file, frame by frame (TASK-381).
//
// The picture is not captured while the voice speaks. It is drawn afterwards, by the Archboard
// server's own page opened as a replay in a private headless Chromium: the page is given the
// talk and how loud its voice is on each frame (the page never hears the voice itself), and draws
// frame n when asked for it, on a clock the page controls, so every frame is
// fully drawn whatever the machine is doing. Each frame is screenshotted as a JPEG and written to
// one ffmpeg, which encodes the frames with the talk's voice. The file is written beside where it
// goes and renamed into place only once ffmpeg has finished it.
//
// A screenshot costs several times what drawing a frame does, so a long talk is drawn by several
// pages at once, each in a browser of its own (TASK-382). Every page draws every frame, since a
// frame depends on the ones before it, but each takes the screenshots of its own seconds only,
// and the frames reach ffmpeg in order (`frame-order.ts`). A frame is the same whichever page
// drew it.
//
// There is no capture, microphone or autoplay here, and no GPU: the browser rasterizes and
// composites in software, so a frame is the same on every machine.

import { renameSync, rmSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import type { DiagramTheme, LayoutEngineName } from "@archboard/board/render-reply";
import { SHELL_VIEWPORT } from "@archboard/renderer/shell-geometry";
import { RECORDER_MS } from "@archboard/timing";
import type { RecordingContainer } from "#shared/protocol/recording-page.ts";
import {
	REPLAY_PAGE_GLOBAL,
	REPLAY_SEARCH_PARAM,
	TALK_FRAME_RATE,
	TALK_VOICE_FILE,
	framesOf,
	voiceLevels,
	type ReplayOptions,
	type Talk,
} from "#shared/protocol/talk.ts";
import {
	isJsonRecord,
	type HeadlessChromium,
	type HeadlessWindow,
} from "@archboard/renderer/headless-chromium";
import { openVideoEncoder, type VideoEncoder } from "#runtime/processes/video-encoder.ts";
import { type FfmpegCommand } from "#runtime/services/ffmpeg.ts";
import { WalkthroughRecordingError } from "#runtime/operations/recording-errors.ts";
import { FrameOrder } from "#runtime/operations/frame-order.ts";
import { voiceSamples } from "#runtime/store/talk-files.ts";
import { resolveEncoder, startBrowser } from "#runtime/services/recording-tools.ts";

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
	/** Which layout engine the page lays the board out with. */
	readonly layout: LayoutEngineName;
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
	/** How many pages draw it at once; as many as this machine and the talk's length warrant when absent. */
	readonly pages?: number;
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

/** The frames each page screenshots in turn: one second of video. */
const CHUNK_FRAMES = TALK_FRAME_RATE;

/**
 * How many chunks per page a frame may be put ahead of the encoder. Every page's chunk in hand
 * fits in one round, so two rounds never hold a page back that the encoder is waiting for.
 */
const AHEAD_ROUNDS = 2;

/**
 * The most pages that draw one talk. Measured on 2026-09-30 at 1920x1080: one page takes 38 ms a
 * frame, and six pages at once take 53 ms each, 9 ms a frame together.
 */
const MOST_PAGES = 6;

/** The threads of this machine one page keeps busy: its renderer, its compositor and raster. */
const THREADS_PER_PAGE = 4;

/** A page earns its start (a browser, the page and the talk loaded) only past this many frames. */
const FRAMES_PER_PAGE = 300;

const PAGE = `window[${JSON.stringify(REPLAY_PAGE_GLOBAL)}]`;

/**
 * What the render's browser is started with, beyond what every private browser is.
 *
 * It draws in software, on purpose: a frame then depends on nothing but the talk (ADR 0041 records
 * the GPU measurement behind that). The screen is larger than the window, or the window is held to
 * the headless default. The page's timers and frames must not slow down because the window is not
 * looked at.
 * @returns The extra flags.
 */
function renderFlags(): readonly string[] {
	return [
		"--disable-gpu",
		// A screenshot otherwise waits for the display's next frames: 79 ms a frame with the limit,
		// 36 ms without it, measured on 2026-09-30.
		"--disable-frame-rate-limit",
		"--disable-gpu-vsync",
		// A partial raster reuses a tile's old content, so a frame's pixels would depend on how many
		// real frames Chromium drew while the page waited; two renders of a talk then differ.
		"--disable-partial-raster",
		// The first sample of a new SVG must not run ahead of the replay clock on the compositor.
		"--disable-threaded-animation",
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
	const window = await chromium.openWindow("about:blank", SHELL_VIEWPORT, RECORDER_MS.call);
	const { page } = window;
	await page.call(
		"Emulation.setEmulatedMedia",
		{ features: [{ name: "prefers-color-scheme", value: request.theme }] },
		RECORDER_MS.call,
	);
	const url = replayUrl(request.serverUrl);
	const navigation = await page.call("Page.navigate", { url }, RECORDER_MS.call);
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
	const deadline = performance.now() + RECORDER_MS.pageReady;
	for (;;) {
		signal.throwIfAborted();
		// oxlint-disable-next-line no-await-in-loop -- each look waits for the answer of the one before
		const published = await window.page.evaluate(`typeof ${PAGE}?.frame === "function"`, {
			timeoutMs: RECORDER_MS.call,
		});
		if (published === true) return;
		if (performance.now() >= deadline) {
			throw new Error(
				`The canvas page never offered a replay within ${RECORDER_MS.pageReady / 1000} seconds: the Archboard server serves a frontend built without it. Run \`archboard restart\` to build the frontend and restart the server.`,
			);
		}
		// oxlint-disable-next-line no-await-in-loop -- a poll waits between looks
		await delay(RECORDER_MS.poll, undefined, { signal });
	}
}

/**
 * Hand the page the talk and how to render it, and prove it renders as many frames as the talk has.
 * @param window The window.
 * @param request What to render.
 * @param share How many frames the talk has, and how every page renders it.
 * @throws {Error} When the page refuses the talk or counts other frames.
 */
async function loadTalk(
	window: HeadlessWindow,
	request: RenderTalkRequest,
	share: Pick<PageShare, "frames" | "options">,
): Promise<void> {
	const { frames } = share;
	const loaded = await window.page.evaluate(
		`${PAGE}.load(${JSON.stringify(request.talk)}, ${JSON.stringify(share.options)})`,
		{ timeoutMs: RECORDER_MS.frameCall },
	);
	const counted = isJsonRecord(loaded) ? loaded["frames"] : undefined;
	if (counted !== frames) {
		throw new Error(
			`The canvas page counts ${String(counted)} frames in the talk and this archboard counts ${frames}. Run \`archboard restart\` to build the frontend and restart the Archboard server.`,
		);
	}
	const size = await window.page.evaluate("[window.innerWidth, window.innerHeight]", {
		timeoutMs: RECORDER_MS.call,
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
 * How many pages draw a talk: as many as the machine keeps busy, and no more than its length
 * repays.
 * @param frames How many frames the talk has.
 * @returns The pages.
 */
function pagesFor(frames: number): number {
	const machine = Math.floor(availableParallelism() / THREADS_PER_PAGE);
	return Math.max(1, Math.min(MOST_PAGES, machine, Math.ceil(frames / FRAMES_PER_PAGE)));
}

/** One page of a render, and what it shares with the others. */
interface PageShare {
	/** Which page it is, counted from nought. */
	readonly page: number;
	/** How many pages draw the talk. */
	readonly pages: number;
	/** How many frames the talk has. */
	readonly frames: number;
	/** How every page renders the talk: its theme, its layout, and how loud its voice is on each frame. */
	readonly options: ReplayOptions;
	/** Where the frames go, in order. */
	readonly order: FrameOrder;
	/** Stops every page. */
	readonly signal: AbortSignal;
	/**
	 * Told each frame this page handed on.
	 * @param handed How many frames have reached the encoder.
	 */
	readonly handed: (handed: number) => void;
}

/**
 * Screenshot the frame the page holds.
 * @param window The window.
 * @param index The frame.
 * @returns The frame, as a JPEG.
 * @throws {Error} When Chromium returns no picture.
 */
async function screenshot(window: HeadlessWindow, index: number): Promise<Uint8Array> {
	const shot = await window.page.call(
		"Page.captureScreenshot",
		{ format: "jpeg", quality: 92, optimizeForSpeed: true, fromSurface: true },
		RECORDER_MS.call,
	);
	const data = shot["data"];
	if (typeof data !== "string") throw new Error(`Chromium returned no picture of frame ${index}.`);
	return Buffer.from(data, "base64");
}

/**
 * Where a page's drawing ends: after the last frame of its last second of the talk. A page with
 * no second of its own draws nothing.
 * @param share Which page this is, and what it shares with the others.
 * @returns The frame after its last.
 */
function endOf(share: Pick<PageShare, "page" | "pages" | "frames">): number {
	const { page, pages, frames } = share;
	const chunks = Math.ceil(frames / CHUNK_FRAMES);
	const last = chunks - 1 - ((chunks - 1 - page + pages) % pages);
	return last < 0 ? 0 : Math.min(frames, (last + 1) * CHUNK_FRAMES);
}

/**
 * Draw the frames of the talk in order up to this page's last second, and hand on the ones in
 * this page's seconds.
 * @param window The window.
 * @param share Which page this is, and what it shares with the others.
 */
async function drawFrames(window: HeadlessWindow, share: PageShare): Promise<void> {
	const { page, pages, order, signal } = share;
	const end = endOf(share);
	for (let index = 0; index < end; index++) {
		signal.throwIfAborted();
		const mine = Math.floor(index / CHUNK_FRAMES) % pages === page;
		// oxlint-disable-next-line no-await-in-loop -- a page runs only so far ahead of the encoder
		if (mine) await order.room(index, signal);
		// oxlint-disable-next-line no-await-in-loop -- frame n is drawn on the page's clock only after frame n-1
		await window.page.evaluate(`${PAGE}.frame(${index})`, { timeoutMs: RECORDER_MS.frameCall });
		if (!mine) continue;
		// oxlint-disable-next-line no-await-in-loop -- the page holds still only until the next frame is asked for
		const jpeg = await screenshot(window, index);
		// oxlint-disable-next-line no-await-in-loop -- the page goes on once its frame and those it freed are with ffmpeg
		await order.put(index, jpeg);
		share.handed(order.handed());
	}
}

/**
 * Draw the talk on one page in its own browser.
 * @param chromium The page's browser.
 * @param request What to render.
 * @param share Which page this is, and what it shares with the others.
 */
async function renderPage(
	chromium: HeadlessChromium,
	request: RenderTalkRequest,
	share: PageShare,
): Promise<void> {
	const window = await openReplayPage(chromium, request);
	await pageReady(window, share.signal);
	await loadTalk(window, request, share);
	await drawFrames(window, share);
}

/**
 * Start the pages' browsers, all or none.
 * @param request What to render.
 * @param pages How many.
 * @returns The browsers.
 * @throws {WalkthroughRecordingError} With code RECORDER_UNAVAILABLE when one would not start.
 */
async function startBrowsers(
	request: RenderTalkRequest,
	pages: number,
): Promise<readonly HeadlessChromium[]> {
	const started = await Promise.allSettled(
		Array.from({ length: pages }, async () =>
			startBrowser({
				chromiumPath: request.chromiumPath,
				flags: renderFlags(),
				tempRootPrefix: "archboard-render-",
				signal: request.signal,
			}),
		),
	);
	const browsers = started.flatMap((one) => (one.status === "fulfilled" ? [one.value] : []));
	const refused = started.find((one) => one.status === "rejected");
	if (refused === undefined) return browsers;
	await Promise.all(browsers.map(async (chromium) => chromium.stop()));
	throw refused.reason;
}

/**
 * Stop every browser, and say what none of them could prove gone.
 * @param browsers The browsers.
 * @returns What was left behind.
 */
async function stopAll(browsers: readonly HeadlessChromium[]): Promise<readonly string[]> {
	const cleanups = await Promise.all(browsers.map(async (chromium) => chromium.stop()));
	return cleanups.flatMap((cleanup) => (cleanup.clean ? [] : cleanup.errors));
}

/**
 * Draw every frame on the pages, and hand them to the encoder in order. Every page is told how loud
 * the voice is on each frame, measured here from the talk's voice. The first page that fails stops
 * the others.
 * @param browsers One browser per page.
 * @param request What to render.
 * @param encoder Takes the frames.
 * @param frames How many frames the talk has.
 * @throws {unknown} What stopped the first page that failed.
 */
async function drawOnPages(
	browsers: readonly HeadlessChromium[],
	request: RenderTalkRequest,
	encoder: VideoEncoder,
	frames: number,
): Promise<void> {
	const pages = browsers.length;
	const stop = new AbortController();
	/** Stop every page when the render is cancelled. */
	const cancel = (): void => {
		stop.abort(request.signal.reason);
	};
	request.signal.addEventListener("abort", cancel, { once: true });
	const order = new FrameOrder(encoder, AHEAD_ROUNDS * pages * CHUNK_FRAMES);
	const options: ReplayOptions = {
		theme: request.theme,
		layout: request.layout,
		levels: voiceLevels(voiceSamples(join(request.directory, TALK_VOICE_FILE))),
	};
	let said = 0;
	/**
	 * Say how far the render is, once a second of video.
	 * @param count How many frames have reached the encoder.
	 */
	const handed = (count: number): void => {
		// Two pages can both see the last frame handed on; it is said once.
		if (count === said || (count - said < PROGRESS_EVERY_FRAMES && count !== frames)) return;
		said = count;
		request.say(`Rendered ${count} of ${frames} frames.`);
	};
	try {
		const drawn = await Promise.allSettled(
			browsers.map(async (chromium, page) =>
				renderPage(chromium, request, {
					page,
					pages,
					frames,
					options,
					order,
					signal: stop.signal,
					handed,
				}).catch((error: unknown) => {
					stop.abort(error);
					throw error;
				}),
			),
		);
		if (drawn.some((one) => one.status === "rejected")) throw stop.signal.reason;
	} finally {
		request.signal.removeEventListener("abort", cancel);
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
		`Rendering the talk failed: ${why}${also} The talk is kept in ${request.directory}; render it again with: archboard model replay ${request.directory} --out <file>`,
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
	const frames = framesOf(request.talk);
	const browsers = await startBrowsers(request, request.pages ?? pagesFor(frames));
	const partial = join(dirname(request.out), `.${Date.now()}.recording.partial`);
	/** Stop the browsers the moment the render is cancelled, so no call waits on them. */
	const cancel = (): void => {
		void stopAll(browsers);
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
		await drawOnPages(browsers, request, encoder, frames);
		// The picture is drawn: free the browsers before ffmpeg finishes the file.
		const leftBehind = await stopAll(browsers);
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
			leftBehind,
		};
	} catch (error) {
		encoder?.abort();
		signal.throwIfAborted();
		throw renderFailed(error, request, await stopAll(browsers));
	} finally {
		signal.removeEventListener("abort", cancel);
		await stopAll(browsers);
		rmSync(partial, { force: true });
	}
}

export { renderFlags, renderTalk, type RenderTalkRequest, type RenderedTalk };
