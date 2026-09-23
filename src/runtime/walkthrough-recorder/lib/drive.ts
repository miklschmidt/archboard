// Driving one recording page from outside it (TASK-304).
//
// The page paces the talk itself; the recorder only follows it. It reads the
// page's state until the page can start, starts it from a user gesture,
// reads the state again as the talk goes, saying each new step, and once the
// page says the file is finished it streams the file out. Everything the page
// says crosses as the shared recording state and is parsed as such, so a page
// from another build is refused rather than guessed at.

import {
	RECORDING_CALL_MS,
	RECORDING_FILE_READ_MS,
	RECORDING_PAGE_READY_MS,
	RECORDING_POLL_MS,
	RECORDING_STALL_MS,
} from "@/shared/timing/timing";
import {
	RECORDING_PAGE_GLOBAL,
	RecordingStateSchema,
	type RecordingContainer,
	type RecordingState,
} from "@/shared/walkthrough-recording";

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
	 * @param timeoutMs How long the whole stream may take.
	 * @returns How many bytes were written.
	 */
	readonly saveBlob: (expression: string, path: string, timeoutMs: number) => Promise<number>;
}

/** Why a recording did not happen, and whether it had begun. */
class RecordingPageError extends Error {
	/** Whether the page was refused before it started capturing, or failed once it had. */
	readonly began: boolean;

	/**
	 * A recording that did not happen.
	 * @param message What happened and what to do.
	 * @param began Whether it had started.
	 */
	constructor(message: string, began: boolean) {
		super(message);
		this.name = "RecordingPageError";
		this.began = began;
	}
}

const PAGE = `window[${JSON.stringify(RECORDING_PAGE_GLOBAL)}]`;

/**
 * Wait a while, unless the recording is cancelled.
 * @param ms How long.
 * @param signal Cancels the wait.
 * @returns When the time has passed.
 */
function pause(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(signal.reason);
			},
			{ once: true },
		);
	});
}

/**
 * The page's state, or null while the page has not published its recording yet.
 * @param page The page.
 * @returns The state.
 * @throws {RecordingPageError} When the page publishes something that is not a recording state.
 */
async function stateOf(page: RecordingPageHandle): Promise<RecordingState | null> {
	const value = await page.evaluate(`${PAGE}?.state() ?? null`, { timeoutMs: RECORDING_CALL_MS });
	if (value === null) return null;
	const parsed = RecordingStateSchema.safeParse(value);
	if (!parsed.success) {
		throw new RecordingPageError(
			"The canvas page does not speak this recorder's contract. Rebuild the frontend (bun run build:frontend) and restart the canvas.",
			false,
		);
	}
	return parsed.data;
}

/**
 * Wait for the page to be able to start.
 * @param page The page.
 * @param signal Cancels the wait.
 * @param deadline When to stop waiting, on the monotonic clock.
 * @returns When the page is ready.
 * @throws {RecordingPageError} When the page failed, or did not become ready in time.
 */
async function ready(
	page: RecordingPageHandle,
	signal: AbortSignal,
	deadline: number,
): Promise<void> {
	const state = await stateOf(page);
	if (state?.phase === "ready") return;
	if (state?.phase === "failed") throw new RecordingPageError(failureIn(state), false);
	if (performance.now() >= deadline) {
		throw new RecordingPageError(
			`The canvas page was not ready to record within ${RECORDING_PAGE_READY_MS / 1000} seconds: the board was not drawn or Codex did not start. Open the board on the canvas to see why, then record again.`,
			false,
		);
	}
	await pause(RECORDING_POLL_MS, signal);
	return ready(page, signal, deadline);
}

/**
 * Why the page says it failed.
 * @param state The page's state.
 * @returns Its words.
 */
function failureIn(state: RecordingState): string {
	return state.failure ?? "The canvas page stopped the recording without saying why.";
}

/** How far the recorder has followed the talk. */
interface Following {
	/** The phase and step last said, as one key. */
	readonly said: string;
	/** When that last changed, on the monotonic clock. */
	readonly changedAt: number;
}

/**
 * Say a state that is new, and note when it changed.
 * @param state The page's state, or null.
 * @param following How far the talk has been followed.
 * @param onProgress Told each new phase and step.
 * @returns How far it has been followed now.
 */
function progressed(
	state: RecordingState | null,
	following: Following,
	onProgress: (state: RecordingState) => void,
): Following {
	const said = state === null ? "none" : `${state.phase}:${state.step ?? "-"}`;
	if (state === null || said === following.said) return following;
	onProgress(state);
	return { said, changedAt: performance.now() };
}

/**
 * Follow the talk until the page has finished the file.
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
	const state = await stateOf(page);
	if (state?.phase === "finished") return state;
	if (state?.phase === "failed") throw new RecordingPageError(failureIn(state), true);
	const now = progressed(state, following, onProgress);
	if (performance.now() - now.changedAt > RECORDING_STALL_MS) {
		throw new RecordingPageError(
			"The canvas page stopped reporting progress. Record again; if it keeps happening, open the board on the canvas and check voice there.",
			true,
		);
	}
	await pause(RECORDING_POLL_MS, signal);
	return finished(page, signal, onProgress, now);
}

/**
 * Record one walkthrough through a page that is already open on it.
 * @param page The page.
 * @param options The container, where the file goes, cancellation and progress.
 * @param options.container The container to write.
 * @param options.path Where to write the file.
 * @param options.signal Cancels the recording.
 * @param options.onProgress Told each new phase and step.
 * @returns The finished state and how many bytes the file has.
 * @throws {RecordingPageError} When the recording did not happen.
 */
async function drive(
	page: RecordingPageHandle,
	options: {
		readonly container: RecordingContainer;
		readonly path: string;
		readonly signal: AbortSignal;
		readonly onProgress: (state: RecordingState) => void;
	},
): Promise<{ readonly state: RecordingState; readonly bytes: number }> {
	const { signal } = options;
	await ready(page, signal, performance.now() + RECORDING_PAGE_READY_MS);
	try {
		await page.evaluate(`${PAGE}.start(${JSON.stringify({ container: options.container })})`, {
			userGesture: true,
			timeoutMs: RECORDING_CALL_MS,
		});
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new RecordingPageError(reason, false);
	}
	const state = await finished(page, signal, options.onProgress, {
		said: "",
		changedAt: performance.now(),
	});
	const bytes = await page.saveBlob(`${PAGE}.file()`, options.path, RECORDING_FILE_READ_MS);
	return { state, bytes };
}

export { RecordingPageError, drive, type RecordingPageHandle };
