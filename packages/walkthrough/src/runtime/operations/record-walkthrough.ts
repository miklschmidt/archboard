// Recording one walkthrough of a board to a video file, narrated by the Codex
// voice (TASK-304), in two passes (TASK-381).
//
// The recorder first proves it has an ffmpeg that can encode the file (ARCHBOARD_FFMPEG, else
// PATH, else nixpkgs' through Nix), so a machine that cannot refuses before any voice
// session or browser starts.
//
// Pass one is the talk. The Archboard server's own page, opened on the board in a private
// headless Chromium the recorder owns, shows the one pane and paces the talk by the voice. It
// keeps the voice and what happened while the voice spoke. The recorder starts the browser the
// way the page needs it (a window exactly the reference size, audio allowed to play, a silent
// microphone granted), drives the page through the shared recording contract, takes the talk
// out and tears the browser down, whatever happened. It runs against the server the CLI talks
// to, because that server owns the Codex sign-in the voice needs. The talk is kept with the
// board and vault check it was drawn from.
//
// Pass two renders the picture from the kept talk frame by frame (`render-talk.ts`), with no
// voice at all. A render that fails keeps the talk, so it can be rendered again with
// `archboard semantic replay`. An interrupt tears either browser down at once, so every call
// still waiting on it fails and no file is written.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DiagramTheme, LayoutEngineName } from "@archboard/board/render-reply";
import type { SemanticBoard } from "@archboard/board/document";
import type { VaultCheck } from "@archboard/board/policy";
import { SHELL_VIEWPORT } from "@archboard/renderer/shell-geometry";
import { RECORDER_MS } from "@archboard/timing";
import {
	RECORDING_AGAINST_SEARCH_PARAM,
	RECORDING_LANGUAGE_SEARCH_PARAM,
	RECORDING_SEARCH_PARAM,
	type RecordingContainer,
	type RecordingState,
} from "#shared/protocol/recording-page.ts";
import {
	TALK_FORMAT,
	TALK_SAMPLE_RATE,
	TALK_VERSION,
	TALK_VOICE_FILE,
	TalkSchema,
	type Talk,
	type TalkLog,
} from "#shared/protocol/talk.ts";
import {
	isJsonRecord,
	type HeadlessChromium,
	type HeadlessWindow,
} from "@archboard/renderer/headless-chromium";

import { WalkthroughRecordingError } from "#runtime/operations/recording-errors.ts";
import { resolveEncoder, startBrowser } from "#runtime/services/recording-tools.ts";
import {
	RecordingPageError,
	drive,
	messageOf,
	type RecordingPageHandle,
} from "#runtime/clients/recording-page.ts";
import { renderTalk } from "#runtime/operations/render-talk.ts";
import { writeSilence } from "#runtime/store/silence.ts";
import { voiceSamples, writeTalk, type TalkPlace } from "#runtime/store/talk-files.ts";

/** What to record, and where. */
interface WalkthroughRecordingRequest {
	/** The server the page is served by. */
	readonly serverUrl: string;
	/** The board as it was read before the talk, which the talk keeps and is drawn from. */
	readonly board: SemanticBoard;
	/** The vault check the board is drawn under, which the talk keeps. */
	readonly policy: VaultCheck;
	/** The variant asked for, by id, or null for the one that is current. */
	readonly variant: string | null;
	/** The variant every picture of the talk is read against, by id, or null for the usual one. */
	readonly against: string | null;
	/**
	 * The repository the board is in, as the browser names it (ADR 0050): an
	 * identity or an untracked vault's registry name. Null opens the page in the
	 * vault the server opens a page in.
	 */
	readonly repository: string | null;
	/** The walkthrough. */
	readonly walkthrough: { readonly id: string; readonly name: string };
	/** The language the voice narrates it in, as a BCP 47 tag. */
	readonly language: string;
	readonly container: RecordingContainer;
	/** Which palette the picture is rendered in. */
	readonly theme: DiagramTheme;
	/** Which layout engine the picture is laid out with, which the talk keeps. */
	readonly layout: LayoutEngineName;
	/** The file to write, absolute. */
	readonly out: string;
	/** Where the talk is kept, already proven free. */
	readonly talk: TalkPlace;
	readonly signal: AbortSignal;
	/**
	 * Told each new phase and step of the talk.
	 * @param state The page's state.
	 */
	readonly onProgress: (state: RecordingState) => void;
	/**
	 * Told what the recorder is doing outside the talk, in a sentence.
	 * @param line The sentence.
	 */
	readonly say: (line: string) => void;
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
	/** How many frames the video has. */
	readonly frames: number;
	/** Where the talk is kept. */
	readonly talk: string;
	/** What stopping either browser could not prove gone; empty when both were clean. */
	readonly leftBehind: readonly string[];
}

