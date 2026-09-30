// A recording of one walkthrough, as the page that records it and the command
// that drives the page agree on it (TASK-304).
//
// The page is the Archboard server's own page, opened on one board with two more search
// parameters, naming the walkthrough to record and the language the voice narrates it in
// (TASK-380), which it reads once as it loads.
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

/** The search parameter that names the language the voice narrates the recording in. */
const RECORDING_LANGUAGE_SEARCH_PARAM = "language";

/** The global the page publishes its recording on. */
const RECORDING_PAGE_GLOBAL = "archboardRecording";

/** The containers a recording can be written in, named as file extensions. */
const RecordingContainerSchema = z.enum(["mp4", "webm"]);
type RecordingContainer = z.infer<typeof RecordingContainerSchema>;

/** The language a recording is narrated in when none is asked for. */
const DEFAULT_RECORDING_LANGUAGE = "en";

/** How a language is named to the voice model. */
const LANGUAGE_NAMES = new Intl.DisplayNames(["en"], { type: "language", fallback: "none" });

/**
 * The English name of a language, as the voice model is told it.
 * @param tag A BCP 47 language tag, such as en, da or pt-BR.
 * @returns Its name, such as English, Danish or Brazilian Portuguese, or null when the tag is not
 *   well formed or names no language.
 */
function languageName(tag: string): string | null {
	try {
		return LANGUAGE_NAMES.of(tag) ?? null;
	} catch {
		return null;
	}
}

/**
 * Why a value is refused as a recording's language, and what to pass instead.
 * @param issue The refused value.
 * @param issue.input The value as it was given.
 * @returns The refusal.
 */
function notALanguage(issue: { readonly input: unknown }): string {
	return `"${String(issue.input)}" is not a BCP 47 language tag that names a language. Pass one such as en, da, fr or pt-BR.`;
}

/**
 * The language a recording is narrated in, whatever language its steps are written in: a BCP 47
 * language tag that names a language (TASK-380).
 */
const RecordingLanguageSchema = z
	.string()
	.max(64)
	.refine((tag) => languageName(tag) !== null, { error: notALanguage });

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
	RecordingStartSchema,
	RecordingStateSchema,
	languageName,
	recordingAskedOf,
	type RecordingContainer,
	type RecordingNarration,
	type RecordingPage,
	type RecordingPhase,
	type RecordingStart,
	type RecordingState,
};
