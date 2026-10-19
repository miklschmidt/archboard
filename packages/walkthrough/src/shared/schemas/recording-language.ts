// The language a recording is narrated in (TASK-380): a BCP 47 language tag
// that names a language, named to the voice model in English.

import { z } from "zod";

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

export { RecordingLanguageSchema, languageName };