/**
 * What the recording page's address names: the board in pane A, the repository
 * it is in, the walkthrough, the language and the variant it is read against. It is read by the browser's own
 * workspace address, so it is the contract between the recorder and the page.
 */
type RecordingPageAddress = Pick<
	WalkthroughRecordingRequest,
	"serverUrl" | "variant" | "repository" | "language" | "against"
> & {
	readonly board: Pick<SemanticBoard, "name">;
	readonly walkthrough: Pick<WalkthroughRecordingRequest["walkthrough"], "id">;
};

/**
 * The address of the recording page.
 * @param request What to record.
 * @returns The page's URL.
 */
function recordingPageUrl(request: RecordingPageAddress): string {
	const url = new URL("/", request.serverUrl);
	const { board, variant } = request;
	url.searchParams.set("paneA", variant === null ? board.name : `${board.name}@${variant}`);
	if (request.repository !== null) url.searchParams.set("repoA", request.repository);
	url.searchParams.set(RECORDING_SEARCH_PARAM, request.walkthrough.id);
	url.searchParams.set(RECORDING_LANGUAGE_SEARCH_PARAM, request.language);
	if (request.against !== null) {
		url.searchParams.set(RECORDING_AGAINST_SEARCH_PARAM, request.against);
	}
	return url.toString();
}

/**
 * What the recording's browser is started with, beyond what every private browser is.
 * @param microphone The silent file the fake microphone plays.
 * @returns The extra flags.
 */
