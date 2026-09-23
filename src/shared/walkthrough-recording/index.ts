// A recording of one walkthrough, as the page that records it and the command
// that drives the page agree on it (TASK-304).
//
// The page is the canvas's own page, opened on one board with one more search
// parameter naming the walkthrough to record, which it reads once as it loads.
// It shows that board's pane and nothing else, and it paces the talk itself:
// the position in a walkthrough is the browser's (ADR 0023), and the page is
// the only place that hears when the voice has finished speaking.
//
// The command drives it through one global. It reads the page's state until
// the page is ready, starts it from a user gesture (capturing a tab needs
// one), reads the state again until the recording has finished or failed, and
// takes the finished file out of the page as a Blob. Nothing else crosses.

import { z } from "zod";

/** The search parameter that opens the page as a recording of one walkthrough. */
const RECORDING_SEARCH_PARAM = "record";

/** The global the page publishes its recording on. */
const RECORDING_PAGE_GLOBAL = "archboardRecording";

/** The containers a recording can be written in, named as file extensions. */
const RecordingContainerSchema = z.enum(["mp4", "webm"]);
type RecordingContainer = z.infer<typeof RecordingContainerSchema>;

/**
 * Where a recording stands.
 *
 * - `loading`: the page is still reaching a board it can present and an agent
 *   that can speak.
 * - `ready`: it can be started.
 * - `recording`: it is capturing; the step on screen is named once the talk
 *   has reached one.
 * - `finished`: the file is complete and can be taken.
 * - `failed`: nothing usable was recorded; the failure says why.
 */
const RecordingPhaseSchema = z.enum(["loading", "ready", "recording", "finished", "failed"]);
type RecordingPhase = z.infer<typeof RecordingPhaseSchema>;

/** What the page says about its recording. */
const RecordingStateSchema = z
	.object({
		phase: RecordingPhaseSchema,
		/** The walkthrough being recorded, by name, once the page has found it. */
		walkthrough: z.string().nullable(),
		/** The step on screen, counted from one, or null before the first. */
		step: z.number().int().min(1).nullable(),
		/** How many steps the walkthrough has, once the page has found it. */
		of: z.number().int().min(1).nullable(),
		/** Why the recording failed, in a sentence that says what to do; null otherwise. */
		failure: z.string().nullable(),
		/** The finished file's media type, once there is one. */
		mimeType: z.string().nullable(),
		/** How long the finished recording runs, in milliseconds, once there is one. */
		durationMs: z.number().nonnegative().nullable(),
	})
	.strict();
type RecordingState = z.infer<typeof RecordingStateSchema>;

/** How the recorder starts a recording. */
const RecordingStartSchema = z.object({ container: RecordingContainerSchema }).strict();
type RecordingStart = z.infer<typeof RecordingStartSchema>;

/**
 * The page's side of the contract, published on `window[RECORDING_PAGE_GLOBAL]`.
 *
 * `start` must be called from a user gesture, because it captures the tab; it
 * resolves once capture has begun or rejects with why it could not, and the
 * state follows the talk from there. `file` is the finished recording, and is
 * null before the state says `finished`.
 */
interface RecordingPage {
	readonly state: () => RecordingState;
	readonly start: (options: RecordingStart) => Promise<void>;
	readonly file: () => Blob | null;
}

/**
 * The walkthrough a page's address asks it to record.
 * @param search The address's search string, with or without its leading `?`.
 * @returns The walkthrough's id or name, or null when the page is not a recording.
 */
function recordedWalkthroughOf(search: string): string | null {
	const value = new URLSearchParams(search).get(RECORDING_SEARCH_PARAM)?.trim() ?? "";
	return value === "" ? null : value;
}

export {
	RECORDING_PAGE_GLOBAL,
	RECORDING_SEARCH_PARAM,
	RecordingContainerSchema,
	RecordingPhaseSchema,
	RecordingStartSchema,
	RecordingStateSchema,
	recordedWalkthroughOf,
	type RecordingContainer,
	type RecordingPage,
	type RecordingPhase,
	type RecordingStart,
	type RecordingState,
};
