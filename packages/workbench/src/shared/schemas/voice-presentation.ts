import { z } from "zod";
import { boundedText } from "@archboard/codex-realtime-voice/contract";
import { RecordingNarrationSchema } from "@archboard/walkthrough/recording";

/** What the browser names when it asks Archboard to narrate a walkthrough. */
const ArchboardVoicePresentationSchema = z
	.object({
		walkthrough: boundedText(64),
		recording: RecordingNarrationSchema.optional(),
	})
	.strict();

type BrowserVoicePresentation = z.infer<typeof ArchboardVoicePresentationSchema>;

export { ArchboardVoicePresentationSchema, type BrowserVoicePresentation };
