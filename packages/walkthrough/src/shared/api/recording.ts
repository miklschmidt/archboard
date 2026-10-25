// The recording page and the command that drives it agree on one contract: the address that opens the page as a recording, what the page says of its state, the container and the language a recording is made in. Safe for the browser.
export {
	DEFAULT_RECORDING_LANGUAGE,
	RECORDING_PAGE_GLOBAL,
	recordingAskedOf,
	RecordingNarrationSchema,
} from "#shared/protocol/recording-page.ts";
export type {
	RecordingContainer,
	RecordingNarration,
	RecordingPage,
	RecordingPhase,
	RecordingState,
} from "#shared/protocol/recording-page.ts";
export { languageName, RecordingLanguageSchema } from "#shared/schemas/recording-language.ts";
