import type { ArchitectureModelRead } from "@archboard/board/model";
// Driving one recording page from outside it (TASK-304).
//
// The page paces the talk itself; the recorder only follows it. It reads the
// page's state until the page can start, starts it from a user gesture,
// reads the state again as the talk goes, saying each new step, and once the
// page says the talk is finished it streams the voice out and reads the log
// (TASK-381). Everything the page says crosses as the shared recording state
// and talk log and is parsed as such, so a page from another build is refused
// rather than guessed at.
//
// A cancelled recording goes no further than the call it is waiting on,
// whatever that call is: nothing after an interrupt is started or saved.

import { setTimeout as delay } from "node:timers/promises";

import { RECORDER_MS } from "@archboard/timing";
import {
	RECORDING_PAGE_GLOBAL,
	RecordingStateSchema,
	type RecordingState,
} from "#shared/protocol/recording-page.ts";
import { TalkLogSchema, type TalkLog } from "#shared/protocol/talk.ts";

/** One open recording page, as far as the recorder speaks to it. */
interface RecordingPageHandle {
	/**
	 * Evaluate an expression in the page and hand back its value.
	 * @param expression The expression.
	 * @param options Whether it runs as a user gesture, and how long it may take.
	 * @param options.userGesture Whether it runs as if the user had just acted.
	 * @param options.timeoutMs How long it may take.
	 * @returns Its value.
	 */
	readonly evaluate: (
		expression: string,
		options: { readonly userGesture?: boolean; readonly timeoutMs: number },
	) => Promise<unknown>;
	/**
	 * Stream a Blob the expression evaluates to into a file.
	 * @param expression An expression whose value is a Blob.
	 * @param path Where to write it.
	 * @param readTimeoutMs How long each read of the stream may take.
	 * @returns How many bytes were written.
	 */
	readonly saveBlob: (expression: string, path: string, readTimeoutMs: number) => Promise<number>;
}

/** Why a recording did not happen, and whether anything had been recorded. */
class RecordingPageError extends Error {
	/**
	 * Whether the talk had shown a step: before one, nothing was recorded and the page was
	 * refused; after one, the recording failed.
	 */
	readonly began: boolean;

	/**
	 * A recording that did not happen.
	 * @param message What happened and what to do.
	 * @param began Whether the talk had shown a step.
	 */
	constructor(message: string, began: boolean) {
		super(message);
		this.name = "RecordingPageError";
		this.began = began;
	}
}

const PAGE = `window[${JSON.stringify(RECORDING_PAGE_GLOBAL)}]`;

/**
 * The message of anything thrown.
 * @param error What was thrown.
 * @returns Its message.
 */
function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Wait a while, unless the recording is cancelled, or already was.
 * @param ms How long.
 * @param signal Cancels the wait.
 * @returns When the time has passed.
 */
async function pause(ms: number, signal: AbortSignal): Promise<void> {
	await delay(ms, undefined, { signal });
}

/**
 * Wait for one call into the page, and go no further when the recording was cancelled
 * meanwhile, whether the call answered or failed.
 * @param signal Cancels the recording.
 * @param call The call.
 * @returns What the call answered.
 */
async function heeded<T>(signal: AbortSignal, call: Promise<T>): Promise<T> {
	try {
		return await call;
	} finally {
		signal.throwIfAborted();
	}
}

/**
 * The page's state, or null while the page has not published its recording yet.
 * @param page The page.
 * @returns The state.
 * @throws {RecordingPageError} When the page publishes something that is not a recording state.
 */
async function stateOf(page: RecordingPageHandle): Promise<RecordingState | null> {
	const value = await page.evaluate(`${PAGE}?.state() ?? null`, { timeoutMs: RECORDER_MS.call });
	if (value === null) return null;
	const parsed = RecordingStateSchema.safeParse(value);
	if (!parsed.success) throw new RecordingPageError(OTHER_BUILD, false);
	return parsed.data;
}

/** What a page from another build is told. */
const OTHER_BUILD =
	"The canvas page does not speak this recorder's contract. Run `archboard restart` to build the frontend and restart the Archboard server.";

/**
 * Why a page did not become ready in time.
 * @param published Whether it ever published a recording.
 * @returns What happened and what to do.
 */
