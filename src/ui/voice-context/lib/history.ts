// The history: retains externally supplied evidence and never reads or
// transitions a session owner. Every retained value is a frozen copy.

import type { VoiceSessionBinding, VoiceSessionView } from "@/ui/voice-session";
import type {
	VoiceContextAppend,
	VoiceContextHistory,
	VoiceContextHistorySnapshot,
	VoiceContextLedgerEntry,
	VoiceContextMutationIgnoredReason,
	VoiceContextMutationResult,
	VoiceContextSessionCapture,
	VoiceContextSessionEvidence,
	VoiceContextSessionIdentity,
	VoiceContextSessionRecord,
	VoiceContextSourceHistory,
	VoiceContextSourceOrder,
} from "@/ui/voice-context/contract";
import {
	boundKey,
	position,
	sameCapturedIdentity,
	sameObservation,
	streamKey,
	validDelivery,
	validOrder,
} from "@/ui/voice-context/lib/history-validation";
import { parseCanonicalBrief } from "@/ui/voice-context/lib/semantic-brief";

/**
 * A frozen copy of a binding.
 * @param binding The binding.
 * @returns The copy.
 */
function copyBinding(binding: VoiceSessionBinding): VoiceSessionBinding {
	return Object.freeze({ ...binding });
}

/**
 * A frozen copy of a session view.
 * @param value The view.
 * @returns The copy.
 */
function copySession(value: VoiceSessionView): VoiceSessionView {
	return Object.freeze({
		...value,
		binding: value.binding === null ? null : copyBinding(value.binding),
		failure: value.failure === null ? null : Object.freeze({ ...value.failure }),
		outcome: Object.freeze({ ...value.outcome }),
		controls: Object.freeze({ ...value.controls }),
	});
}

/**
 * A frozen copy of an observation.
 * @param value The observation.
 * @returns The copy.
 */
function copyEvidence(value: VoiceContextSessionEvidence): VoiceContextSessionEvidence {
	return Object.freeze({
		session: copySession(value.session),
		observedAtMs: value.observedAtMs,
		provenance: value.provenance,
	});
}

/**
 * A frozen copy of a source order.
 * @param value The source order.
 * @returns The copy.
 */
function copyOrder(value: VoiceContextSourceOrder): VoiceContextSourceOrder {
	return Object.freeze({ ...value });
}

/**
 * A frozen copy of a ledger entry.
 * @param value The entry.
 * @returns The copy.
 */
function copyEntry(value: VoiceContextLedgerEntry): VoiceContextLedgerEntry {
	const shared = {
		...value,
		sourceOrder: copyOrder(value.sourceOrder),
		freshness: Object.freeze({ ...value.freshness }),
	};
	return value.attempted
		? Object.freeze({ ...shared, attempted: true, attemptedAtMs: value.attemptedAtMs })
		: Object.freeze({ ...shared, attempted: false, attemptedAtMs: null, outcome: "not_delivered" });
}

/**
 * A frozen record.
 * @param value The record.
 * @returns The frozen record.
 */
function freezeRecord(value: VoiceContextSessionRecord): VoiceContextSessionRecord {
	return Object.freeze({
		...value,
		observations: Object.freeze([...value.observations]),
		entries: Object.freeze([...value.entries]),
	});
}

/**
 * A frozen snapshot.
 * @param revision The revision.
 * @param sessions The sessions.
 * @returns The snapshot.
 */
function freezeSnapshot(
	revision: number,
	sessions: readonly VoiceContextSessionRecord[],
): VoiceContextHistorySnapshot {
	return Object.freeze({ revision, sessions: Object.freeze([...sessions]) });
}

/**
 * Why an entry's source order is refused against its record, or null.
 * @param record The record.
 * @param entry The entry.
 * @returns The refusal, or null.
 */
function orderRefusal(
	record: VoiceContextSessionRecord,
	entry: VoiceContextLedgerEntry,
): VoiceContextMutationIgnoredReason | null {
	const first = record.entries[0];
	if (first !== undefined && streamKey(first.sourceOrder) !== streamKey(entry.sourceOrder)) {
		return "source_stream_mismatch";
	}
	const taken = record.entries.some(
		(existing) => position(existing.sourceOrder) === position(entry.sourceOrder),
	);
	return taken ? "source_order_conflict" : null;
}

/**
 * Why an appended entry is refused against its record, or null when admitted.
 * @param record The record.
 * @param entry The entry.
 * @returns The refusal, or null.
 */
function appendRefusal(
	record: VoiceContextSessionRecord,
	entry: VoiceContextLedgerEntry,
): VoiceContextMutationIgnoredReason | null {
	if (!validOrder(entry.sourceOrder)) {
		return "invalid_source_order";
	}
	if (!validDelivery(entry)) {
		return "invalid_delivery_evidence";
	}
	if (record.entries.some((existing) => existing.id === entry.id)) {
		return "duplicate_entry";
	}
	return orderRefusal(record, entry);
}

/**
 * Whether a source history report is well formed.
 * @param input The report.
 * @returns True when both counts are indexes and ordered.
 */
function validSourceHistory(input: VoiceContextSourceHistory): boolean {
	return (
		Number.isSafeInteger(input.ownerOmittedPrefixCount) &&
		input.ownerOmittedPrefixCount >= 0 &&
		Number.isSafeInteger(input.sourceEntryCount) &&
		input.sourceEntryCount >= input.ownerOmittedPrefixCount
	);
}

