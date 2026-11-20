import { z } from "zod";
import { recordingNarrationSchema } from "@archboard/walkthrough/recording";

/** The longest walkthrough id, in characters and in UTF-8 bytes. */
const WALKTHROUGH_ID_LIMIT = 64;

/**
 * A walkthrough id: 1 to 64 characters and at most 64 UTF-8 bytes, without NUL, so the voice wire
 * that carries the narrative never receives more than its budget.
 */
const WalkthroughIdSchema = z
	.string()
	.min(1)
	.max(WALKTHROUGH_ID_LIMIT)
	.refine((value) => !value.includes("\0"), "NUL is not allowed")
	.refine(
		(value) => new TextEncoder().encode(value).byteLength <= WALKTHROUGH_ID_LIMIT,
		`text exceeds ${WALKTHROUGH_ID_LIMIT} UTF-8 bytes`,
	);

/** What the browser names when it asks Archboard to narrate a walkthrough. */
const ArchboardVoicePresentationSchema = z
	.object({
		walkthrough: WalkthroughIdSchema,
		recording: recordingNarrationSchema().optional(),
	})
	.strict();

type BrowserVoicePresentation = z.infer<typeof ArchboardVoicePresentationSchema>;

export { ArchboardVoicePresentationSchema, type BrowserVoicePresentation };
