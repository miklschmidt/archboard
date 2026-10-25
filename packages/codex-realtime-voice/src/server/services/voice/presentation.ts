import type { BrowserVoicePresentation } from "#shared/schemas/browser/snapshot.ts";
import type { SessionVoiceStartTrace } from "#server/services/voice/start-trace.ts";
/** Host presentation hooks carry domain meaning, while this owner retains voice identity. */
export interface WorkbenchVoicePresentationAdapter {
	readonly validate?: (input: BrowserVoicePresentation | null) => void;
	readonly prepare: (
		input: BrowserVoicePresentation | null,
		browserId: string,
	) => BrowserVoicePresentation;
	readonly opened?: (
		presentation: BrowserVoicePresentation | null,
		browserId: string,
		trace: SessionVoiceStartTrace,
	) => void;
	readonly forget?: (browserId: string) => void;
	readonly recording?: (input: BrowserVoicePresentation | null) => boolean;
}

/**
 * Capture host presentation before a voice start changes any running session.
 * @param adapter The host presentation adapter.
 * @param input The browser presentation JSON.
 */
export function validatePresentation(
	adapter: WorkbenchVoicePresentationAdapter | undefined,
	input: BrowserVoicePresentation | null | undefined,
): void {
	if (input !== undefined) adapter?.validate?.(input);
}
/**
 * Read whether a host presentation records the voice.
 * @param adapter The host presentation adapter.
 * @param input The browser presentation JSON.
 * @returns Whether the host records the voice.
 */
export function presentationRecords(
	adapter: WorkbenchVoicePresentationAdapter | undefined,
	input: BrowserVoicePresentation | null | undefined,
): boolean {
	return adapter?.recording?.(input ?? null) ?? false;
}
/**
 * Release a replaced host presentation.
 * @param adapter The host presentation adapter.
 * @param browserId The prior browser identity.
 */
export function forgetPresentation(
	adapter: WorkbenchVoicePresentationAdapter | undefined,
	browserId: string | null,
): void {
	if (browserId !== null) adapter?.forget?.(browserId);
}
/**
 * Resolve validated host presentation JSON for the new voice session.
 * @param adapter The host presentation adapter.
 * @param input The browser presentation JSON.
 * @param browserId The browser that owns the session.
 * @returns The resolved presentation, or null.
 */
export function preparePresentation(
	adapter: WorkbenchVoicePresentationAdapter | undefined,
	input: BrowserVoicePresentation | null | undefined,
	browserId: string,
): BrowserVoicePresentation | null {
	return input === undefined ? null : (adapter?.prepare(input, browserId) ?? input);
}
/**
 * Publish the host presentation after the offer installs its input subscription.
 * @param adapter The host presentation adapter.
 * @param presentation The resolved host presentation.
 * @param browserId The browser that owns the session.
 * @param trace The voice start trace.
 */
export function openedPresentation(
	adapter: WorkbenchVoicePresentationAdapter | undefined,
	presentation: BrowserVoicePresentation | null,
	browserId: string,
	trace: SessionVoiceStartTrace,
): void {
	adapter?.opened?.(presentation, browserId, trace);
}