function recordingFlags(microphone: string): readonly string[] {
	return [
		// A screen larger than the window, or the window is held to the headless default.
		"--screen-info={2560x1600}",
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
 * @param window The page's window.
 * @returns The handle.
 */
function pageHandle(window: HeadlessWindow): RecordingPageHandle {
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
				timeoutMs: RECORDER_MS.call,
			});
			const objectId = isJsonRecord(remote) ? remote["objectId"] : undefined;
			if (typeof objectId !== "string") {
				throw new RecordingPageError("The canvas page finished without a talk to hand over.", true);
			}
			return (await page.readBlobTo(objectId, path, readTimeoutMs)).bytes;
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
	const url = recordingPageUrl(request);
	try {
		await chromium.browser.call(
			"Browser.grantPermissions",
			{ origin: new URL(url).origin, permissions: ["audioCapture"] },
			RECORDER_MS.call,
		);
		const window = await chromium.openWindow("about:blank", SHELL_VIEWPORT, RECORDER_MS.call);
		const { page } = window;
		await page.call(
			"Emulation.setEmulatedMedia",
			{ features: [{ name: "prefers-color-scheme", value: request.theme }] },
			RECORDER_MS.call,
		);
		const navigation = await page.call("Page.navigate", { url }, RECORDER_MS.call);
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
 * Record the talk while the browser is up, its voice into a file.
 * @param chromium The browser.
 * @param request What to record.
 * @param voice Where the voice goes.
 * @returns The page's last state and the talk's log.
 * @throws {RecordingPageError} When it did not happen.
 */
async function talkIn(
	chromium: HeadlessChromium,
	request: WalkthroughRecordingRequest,
	voice: string,
): Promise<{ readonly state: RecordingState; readonly log: TalkLog }> {
	request.signal.throwIfAborted();
	const window = await openRecordingPage(chromium, request);
	return drive(pageHandle(window), {
		voice,
		signal: request.signal,
		onProgress: request.onProgress,
	});
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
 * Record the talk in a started browser and stop it, whatever happened: at once when the
 * recording is cancelled, so every call still waiting on it fails rather than running on.
 * @param chromium The browser.
 * @param request What to record.
 * @param voice Where the voice goes.
 * @returns The talk's log, how many steps it went through, and what the browser left behind.
 * @throws {WalkthroughRecordingError} When it did not happen; the signal's reason when cancelled.
 */
async function talkedWith(
	chromium: HeadlessChromium,
	request: WalkthroughRecordingRequest,
	voice: string,
): Promise<{
	readonly log: TalkLog;
	readonly steps: number;
	readonly leftBehind: readonly string[];
}> {
	/** Stop the browser the moment the recording is cancelled. */
	const cancel = (): void => {
		void chromium.stop();
	};
	request.signal.addEventListener("abort", cancel, { once: true });
	const outcome = await talkIn(chromium, request, voice).then(
		(made) => ({ made }),
		(error: unknown) => ({ error }),
	);
	request.signal.removeEventListener("abort", cancel);
	const cleanup = await chromium.stop();
	const leftBehind = cleanup.clean ? [] : cleanup.errors;
	request.signal.throwIfAborted();
	if ("error" in outcome) throw failure(outcome.error, leftBehind);
	return { log: outcome.made.log, steps: outcome.made.state.of ?? 0, leftBehind };
}

/**
 * The talk a recording page kept, with the board and vault check it was drawn from.
 * @param request What was recorded.
 * @param log What the page kept.
 * @param steps How many steps the talk went through.
 * @returns The talk.
 * @throws {WalkthroughRecordingError} When it cannot be rendered: most often a board that changed
 *   while it was recorded, which no one picture is of.
 */
function talkOf(request: WalkthroughRecordingRequest, log: TalkLog, steps: number): Talk {
	const { board } = request;
	const parsed = TalkSchema.safeParse({
		format: TALK_FORMAT,
		version: TALK_VERSION,
		recordedAt: new Date().toISOString(),
		language: request.language,
		theme: request.theme,
		layout: request.layout,
		board: {
			name: board.name,
			variant: request.variant,
			...(request.against === null ? {} : { against: request.against }),
			version: board.version,
			walkthrough: request.walkthrough,
			steps,
		},
		audio: {
			file: TALK_VOICE_FILE,
			sampleRate: TALK_SAMPLE_RATE,
			channels: 1,
			samples: log.samples,
			baseLatencyMs: log.baseLatencyMs,
		},
		events: log.events,
		document: board,
		policy: request.policy,
	});
	if (parsed.success) return parsed.data;
	const redrawn = log.events.some(
		(event) => event.kind === "drawn" && event.version !== board.version,
	);
	throw new WalkthroughRecordingError(
		"RECORDING_FAILED",
		redrawn
			? `${board.name} changed while it was recorded, so no one picture of it goes with the talk. Record again once nothing is writing it.`
			: `The talk the page kept cannot be rendered: ${parsed.error.message} Record again.`,
	);
}

/**
 * Record the talk and keep it.
 * @param request What to record.
 * @param scratch A directory the caller removes.
 * @returns The kept talk, where it is kept, and what the browser left behind.
 * @throws {WalkthroughRecordingError} When the talk did not happen.
 */
async function keptTalk(
	request: WalkthroughRecordingRequest,
	scratch: string,
): Promise<{
	readonly talk: Talk;
	readonly directory: string;
	readonly leftBehind: readonly string[];
}> {
	const microphone = join(scratch, "silence.wav");
	writeSilence(microphone);
	const chromium = await startBrowser({
		chromiumPath: request.chromiumPath,
		flags: recordingFlags(microphone),
		tempRootPrefix: "archboard-recording-",
		signal: request.signal,
	});
	const voice = join(scratch, TALK_VOICE_FILE);
	const talked = await talkedWith(chromium, request, voice);
	const talk = talkOf(request, talked.log, talked.steps);
	const directory = writeTalk({ talk, voice: voiceSamples(voice), place: request.talk });
	request.say(`Kept the talk in ${directory}.`);
	return { talk, directory, leftBehind: talked.leftBehind };
}

/**
 * Record one walkthrough to a video file: the talk, kept, then its picture rendered frame by frame.
 * @param request What to record, and where.
 * @returns The finished recording.
 * @throws {EncoderUnavailableError} With code ENCODER_UNAVAILABLE when no ffmpeg can encode it;
 *   nothing was started then.
 * @throws {WalkthroughRecordingError} When it did not happen; no file is written then, and a
 *   render that failed keeps the talk. A cancelled recording throws the signal's reason.
 */
async function recordWalkthrough(
	request: WalkthroughRecordingRequest,
): Promise<RecordedWalkthrough> {
	const ffmpeg = await resolveEncoder(request.container, request.say, request.signal);
	const scratch = mkdtempSync(join(tmpdir(), "archboard-recording-"));
	try {
		const kept = await keptTalk(request, scratch);
		const rendered = await renderTalk({
			serverUrl: request.serverUrl,
			talk: kept.talk,
			directory: kept.directory,
			container: request.container,
			theme: request.theme,
			layout: request.layout,
			out: request.out,
			signal: request.signal,
			say: request.say,
			ffmpeg,
			...(request.chromiumPath === undefined ? {} : { chromiumPath: request.chromiumPath }),
		});
		return {
			file: rendered.file,
			bytes: rendered.bytes,
			mimeType: rendered.mimeType,
			durationMs: rendered.durationMs,
			steps: kept.talk.board.steps,
			frames: rendered.frames,
			talk: kept.directory,
			leftBehind: [...kept.leftBehind, ...rendered.leftBehind],
		};
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}
export {
	recordWalkthrough,
	recordingFlags,
	recordingPageUrl,
	type RecordedWalkthrough,
	type WalkthroughRecordingRequest,
};
