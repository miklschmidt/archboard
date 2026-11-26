import { languageName } from "@archboard/walkthrough/recording";

/** Sentinel select value for following the user's language (`null`). */
const AUTOMATIC_VALUE = "__automatic__";

/** The languages the voice language select offers, as BCP 47 tags. */
const OFFERED_LANGUAGES: readonly string[] = [
	"ar",
	"cs",
	"da",
	"de",
	"el",
	"en",
	"es",
	"fi",
	"fr",
	"he",
	"hi",
	"hu",
	"id",
	"it",
	"ja",
	"ko",
	"nb",
	"nl",
	"pl",
	"pt",
	"pt-BR",
	"ro",
	"ru",
	"sv",
	"th",
	"tr",
	"uk",
	"vi",
	"zh",
];

/** One choice in the voice language select. */
interface VoiceLanguageChoice {
	readonly value: string;
	readonly label: string;
}

/**
 * The voice language choices: Automatic first, then the offered languages by name, with a saved
 * language that is not offered kept so the select can still show it.
 * @param saved The saved language tag, or null for Automatic.
 * @returns The choices.
 */
function voiceLanguageChoices(saved: string | null): readonly VoiceLanguageChoice[] {
	const tags =
		saved === null || OFFERED_LANGUAGES.includes(saved)
			? OFFERED_LANGUAGES
			: [...OFFERED_LANGUAGES, saved];
	const languages = tags
		.map((tag) => ({ value: tag, label: languageName(tag) ?? tag }))
		.toSorted((a, b) => a.label.localeCompare(b.label, "en"));
	return [{ value: AUTOMATIC_VALUE, label: "Automatic" }, ...languages];
}

/**
 * The language tag a select value stands for.
 * @param value The select value.
 * @returns The tag, or null for Automatic.
 */
function voiceLanguageOf(value: string): string | null {
	return value === AUTOMATIC_VALUE ? null : value;
}

/**
 * The select value for a language tag.
 * @param language The tag, or null for Automatic.
 * @returns The select value.
 */
function voiceLanguageValue(language: string | null): string {
	return language ?? AUTOMATIC_VALUE;
}

export { voiceLanguageChoices, voiceLanguageOf, voiceLanguageValue };
