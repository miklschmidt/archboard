import type { VoiceSessionBinding, VoiceSessionView } from "../../voice-session/index.js";
import { BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES } from "../../../shared/codex-browser-model/index.js";
import type {
	VoiceContextAppend,
	VoiceContextHistory,
	VoiceContextHistorySnapshot,
	VoiceContextLedgerEntry,
	VoiceContextMutationIgnoredReason,
	VoiceContextMutationResult,
	VoiceContextSessionCapture,
	VoiceContextSessionEvidence,
	VoiceContextSessionRecord,
	VoiceContextSourceOrder,
} from "../contract.js";
import { parseCanonicalBrief } from "./semantic-brief.js";

function copyBinding(binding: VoiceSessionBinding): VoiceSessionBinding {
	return Object.freeze({ ...binding });
}

function copySession(value: VoiceSessionView): VoiceSessionView {
	return Object.freeze({
		...value,
		binding: value.binding === null ? null : copyBinding(value.binding),
		failure: value.failure === null ? null : Object.freeze({ ...value.failure }),
		outcome: Object.freeze({ ...value.outcome }),
		controls: Object.freeze({ ...value.controls }),
	});
}

function copyEvidence(value: VoiceContextSessionEvidence): VoiceContextSessionEvidence {
	return Object.freeze({
		session: copySession(value.session),
		observedAtMs: value.observedAtMs,
		provenance: value.provenance,
	});
}

function copyOrder(value: VoiceContextSourceOrder): VoiceContextSourceOrder {
	return Object.freeze({ ...value });
}

function copyEntry(value: VoiceContextLedgerEntry): VoiceContextLedgerEntry {
	const shared = {
		...value,
		sourceOrder: copyOrder(value.sourceOrder),
		freshness: Object.freeze({ ...value.freshness }),
	} as const;
	return value.attempted
		? Object.freeze({ ...shared, attempted: true, attemptedAtMs: value.attemptedAtMs })
		: Object.freeze({
				...shared,
				attempted: false,
				attemptedAtMs: null,
				outcome: "not_delivered",
			});
}

function boundKey(value: Pick<VoiceSessionView, "binding" | "sessionId">): string | null {
	if (value.binding === null || value.sessionId === null) return null;
	return JSON.stringify([
		value.binding.childId,
		value.binding.epoch,
		value.binding.workhorseThreadId,
		value.binding.coordinatorThreadId,
		value.sessionId,
		value.binding.paneId,
	]);
}

export function voiceContextSessionKey(
	value: Pick<VoiceSessionView, "binding" | "sessionId">,
): string {
	const key = boundKey(value);
	if (key === null) throw new TypeError("Voice context evidence requires a bound session view.");
	return key;
}

function sameCapturedIdentity(
	input: VoiceContextSessionCapture,
	brief: NonNullable<ReturnType<typeof parseCanonicalBrief>>,
): boolean {
	const { binding } = input.session;
	const matches = (captured: string | null, expected: string | null): boolean => {
		if (captured === expected) return true;
		if (!brief.truncated || captured === null || expected === null || !captured.endsWith("…"))
			return false;
		const prefix = captured.slice(0, -1);
		return prefix.length < expected.length && expected.startsWith(prefix);
	};
	return (
		binding !== null &&
		matches(brief.child.id, binding.childId) &&
		matches(brief.child.epoch, binding.epoch) &&
		matches(brief.workhorse.threadId, binding.workhorseThreadId) &&
		matches(brief.coordinator.threadId, binding.coordinatorThreadId) &&
		matches(brief.pane.paneId, binding.paneId)
	);
}

function streamKey(order: VoiceContextSourceOrder): string {
	return order.kind === "semantic_sequence"
		? JSON.stringify([order.kind, order.feedId])
		: JSON.stringify([order.kind, order.ledgerId]);
}

function position(order: VoiceContextSourceOrder): number {
	return order.kind === "semantic_sequence" ? order.sequence : order.position;
}

function validOrder(order: VoiceContextSourceOrder): boolean {
	const identifier = order.kind === "semantic_sequence" ? order.feedId : order.ledgerId;
	return identifier.length > 0 && Number.isSafeInteger(position(order)) && position(order) >= 0;
}

function validDelivery(entry: VoiceContextLedgerEntry): boolean {
	const capturedAtMs = entry.freshness.capturedAtMs;
	const freshUntilMs = entry.freshness.freshUntilMs;
	if (
		!Number.isFinite(capturedAtMs) ||
		!Number.isFinite(freshUntilMs) ||
		freshUntilMs < capturedAtMs ||
		new TextEncoder().encode(entry.body).byteLength > BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES
	)
		return false;
	if (!entry.attempted) return entry.attemptedAtMs === null && entry.outcome === "not_delivered";
	return (
		Number.isFinite(entry.attemptedAtMs) &&
		entry.attemptedAtMs >= capturedAtMs &&
		(entry.outcome === "delivered" ||
			entry.outcome === "not_delivered" ||
			entry.outcome === "outcome_unknown")
	);
}

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