function notReady(published: boolean): string {
	const within = `within ${RECORDER_MS.pageReady / 1000} seconds`;
	return published
		? `The canvas page was not ready to record ${within}: the board was not drawn or Codex did not start. Open the board on the canvas to see why, then record again.`
		: `The canvas page never offered a recording ${within}: the Archboard server serves a frontend built without it. Run \`archboard restart\` to build the frontend and restart the server, then record again.`;
}

/**
 * Why the page says it failed.
 * @param state The page's state.
 * @returns Its words.
 */
function failureIn(state: RecordingState): string {
	return state.failure ?? "The canvas page stopped the recording without saying why.";
}

/**
 * Whether the page can start.
 * @param state The page's state, or null.
 * @returns True when it is ready.
 * @throws {RecordingPageError} When it failed before starting.
 */
function isReady(state: RecordingState | null): boolean {
	if (state?.phase === "failed") throw new RecordingPageError(failureIn(state), false);
	return state?.phase === "ready";
}

/**
 * Wait for the page to be able to start.
 * @param page The page.
 * @param signal Cancels the wait.
 * @param deadline When to stop waiting, on the monotonic clock.
 * @param published Whether the page has published a recording yet.
 * @returns When the page is ready.
 * @throws {RecordingPageError} When the page failed, or did not become ready in time.
 */
async function ready(
	page: RecordingPageHandle,
	signal: AbortSignal,
	deadline: number,
	published: boolean,
): Promise<void> {
	const state = await heeded(signal, stateOf(page));
	if (isReady(state)) return;
	const seen = published || state !== null;
	if (performance.now() >= deadline) throw new RecordingPageError(notReady(seen), false);
	await pause(RECORDER_MS.poll, signal);
	return ready(page, signal, deadline, seen);
}

/**
 * Start the page recording, from a user gesture.
 * @param page The page.
 * @param signal Cancels the start.
 * @returns When the page listens.
 * @throws {RecordingPageError} When the page would not start: in its own words when it has some.
 */
async function begin(page: RecordingPageHandle, signal: AbortSignal): Promise<void> {
	try {
		await heeded(
			signal,
			page.evaluate(`${PAGE}.start()`, { userGesture: true, timeoutMs: RECORDER_MS.call }),
		);
	} catch (error) {
		signal.throwIfAborted();
		// The page's own sentence, rather than its exception as DevTools reports it, stack and all.
		const said = await stateOf(page).catch(() => null);
		signal.throwIfAborted();
		throw new RecordingPageError(
			said?.phase === "failed" ? failureIn(said) : messageOf(error),
			false,
		);
	}
}

/** How far the recorder has followed the talk; it moves on as the talk does. */
interface Following {
	/** The phase and step last said, as one key. */
	said: string;
	/** When that last changed, on the monotonic clock. */
	changedAt: number;
	/** Whether the talk has shown a step, so that something was recorded. */
	shown: boolean;
}

/**
 * Say a state that is new, and note when it changed.
 * @param state The page's state, or null.
 * @param following How far the talk has been followed; moved on here.
 * @param onProgress Told each new phase and step.
 */
function follow(
	state: RecordingState | null,
	following: Following,
	onProgress: (state: RecordingState) => void,
): void {
	if (state === null) return;
	const said = `${state.phase}:${state.step ?? "-"}`;
	if (said === following.said) return;
	onProgress(state);
	following.said = said;
	following.changedAt = performance.now();
	following.shown ||= state.step !== null;
}

/**
 * How the talk ended, if it has.
 * @param state The page's state, or null.
 * @param following How far the talk has been followed.
 * @returns The finished state, or null while the talk goes on.
 * @throws {RecordingPageError} When the page failed.
 */
function outcomeOf(state: RecordingState | null, following: Following): RecordingState | null {
	if (state?.phase === "finished") return state;
	if (state?.phase === "failed") {
		throw new RecordingPageError(failureIn(state), following.shown || state.step !== null);
	}
	return null;
}

/**
 * Follow the talk until the page has kept it.
 * @param page The page.
 * @param signal Cancels the wait.
 * @param onProgress Told each new phase and step.
 * @param following How far the talk has been followed.
 * @returns The finished state.
 * @throws {RecordingPageError} When the page failed, or stopped saying anything new for too long.
 */
