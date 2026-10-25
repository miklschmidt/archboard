// The recording page and the command that drives it agree on one contract: the address that opens the page as a recording, the page's side published on it, the language a recording is narrated in and what the voice is told. Safe for the browser.
export {
	DEFAULT_RECORDING_LANGUAGE,
	publishRecordingPage,
	recordingAskedOf,
	RecordingNarrationSchema,
} from "#shared/protocol/recording-page.ts";
export { languageName, RecordingLanguageSchema } from "#shared/schemas/recording-language.ts";
