// What the history refuses before retaining evidence: unbound sessions,
// malformed source orders, incoherent delivery evidence, and briefs whose
// identity contradicts the session they were captured for.

import { BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES } from "@/shared/codex-browser-model";
import type {
	VoiceContextCanonicalBrief,
	VoiceContextLedgerEntry,
	VoiceContextSessionCapture,
	VoiceContextSessionEvidence,
	VoiceContextSessionIdentity,
	VoiceContextSourceOrder,
} from "@/ui/voice-context/contract";

/**
 * The key one bound session is addressed by, or null when unbound.
 * @param value The session identity.
 * @returns The key, or null.
 */
function boundKey(value: VoiceContextSessionIdentity): string | null {
	if (value.binding === null || value.sessionId === null) {
		return null;
	}
	return JSON.stringify([
		value.binding.childId,
		value.binding.epoch,
		value.binding.workhorseThreadId,
		value.binding.coordinatorThreadId,
		value.sessionId,
		value.binding.paneId,
	]);
}

/**
 * The key one bound session is addressed by.
 * @param value The session identity.
 * @returns The key.
 */
function voiceContextSessionKey(value: VoiceContextSessionIdentity): string {
	const key = boundKey(value);
	if (key === null) {
		throw new TypeError("Voice context evidence requires a bound session view.");
	}
	return key;
}

/**
 * Whether a clipped captured value is a proper prefix of the expected one.
 * @param captured The clipped value in the brief.
 * @param expected The value in the binding.
 * @returns True when the prefix before the ellipsis matches.
 */
function clippedPrefixMatches(captured: string, expected: string): boolean {
	if (!captured.endsWith("…")) {
		return false;
	}
	const prefix = captured.slice(0, -1);
	return prefix.length < expected.length && expected.startsWith(prefix);
}

/**
 * Whether a captured identity value matches the bound one, admitting the
 * fitter's clipped prefix when the brief says it was truncated.
 * @param truncated Whether the brief was truncated.
 * @param captured The value in the brief.
 * @param expected The value in the binding.
 * @returns True when they agree.
 */
function identityMatches(
	truncated: boolean,
	captured: string | null,
	expected: string | null,
): boolean {
	if (captured === expected) {
		return true;
	}
	if (!truncated || captured === null || expected === null) {
		return false;
	}
	return clippedPrefixMatches(captured, expected);
}

/**
 * Whether a brief names the session it was captured for.
 * @param input The capture.
 * @param brief The parsed brief.
 * @returns True when every identity agrees.
 */
function sameCapturedIdentity(
	input: VoiceContextSessionCapture,
	brief: VoiceContextCanonicalBrief,
): boolean {
	const { binding } = input.session;
	if (binding === null) {
		return false;
	}
	const { truncated } = brief;
	return (
		identityMatches(truncated, brief.child.id, binding.childId) &&
		identityMatches(truncated, brief.child.epoch, binding.epoch) &&
		identityMatches(truncated, brief.workhorse.threadId, binding.workhorseThreadId) &&
		identityMatches(truncated, brief.coordinator.threadId, binding.coordinatorThreadId) &&
		identityMatches(truncated, brief.pane.paneId, binding.paneId)
	);
}

/**
 * The stream one source order belongs to.
 * @param order The source order.
 * @returns The stream key.
 */
function streamKey(order: VoiceContextSourceOrder): string {
	return order.kind === "semantic_sequence"
		? JSON.stringify([order.kind, order.feedId])
		: JSON.stringify([order.kind, order.ledgerId]);
}

/**
 * The position within a source stream.
 * @param order The source order.
 * @returns The position.
 */
function position(order: VoiceContextSourceOrder): number {
	return order.kind === "semantic_sequence" ? order.sequence : order.position;
}

/**
 * Whether a source order is well formed.
 * @param order The source order.
 * @returns True when the stream is named and the position is an index.
 */
function validOrder(order: VoiceContextSourceOrder): boolean {
	const identifier = order.kind === "semantic_sequence" ? order.feedId : order.ledgerId;
	return identifier.length > 0 && Number.isSafeInteger(position(order)) && position(order) >= 0;
}

/**
 * Whether an entry's freshness window and body are coherent.
 * @param entry The entry.
 * @returns True when the window is finite and ordered and the body fits.
 */
function validWindow(entry: VoiceContextLedgerEntry): boolean {
	const { capturedAtMs, freshUntilMs } = entry.freshness;
	return (
		Number.isFinite(capturedAtMs) &&
		Number.isFinite(freshUntilMs) &&
		freshUntilMs >= capturedAtMs &&
		new TextEncoder().encode(entry.body).byteLength <= BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES
	);
}

/** Delivery evidence as the wire may carry it, wider than the entry type admits. */
interface WireDelivery {
	readonly attempted: boolean;
	readonly attemptedAtMs: number | null;
	readonly outcome: string;
}

/**
 * Whether an attempted delivery's evidence is coherent.
 * @param wire The delivery evidence.
 * @param capturedAtMs When the entry was captured.
 * @returns True when the attempt time is finite, ordered, and the outcome known.
 */
function validAttempt(wire: WireDelivery, capturedAtMs: number): boolean {
	return (
		wire.attemptedAtMs !== null &&
		Number.isFinite(wire.attemptedAtMs) &&
		wire.attemptedAtMs >= capturedAtMs &&
		["delivered", "not_delivered", "outcome_unknown"].includes(wire.outcome)
	);
}

/**
 * Whether an entry's delivery evidence is coherent. The entry is read through
 * the wire's wider shape because the history validates untrusted evidence
 * whose contradictions the entry type cannot express.
 * @param entry The entry.
 * @returns True when attempt timing and outcome agree.
 */
function validDelivery(entry: VoiceContextLedgerEntry): boolean {
	if (!validWindow(entry)) {
		return false;
	}
	const wire: WireDelivery = entry;
	if (!wire.attempted) {
		return wire.attemptedAtMs === null && wire.outcome === "not_delivered";
	}
	return validAttempt(wire, entry.freshness.capturedAtMs);
}

/**
 * Whether two observations are the same evidence.
 * @param left One observation.
 * @param right Another observation.
 * @returns True when equal.
 */
function sameObservation(
	left: VoiceContextSessionEvidence,
	right: VoiceContextSessionEvidence,
): boolean {
	return (
		left.observedAtMs === right.observedAtMs &&
		left.provenance === right.provenance &&
		JSON.stringify(left.session) === JSON.stringify(right.session)
	);
}

export {
	boundKey,
	position,
	sameCapturedIdentity,
	sameObservation,
	streamKey,
	validDelivery,
	validOrder,
	voiceContextSessionKey,
};