async function finished(
	page: RecordingPageHandle,
	signal: AbortSignal,
	onProgress: (state: RecordingState) => void,
	following: Following,
): Promise<RecordingState> {
	const state = await heeded(signal, stateOf(page));
	const done = outcomeOf(state, following);
	if (done !== null) return done;
	follow(state, following, onProgress);
	if (performance.now() - following.changedAt > RECORDER_MS.stall) {
		throw new RecordingPageError(
			"The canvas page stopped reporting progress. Record again; if it keeps happening, open the board on the canvas and check voice there.",
			following.shown,
		);
	}
	await pause(RECORDER_MS.poll, signal);
	return finished(page, signal, onProgress, following);
}

/**
 * The finished talk's log, as the page hands it over.
 * @param page The page.
 * @param signal Cancels the read.
 * @returns The log.
 * @throws {RecordingPageError} When the page hands over something that is not a talk log.
 */
async function logOf(page: RecordingPageHandle, signal: AbortSignal): Promise<TalkLog> {
	const value = await heeded(
		signal,
		page.evaluate(`${PAGE}.talk()`, { timeoutMs: RECORDER_MS.fileRead }),
	);
	const parsed = TalkLogSchema.safeParse(value);
	if (!parsed.success) throw new RecordingPageError(OTHER_BUILD, true);
	return parsed.data;
}

/**
 * Load the captured canonical reading before any voice starts.
 * @param page The existing recording page.
 * @param architecture The exact retained playback.
 * @param signal Cancellation of this recording.
 * @param deadline The existing page readiness deadline.
 * @returns Once the canonical payload reaches the page.
 */
async function loadArchitecture(
	page: RecordingPageHandle,
	architecture: Extract<ArchitectureModelRead, { success: true }>,
	signal: AbortSignal,
	deadline: number,
): Promise<void> {
	const published = await heeded(
		signal,
		page.evaluate(`typeof ${PAGE}?.load === "function"`, { timeoutMs: RECORDER_MS.call }),
	);
	if (published === true) {
		await heeded(
			signal,
			page.evaluate(`${PAGE}.load(${JSON.stringify(architecture)})`, {
				timeoutMs: RECORDER_MS.frameCall,
			}),
		);
		return;
	}
	if (performance.now() >= deadline)
		throw new RecordingPageError(
			"The recording page does not support canonical playback. Rebuild the frontend and restart the server.",
			false,
		);
	await pause(RECORDER_MS.poll, signal);
	return loadArchitecture(page, architecture, signal, deadline);
}

/**
 * Record one walkthrough's talk through a page that is already open on it.
 * @param page The page.
 * @param options Where the voice goes, cancellation and progress.
 * @param options.voice Where to write the voice, a WAV file.
 * @param options.architecture The optional exact retained canonical playback.
 * @param options.signal Cancels the recording.
 * @param options.onProgress Told each new phase and step.
 * @returns The finished state and the talk's log.
 * @throws {RecordingPageError} When the recording did not happen. A cancelled recording throws
 *   the signal's reason instead, as soon as the call it was waiting on settles.
 */
async function drive(
	page: RecordingPageHandle,
	options: {
		readonly voice: string;
		readonly architecture?: Extract<ArchitectureModelRead, { success: true }>;
		readonly signal: AbortSignal;
		readonly onProgress: (state: RecordingState) => void;
	},
): Promise<{ readonly state: RecordingState; readonly log: TalkLog }> {
	const { signal } = options;
	const following: Following = { said: "", changedAt: 0, shown: false };
	try {
		signal.throwIfAborted();
		if (options.architecture !== undefined)
			await loadArchitecture(
				page,
				options.architecture,
				signal,
				performance.now() + RECORDER_MS.pageReady,
			);
		await ready(page, signal, performance.now() + RECORDER_MS.pageReady, false);
		await begin(page, signal);
		following.changedAt = performance.now();
		const state = await finished(page, signal, options.onProgress, following);
		await heeded(signal, page.saveBlob(`${PAGE}.voice()`, options.voice, RECORDER_MS.fileRead));
		return { state, log: await logOf(page, signal) };
	} catch (error) {
		signal.throwIfAborted();
		if (error instanceof RecordingPageError) throw error;
		// The browser failed under the page: a call timed out, or its connection closed.
		throw new RecordingPageError(messageOf(error), following.shown);
	}
}

export { RecordingPageError, drive, messageOf, type RecordingPageHandle };
