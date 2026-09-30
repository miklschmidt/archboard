// A recording of one walkthrough, as the page that records it and the command
// that drives the page agree on it (TASK-304, TASK-381).
//
// The page is the Archboard server's own page, opened on one board with two more search
// parameters, naming the walkthrough to record and the language the voice narrates it in
// (TASK-380), which it reads once as it loads.
// It shows that board's pane and nothing else, and it paces the talk itself:
// the position in a walkthrough is the browser's (ADR 0023), and the page is
// the only place that hears when the voice has finished speaking.
//
// The command drives it through one global. It reads the page's state until
// the page is ready, starts it from a user gesture (the page's audio needs
// one), reads the state again until the talk has finished or failed, and takes
// the talk out of the page: the voice as a WAV file, and the log of what
// happened while it spoke. The picture is rendered from the talk afterwards
// (`talk.ts`). Nothing else crosses.

import { z } from "zod";

import { RecordingLanguageSchema, languageName } from "@/shared/walkthrough-recording/lib/language";
import type { TalkLog } from "@/shared/walkthrough-recording/talk";

/** The search parameter that opens the page as a recording of one walkthrough. */
const RECORDING_SEARCH_PARAM = "record";

/** The search parameter that names the language the voice narrates the recording in. */
const RECORDING_LANGUAGE_SEARCH_PARAM = "language";

/** The global the page publishes its recording on. */
const RECORDING_PAGE_GLOBAL = "archboardRecording";

/** The containers a recording can be written in, named as file extensions. */
const RecordingContainerSchema = z.enum(["mp4", "webm"]);
type RecordingContainer = z.infer<typeof RecordingContainerSchema>;

/** The language a recording is narrated in when none is asked for. */
const DEFAULT_RECORDING_LANGUAGE = "en";

/**
 * What voice is told when it narrates a recording rather than a talk somebody is listening to:
 * the language it speaks. Only a recording carries one. A live narration speaks the user's.
 */
const RecordingNarrationSchema = z.object({ language: RecordingLanguageSchema }).strict();
type RecordingNarration = z.infer<typeof RecordingNarrationSchema>;

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
		/** The walkthrough being recorded, by the id the page was opened with. */
		walkthrough: z.string(),
		/** The step on screen, counted from one, or null before the first. */
		step: z.number().int().min(1).nullable(),
		/** How many steps the walkthrough has, once the page has found it. */
		of: z.number().int().min(1).nullable(),
		/** Why the recording failed, in a sentence that says what to do; null otherwise. */
		failure: z.string().nullable(),
		/** How long the finished talk runs, in milliseconds, once there is one. */
		durationMs: z.number().nonnegative().nullable(),
	})
	.strict();
type RecordingState = z.infer<typeof RecordingStateSchema>;

/**
 * The page's side of the contract, published on `window[RECORDING_PAGE_GLOBAL]`.
 *
 * `start` must be called from a user gesture, because it starts the page's
 * audio; it resolves once the page listens or rejects with why it could not,
 * and the state follows the talk from there. `voice` and `talk` are the
 * finished talk, a 16-bit mono WAV file and the log stamped on its samples, and
 * are null before the state says `finished`.
 */
interface RecordingPage {
	readonly state: () => RecordingState;
	readonly start: () => Promise<void>;
	readonly voice: () => Blob | null;
	readonly talk: () => TalkLog | null;
}

/**
 * One search parameter's value.
 * @param params The address's search parameters.
 * @param name The parameter.
 * @returns Its value trimmed, or null when it is absent or blank.
 */
function searchValue(params: URLSearchParams, name: string): string | null {
	const value = params.get(name)?.trim() ?? "";
	return value === "" ? null : value;
}

/**
 * The walkthrough a page's address asks it to record, and the language to narrate it in.
 * @param search The address's search string, with or without its leading `?`.
 * @returns The walkthrough's id or name and the language as the address gives it (English when
 *   it gives none), or null when the page is not a recording.
 */
function recordingAskedOf(
	search: string,
): { readonly walkthrough: string; readonly language: string } | null {
	const params = new URLSearchParams(search);
	const walkthrough = searchValue(params, RECORDING_SEARCH_PARAM);
	if (walkthrough === null) return null;
	const language = searchValue(params, RECORDING_LANGUAGE_SEARCH_PARAM);
	return { walkthrough, language: language ?? DEFAULT_RECORDING_LANGUAGE };
}

export {
	DEFAULT_RECORDING_LANGUAGE,
	RECORDING_LANGUAGE_SEARCH_PARAM,
	RECORDING_PAGE_GLOBAL,
	RECORDING_SEARCH_PARAM,
	RecordingContainerSchema,
	RecordingLanguageSchema,
	RecordingNarrationSchema,
	RecordingPhaseSchema,
	RecordingStateSchema,
	languageName,
	recordingAskedOf,
	type RecordingContainer,
	type RecordingNarration,
	type RecordingPage,
	type RecordingPhase,
	type RecordingState,
};