function freezeRecord(value: VoiceContextSessionRecord): VoiceContextSessionRecord {
	return Object.freeze({
		...value,
		observations: Object.freeze([...value.observations]),
		entries: Object.freeze([...value.entries]),
	});
}

function freezeSnapshot(
	revision: number,
	sessions: readonly VoiceContextSessionRecord[],
): VoiceContextHistorySnapshot {
	return Object.freeze({ revision, sessions: Object.freeze([...sessions]) });
}

function ignored(
	reason: VoiceContextMutationIgnoredReason,
	revision: number,
): VoiceContextMutationResult {
	return Object.freeze({ outcome: "ignored", reason, revision });
}

/** Retains externally supplied evidence and never reads or transitions a session owner. */
export function createVoiceContextHistory(): VoiceContextHistory {
	let current = freezeSnapshot(0, []);
	const listeners = new Set<() => void>();
	const publish = (sessions: readonly VoiceContextSessionRecord[]): VoiceContextMutationResult => {
		current = freezeSnapshot(current.revision + 1, sessions);
		for (const listener of listeners) listener();
		return Object.freeze({ outcome: "applied", revision: current.revision });
	};
	const locate = (session: Pick<VoiceSessionView, "binding" | "sessionId">): number => {
		const key = boundKey(session);
		if (key === null) return -1;
		return current.sessions.findIndex((record) => boundKey(record.captured.session) === key);
	};
	return Object.freeze({
		snapshot: () => current,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		capture: (input: VoiceContextSessionCapture) => {
			if (boundKey(input.session) === null) return ignored("unbound_session", current.revision);
			if (locate(input.session) !== -1) return ignored("duplicate_session", current.revision);
			const brief = parseCanonicalBrief(input.canonicalBrief);
			if (brief === null) return ignored("invalid_brief", current.revision);
			if (!sameCapturedIdentity(input, brief))
				return ignored("identity_mismatch", current.revision);
			const evidence = copyEvidence(input);
			return publish([
				...current.sessions,
				freezeRecord({
					captured: Object.freeze({
						...evidence,
						canonicalBrief: input.canonicalBrief,
						brief,
					}),
					observations: Object.freeze([evidence]),
					entries: Object.freeze([]),
				}),
			]);
		},
		observe: (input: VoiceContextSessionEvidence) => {
			if (boundKey(input.session) === null) return ignored("unbound_session", current.revision);
			const index = locate(input.session);
			if (index === -1) return ignored("unknown_session", current.revision);
			const record = current.sessions[index]!;
			if (record.observations.some((observation) => sameObservation(observation, input)))
				return ignored("duplicate_observation", current.revision);
			const sessions = [...current.sessions];
			sessions[index] = freezeRecord({
				...record,
				observations: Object.freeze(
					[...record.observations, copyEvidence(input)].toSorted(
						(left, right) => left.observedAtMs - right.observedAtMs,
					),
				),
			});
			return publish(sessions);
		},
		append: (input: VoiceContextAppend) => {
			if (boundKey(input.session) === null) return ignored("unbound_session", current.revision);
			const index = locate(input.session);
			if (index === -1) return ignored("unknown_session", current.revision);
			if (!validOrder(input.entry.sourceOrder))
				return ignored("invalid_source_order", current.revision);
			if (!validDelivery(input.entry))
				return ignored("invalid_delivery_evidence", current.revision);
			const record = current.sessions[index]!;
			if (record.entries.some((entry) => entry.id === input.entry.id))
				return ignored("duplicate_entry", current.revision);
			const first = record.entries[0];
			if (
				first !== undefined &&
				streamKey(first.sourceOrder) !== streamKey(input.entry.sourceOrder)
			)
				return ignored("source_stream_mismatch", current.revision);
			if (
				record.entries.some(
					(entry) => position(entry.sourceOrder) === position(input.entry.sourceOrder),
				)
			)
				return ignored("source_order_conflict", current.revision);
			const sessions = [...current.sessions];
			sessions[index] = freezeRecord({
				...record,
				entries: Object.freeze(
					[...record.entries, copyEntry(input.entry)].toSorted(
						(left, right) => position(left.sourceOrder) - position(right.sourceOrder),
					),
				),
			});
			return publish(sessions);
		},
	});
}
