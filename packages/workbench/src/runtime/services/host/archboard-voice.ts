import { z } from "zod";
import { RecordingNarrationSchema } from "@archboard/walkthrough/recording";
import {
	ARCHBOARD_RECORDING_VOICE_PROMPT,
	ARCHBOARD_VOICE_PROMPT,
} from "#runtime/rules/realtime/voice-prompt.ts";
import {
	presentationSpeech,
	voicePresentationPrompt,
	type RealtimePresentation,
	type RealtimePresentationChange,
} from "#runtime/rules/realtime/presentation-mode.ts";
import type { WorkbenchVoicePolicy } from "@archboard/agent-workbench/runtime";

/**
 *
 */
const ArchboardPresentationSchema = z.object({
	walkthrough: z.string(),
	name: z.string(),
	recording: RecordingNarrationSchema.nullable(),
});
/**
 * Parse opaque narration input as Archboard presentation data.
 * @param value The candidate host value.
 * @returns The validated presentation, or null for ordinary conversation.
 */
function archboardPresentation(value: unknown): RealtimePresentation | null {
	return value == null ? null : ArchboardPresentationSchema.parse(value);
}
/**
 * Read whether this Archboard presentation records narration.
 * @param value The candidate host value.
 * @returns Whether the stated condition holds.
 */
function isArchboardRecording(value: unknown): boolean {
	return archboardPresentation(value)?.recording != null;
}
/**
 * Supply Archboard persona and narration rules through the neutral voice port.
 * @param subscribe The source of Archboard narration changes.
 * @returns The Archboard voice policy.
 */
function createArchboardVoicePolicy(
	subscribe?: (listener: (change: RealtimePresentationChange) => void) => () => void,
): WorkbenchVoicePolicy {
	return Object.freeze({
		/**
		 * Compose the exact Archboard voice prompt for this presentation mode.
		 * @param value The candidate host value.
		 * @returns The exact prompt and channel policy for this mode.
		 */
		start: (value: unknown) => {
			const presentation = archboardPresentation(value);
			const recording = presentation?.recording != null;
			const base = recording ? ARCHBOARD_RECORDING_VOICE_PROMPT : ARCHBOARD_VOICE_PROMPT;
			return Object.freeze({
				prompt:
					presentation === null ? base : `${base}\n\n${voicePresentationPrompt(presentation)}`,
				suppressCoordinatorSpeech: recording,
				delegationAckFiller: !recording,
			});
		},
		...(subscribe === undefined
			? {}
			: {
					/**
					 * Subscribe to host context changes and return the subscription cleanup.
					 * @param value The candidate host value.
					 * @param listener Receives domain changes.
					 * @returns The cleanup that ends the subscriptions.
					 */
					subscribe: (
						value: unknown,
						listener: (input: {
							readonly text: string;
							readonly channel: "speech" | "context";
						}) => void,
					) => {
						const recording = isArchboardRecording(value);
						return subscribe((change) => {
							if (recording && change.kind === "left") return;
							listener({ text: presentationSpeech(change, recording), channel: "speech" });
						});
					},
				}),
	});
}
export { createArchboardVoicePolicy, isArchboardRecording };