/**
 * Creates a history.
 * @returns The history.
 */
function createVoiceContextHistory(): VoiceContextHistory {
	let current = freezeSnapshot(0, []);
	const listeners = new Set<() => void>();

	/**
	 * Publishes a new revision.
	 * @param sessions The sessions.
	 * @returns The applied result.
	 */
	const publish = (sessions: readonly VoiceContextSessionRecord[]): VoiceContextMutationResult => {
		current = freezeSnapshot(current.revision + 1, sessions);
		for (const listener of listeners) {
			listener();
		}
		return Object.freeze({ outcome: "applied", revision: current.revision });
	};

	/**
	 * An ignored result at the current revision.
	 * @param reason Why.
	 * @returns The result.
	 */
	const ignored = (reason: VoiceContextMutationIgnoredReason): VoiceContextMutationResult =>
		Object.freeze({ outcome: "ignored", reason, revision: current.revision });

	/**
	 * The index of a session's record.
	 * @param session The session identity.
	 * @returns The index, or -1.
	 */
	const locate = (session: VoiceContextSessionIdentity): number => {
		const key = boundKey(session);
		if (key === null) {
			return -1;
		}
		return current.sessions.findIndex((record) => boundKey(record.captured.session) === key);
	};

	/**
	 * Replaces one record and publishes.
	 * @param index The record's index.
	 * @param record The new record.
	 * @returns The applied result.
	 */
	const replace = (
		index: number,
		record: VoiceContextSessionRecord,
	): VoiceContextMutationResult => {
		const sessions = [...current.sessions];
		sessions[index] = freezeRecord(record);
		return publish(sessions);
	};

	/**
	 * Captures a session's brief.
	 * @param input The capture.
	 * @returns The result.
	 */
	const capture = (input: VoiceContextSessionCapture): VoiceContextMutationResult => {
		if (boundKey(input.session) === null) {
			return ignored("unbound_session");
		}
		if (locate(input.session) !== -1) {
			return ignored("duplicate_session");
		}
		const brief = parseCanonicalBrief(input.canonicalBrief);
		if (brief === null) {
			return ignored("invalid_brief");
		}
		if (!sameCapturedIdentity(input, brief)) {
			return ignored("identity_mismatch");
		}
		const evidence = copyEvidence(input);
		return publish([
			...current.sessions,
			freezeRecord({
				captured: Object.freeze({ ...evidence, canonicalBrief: input.canonicalBrief, brief }),
				observations: Object.freeze([evidence]),
				entries: Object.freeze([]),
				ownerOmittedPrefixCount: 0,
				sourceEntryCount: 0,
			}),
		]);
	};

	/**
	 * Observes a session view.
	 * @param input The observation.
	 * @returns The result.
	 */
	const observe = (input: VoiceContextSessionEvidence): VoiceContextMutationResult => {
		if (boundKey(input.session) === null) {
			return ignored("unbound_session");
		}
		const index = locate(input.session);
		const record = current.sessions[index];
		if (record === undefined) {
			return ignored("unknown_session");
		}
		if (record.observations.some((observation) => sameObservation(observation, input))) {
			return ignored("duplicate_observation");
		}
		const observations = [...record.observations, copyEvidence(input)].toSorted(
			(left, right) => left.observedAtMs - right.observedAtMs,
		);
		return replace(index, { ...record, observations });
	};

	/**
	 * Appends a later entry.
	 * @param input The append.
	 * @returns The result.
	 */
	const append = (input: VoiceContextAppend): VoiceContextMutationResult => {
		if (boundKey(input.session) === null) {
			return ignored("unbound_session");
		}
		const index = locate(input.session);
		const record = current.sessions[index];
		if (record === undefined) {
			return ignored("unknown_session");
		}
		const refusal = appendRefusal(record, input.entry);
		if (refusal !== null) {
			return ignored(refusal);
		}
		const entries = [...record.entries, copyEntry(input.entry)].toSorted(
			(left, right) => position(left.sourceOrder) - position(right.sourceOrder),
		);
		return replace(index, { ...record, entries });
	};

	/**
	 * Records what the source owner no longer holds.
	 * @param input The report.
	 * @returns The result.
	 */
	const recordSourceHistory = (input: VoiceContextSourceHistory): VoiceContextMutationResult => {
		if (boundKey(input.session) === null) {
			return ignored("unbound_session");
		}
		if (!validSourceHistory(input)) {
			return ignored("invalid_source_history");
		}
		const index = locate(input.session);
		const record = current.sessions[index];
		if (record === undefined) {
			return ignored("unknown_session");
		}
		const ownerOmittedPrefixCount = Math.max(
			record.ownerOmittedPrefixCount,
			input.ownerOmittedPrefixCount,
		);
		const sourceEntryCount = Math.max(record.sourceEntryCount, input.sourceEntryCount);
		if (
			ownerOmittedPrefixCount === record.ownerOmittedPrefixCount &&
			sourceEntryCount === record.sourceEntryCount
		) {
			return ignored("duplicate_source_history");
		}
		return replace(index, { ...record, ownerOmittedPrefixCount, sourceEntryCount });
	};

	return Object.freeze({
		/**
		 * The current snapshot.
		 * @returns The snapshot.
		 */
		snapshot: () => current,
		/**
		 * Subscribes.
		 * @param listener The listener.
		 * @returns The unsubscribe function.
		 */
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		capture,
		observe,
		append,
		recordSourceHistory,
	});
}

export { createVoiceContextHistory };
