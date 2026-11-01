import type { VoiceNarrative } from "#shared/schemas/browser/snapshot.ts";
import type { SessionVoiceStartTrace } from "#server/services/voice/start-trace.ts";

/**
 * How a host checks, prepares, opens and forgets the narrative a voice session starts to present.
 * The narrative's meaning is the host's; the package keeps the voice session's identity.
 */
export interface VoiceNarrativeAdapter {
	/** Refuse a narrative before the start changes any running session. */
	readonly validate?: (input: VoiceNarrative | null) => void;
	/** Turn the browser's narrative into the one the session presents. */
	readonly prepare: (
		input: VoiceNarrative | null,
		browserId: string,
	) => VoiceNarrative | Promise<VoiceNarrative>;
	/** Hear that the session presenting this narrative is open. */
	readonly opened?: (
		narrative: VoiceNarrative | null,
		browserId: string,
		trace: SessionVoiceStartTrace,
	) => void;
	/** Release what a replaced session's narrative held for its browser. */
	readonly forget?: (browserId: string) => void;
	/**
	 * Whether nobody listens live to a session that presents this prepared narrative. An unattended
	 * session gives the coordinator no workhorse outcome, and the browser state says so. Default:
	 * never.
	 */
	readonly unattended?: (narrative: VoiceNarrative) => boolean;
}

/**
 * Refuse a narrative before a voice start changes any running session.
 * @param adapter The host narrative adapter.
 * @param input The browser's narrative JSON.
 */
export function validateNarrative(
	adapter: VoiceNarrativeAdapter | undefined,
	input: VoiceNarrative | null | undefined,
): void {
	if (input !== undefined) adapter?.validate?.(input);
}
/**
 * Whether nobody listens live to a session that presents a narrative.
 * @param adapter The host narrative adapter.
 * @param narrative The prepared narrative, or null for an ordinary session.
 * @returns Whether the session is unattended.
 */
export function isUnattended(
	adapter: VoiceNarrativeAdapter | undefined,
	narrative: VoiceNarrative | null,
): boolean {
	return narrative !== null && (adapter?.unattended?.(narrative) ?? false);
}
/**
 * Release a replaced session's narrative.
 * @param adapter The host narrative adapter.
 * @param browserId The prior browser identity.
 */
export function forgetNarrative(
	adapter: VoiceNarrativeAdapter | undefined,
	browserId: string | null,
): void {
	if (browserId !== null) adapter?.forget?.(browserId);
}
/**
 * Prepare a validated narrative for the new voice session.
 * @param adapter The host narrative adapter.
 * @param input The browser's narrative JSON.
 * @param browserId The browser that owns the session.
 * @returns The prepared narrative, or null for an ordinary session.
 */
export function prepareNarrative(
	adapter: VoiceNarrativeAdapter | undefined,
	input: VoiceNarrative | null | undefined,
	browserId: string,
): VoiceNarrative | null | Promise<VoiceNarrative> {
	return input === undefined ? null : (adapter?.prepare(input, browserId) ?? input);
}
/**
 * Tell the host that the session presenting a narrative is open, after the offer installed its
 * input subscription.
 * @param adapter The host narrative adapter.
 * @param narrative The prepared narrative.
 * @param browserId The browser that owns the session.
 * @param trace The voice start trace.
 */
export function openedNarrative(
	adapter: VoiceNarrativeAdapter | undefined,
	narrative: VoiceNarrative | null,
	browserId: string,
	trace: SessionVoiceStartTrace,
): void {
	adapter?.opened?.(narrative, browserId, trace);
}
