import type {
	VoiceContextAppend,
	VoiceContextBriefCondition,
	VoiceContextBriefStaleMutation,
	VoiceContextHistory,
	VoiceContextHistorySnapshot,
	VoiceContextLedgerEntry,
	VoiceContextMutationIgnoredReason,
	VoiceContextMutationResult,
	VoiceContextSessionIdentity,
	VoiceContextSessionRecord,
	VoiceContextSessionStart,
	VoiceContextStartBrief,
	VoiceContextStopMutation,
} from "../contract.js";

function copyIdentity(value: VoiceContextSessionIdentity): VoiceContextSessionIdentity {
	return Object.freeze({ ...value });
}

function copyBrief(value: VoiceContextStartBrief): VoiceContextStartBrief {
	return Object.freeze({
		...value,
		board: Object.freeze({ ...value.board }),
		selection: Object.freeze({
			...value.selection,
			elementIds: Object.freeze([...value.selection.elementIds]),
		}),
		claim: Object.freeze({ ...value.claim }),
		cursor: value.cursor === null ? null : Object.freeze({ ...value.cursor }),
		ambiguity: Object.freeze([...value.ambiguity]),
		staleness: Object.freeze({
			...value.staleness,
			reasons: Object.freeze([...value.staleness.reasons]),
		}),
	});
}

function copyEntry(value: VoiceContextLedgerEntry): VoiceContextLedgerEntry {
	return Object.freeze({ ...value });
}

function sameIdentity(
	left: VoiceContextSessionIdentity,
	right: VoiceContextSessionIdentity,
): boolean {
	return (
		left.childId === right.childId &&
		left.epoch === right.epoch &&
		left.workhorseThreadId === right.workhorseThreadId &&
		left.coordinatorThreadId === right.coordinatorThreadId &&
		left.realtimeSessionId === right.realtimeSessionId &&
		left.paneId === right.paneId
	);
}

export function voiceContextIdentityKey(identity: VoiceContextSessionIdentity): string {
	return JSON.stringify([
		identity.childId,
		identity.epoch,
		identity.workhorseThreadId,
		identity.coordinatorThreadId,
		identity.realtimeSessionId,
		identity.paneId,
	]);
}

function initialCondition(brief: VoiceContextStartBrief): VoiceContextBriefCondition {
	return brief.staleness.state === "current"
		? Object.freeze({ state: "current" })
		: Object.freeze({
				state: "stale",
				markedAtMs: brief.capturedAtMs,
				reasons: Object.freeze([...brief.staleness.reasons]),
			});
}

function freezeRecord(value: VoiceContextSessionRecord): VoiceContextSessionRecord {
	return Object.freeze({ ...value, entries: Object.freeze([...value.entries]) });
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

/**
 * Owns the complete process-local evidence ledger without retaining caller-owned
 * objects. A later publisher sample is not an input to any method here.
 */
export function createVoiceContextHistory(): VoiceContextHistory {
	let current = freezeSnapshot(0, []);
	const listeners = new Set<() => void>();

	const publish = (sessions: readonly VoiceContextSessionRecord[]): VoiceContextMutationResult => {
		current = freezeSnapshot(current.revision + 1, sessions);
		for (const listener of listeners) listener();
		return Object.freeze({ outcome: "applied", revision: current.revision });
	};

	const locate = (identity: VoiceContextSessionIdentity): number =>
		current.sessions.findIndex((session) => sameIdentity(session.identity, identity));

	const history: VoiceContextHistory = {
		snapshot: () => current,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		start: (input: VoiceContextSessionStart) => {
			if (locate(input.identity) !== -1) return ignored("duplicate_session", current.revision);
			const identity = copyIdentity(input.identity);
			const sessions = current.sessions.map((session) => {
				if (session.status.state !== "active") return session;
				return freezeRecord({
					...session,
					status: Object.freeze({
						state: "replaced",
						startedAtMs: session.status.startedAtMs,
						replacedAtMs: input.startedAtMs,
						replacedBy: identity,
					}),
				});
			});
			return publish([
				...sessions,
				freezeRecord({
					identity,
					brief: copyBrief(input.brief),
					briefCondition: initialCondition(input.brief),
					status: Object.freeze({ state: "active", startedAtMs: input.startedAtMs }),
					provenance: input.provenance,
					entries: Object.freeze([]),
				}),
			]);
		},
		append: (input: VoiceContextAppend) => {
			const index = locate(input.identity);
			if (index === -1) return ignored("unknown_session", current.revision);
			const session = current.sessions[index]!;
			if (session.entries.some((entry) => entry.id === input.entry.id))
				return ignored("duplicate_entry", current.revision);
			const sessions = [...current.sessions];
			sessions[index] = freezeRecord({
				...session,
				entries: Object.freeze([...session.entries, copyEntry(input.entry)]),
			});
			return publish(sessions);
		},
		markBriefStale: (input: VoiceContextBriefStaleMutation) => {
			const index = locate(input.identity);
			if (index === -1) return ignored("unknown_session", current.revision);
			const session = current.sessions[index]!;
			if (session.briefCondition.state === "stale")
				return ignored("already_stale", current.revision);
			const sessions = [...current.sessions];
			sessions[index] = freezeRecord({
				...session,
				briefCondition: Object.freeze({
					state: "stale",
					markedAtMs: input.markedAtMs,
					reasons: Object.freeze([...input.reasons]),
				}),
			});
			return publish(sessions);
		},
		stop: (input: VoiceContextStopMutation) => {
			const index = locate(input.identity);
			if (index === -1) return ignored("unknown_session", current.revision);
			const session = current.sessions[index]!;
			if (session.status.state !== "active") return ignored("session_not_active", current.revision);
			const sessions = [...current.sessions];
			sessions[index] = freezeRecord({
				...session,
				status: Object.freeze({
					state: "stopped",
					startedAtMs: session.status.startedAtMs,
					stoppedAtMs: input.stoppedAtMs,
				}),
			});
			return publish(sessions);
		},
	};
	return Object.freeze(history);
}
