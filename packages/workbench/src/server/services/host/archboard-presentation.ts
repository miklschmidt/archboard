import type { WorkbenchVoicePresentationAdapter } from "@archboard/codex-realtime-voice/server";
import { JsonValueSchema } from "@archboard/codex-realtime-voice/contract";
import { ArchboardVoicePresentationSchema } from "#shared/schemas/voice-presentation.ts";
import {
	narrationFor,
	openNarration,
	forgetNarration,
} from "#server/projections/semantic-context/walkthrough-narration.ts";
import { isArchboardRecording } from "#runtime/services/host/archboard-voice.ts";

/** Parse host JSON before any walkthrough or recording behavior uses it. */
export const ARCHBOARD_VOICE_PRESENTATION: WorkbenchVoicePresentationAdapter =
	Object.freeze<WorkbenchVoicePresentationAdapter>({
		/**
		 * Require valid Archboard presentation data before the core accepts it.
		 * @param input The host presentation payload.
		 */
		validate: (input) => {
			ArchboardVoicePresentationSchema.parse(input);
		},
		/**
		 * Capture narration for the browser that will present the walkthrough or recording.
		 * @param input The host presentation payload.
		 * @param browserId The browser that owns the presentation.
		 * @returns The captured narration as JSON.
		 */
		prepare: (input, browserId) => {
			const presentation = ArchboardVoicePresentationSchema.parse(input);
			const captured = JsonValueSchema.parse(
				narrationFor(browserId, presentation.walkthrough, presentation.recording ?? null),
			);
			if (captured === null) throw new Error("The Archboard presentation is empty.");
			return captured;
		},
		/**
		 * Open walkthrough narration after the browser opens its voice presentation.
		 * @param presentation The captured host presentation.
		 * @param browserId The browser that owns the presentation.
		 * @param trace Records narration failures for this voice start.
		 */
		opened: (presentation, browserId, trace) => {
			if (presentation === null || isArchboardRecording(presentation)) return;
			void openNarration(browserId).catch((error: unknown) =>
				trace.note("narration_failed", {
					message: error instanceof Error ? error.message : String(error),
				}),
			);
		},
		forget: forgetNarration,
		/**
		 * Read the recording flag from validated browser input before narration is prepared.
		 * @param input The browser presentation payload.
		 * @returns Whether this browser request records narration.
		 */
		recording: (input) =>
			input !== null && ArchboardVoicePresentationSchema.parse(input).recording !== undefined,
	});
