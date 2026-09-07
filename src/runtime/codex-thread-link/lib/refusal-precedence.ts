import type { EpochOperationRecord } from "@/runtime/codex-epoch";
import type { SessionThread } from "@/runtime/codex-session";
import type {
	ThreadLink,
	ThreadLinkCondition,
	ThreadLinkCurrentEpoch,
	ThreadLinkExecutableStatus,
	ThreadLinkObservation,
	ThreadLinkReason,
	ThreadLinkTarget,
} from "@/runtime/codex-thread-link/lib/contract";
import {
	REASON_PRECEDENCE,
	authoredReason,
	isAllowedThreadLinkSource,
	isExecutableThreadLinkStatus,
	observedDirectInput,
	sourceOf,
	sourceReason,
	statusOf,
	statusReason,
} from "@/runtime/codex-thread-link/lib/thread-vocabulary";

/** Everything the precedence table judges about one target. */
interface RefusalInput {
	readonly target: ThreadLinkTarget;
	readonly started: ThreadLinkCurrentEpoch | null;
	readonly ended: ThreadLinkCurrentEpoch | null;
	readonly record: EpochOperationRecord | null;
	readonly durableReason: ThreadLinkReason | null;
	readonly persistedRows: number;
	readonly loadedOccurrences: number;
	readonly thread: SessionThread | null;
	readonly ownedCreatedRoot: boolean;
}

/**
 * The reason a change of epoch between the two reads earns, if any.
 * @param started The epoch when classification started.
 * @param ended The epoch when it ended.
 * @returns The reason, or null when the epoch held.
 */
function epochChangeReason(
	started: ThreadLinkCurrentEpoch | null,
	ended: ThreadLinkCurrentEpoch | null,
): ThreadLinkReason | null {
	if (started === null || ended === null) {
		return started === ended ? null : authoredReason("current_epoch_ownership_is_unproven");
	}
	if (started.childId !== ended.childId) {
		return authoredReason("link_child_is_not_current_child");
	}
	if (started.epoch !== ended.epoch) {
		return authoredReason("link_or_provenance_epoch_is_prior");
	}
	return null;
}

/**
 * The reason the target's own child and epoch earn against the current epoch, if any.
 * @param target The target.
 * @param ended The current epoch.
 * @returns The reason, or null when the target names the current epoch.
 */
function targetEpochReason(
	target: ThreadLinkTarget,
	ended: ThreadLinkCurrentEpoch,
): ThreadLinkReason | null {
	if (target.childId === null || target.epoch === null) {
		return authoredReason("current_epoch_ownership_is_unproven");
	}
	if (target.childId !== ended.childId) {
		return authoredReason("link_child_is_not_current_child");
	}
	if (target.epoch !== ended.epoch) {
		return authoredReason("link_or_provenance_epoch_is_prior");
	}
	return null;
}

/**
 * The reason the manifest record earns against the current epoch, if any.
 * @param record The record.
 * @param ended The current epoch.
 * @returns The reason, or null when the record belongs to the current epoch.
 */
function recordEpochReason(
	record: EpochOperationRecord,
	ended: ThreadLinkCurrentEpoch,
): ThreadLinkReason | null {
	if (record.correlation.childId !== ended.childId || record.provenance.childId !== ended.childId) {
		return authoredReason("link_child_is_not_current_child");
	}
	if (record.correlation.epoch !== ended.epoch || record.provenance.epoch !== ended.epoch) {
		return authoredReason("link_or_provenance_epoch_is_prior");
	}
	return null;
}

/**
 * The reason the record does not show the target's own thread as settled and delivered.
 * @param target The target.
 * @param record The record.
 * @returns The reason, or null when the record names the thread and was delivered.
 */
function deliveredThreadReason(
	target: ThreadLinkTarget,
	record: EpochOperationRecord,
): ThreadLinkReason | null {
	if (record.provenance.threadId !== target.threadId) {
		return authoredReason("current_epoch_ownership_is_unproven");
	}
	if (record.status !== "committed" || record.outcome !== "delivered") {
		return authoredReason("current_epoch_ownership_is_unproven");
	}
	return null;
}

/**
 * The reason the record fails to prove the target's thread was started and delivered, if any.
 * @param target The target.
 * @param record The record.
 * @param durableReason The reason the durable authority gave, if any.
 * @returns The reason, or null when the record proves ownership.
 */
function recordOwnershipReason(
	target: ThreadLinkTarget,
	record: EpochOperationRecord,
	durableReason: ThreadLinkReason | null,
): ThreadLinkReason | null {
	if (target.operationId !== undefined && record.correlation.operationId !== target.operationId) {
		return authoredReason("current_epoch_ownership_is_unproven");
	}
	if (durableReason !== null) {
		return durableReason;
	}
	return deliveredThreadReason(target, record);
}

/**
 * The ownership reason for a target: the epoch held, the target and record name it, and the
 * record proves the thread was delivered.
 * @param target The target.
 * @param started The epoch when classification started.
 * @param ended The epoch when it ended.
 * @param record The manifest record, if any.
 * @param durableReason The reason the durable authority gave, if any.
 * @returns The first ownership reason found, or null when ownership is proven.
 */
function ownershipReason(
	target: ThreadLinkTarget,
	started: ThreadLinkCurrentEpoch | null,
	ended: ThreadLinkCurrentEpoch | null,
	record: EpochOperationRecord | null,
	durableReason: ThreadLinkReason | null,
): ThreadLinkReason | null {
	const changed = epochChangeReason(started, ended);
	if (changed !== null) {
		return changed;
	}
	if (ended === null) {
		return authoredReason("current_epoch_ownership_is_unproven");
	}
	const targetReason = targetEpochReason(target, ended);
	if (targetReason !== null) {
		return targetReason;
	}
	if (record === null) {
		return authoredReason("current_epoch_ownership_is_unproven");
	}
	return recordEpochReason(record, ended) ?? recordOwnershipReason(target, record, durableReason);
}

/**
 * The refusal conditions derived from ownership.
 * @param ownership The ownership reason, if any.
 * @returns The ownership conditions and whether each holds.
 */
function ownershipConditions(
	ownership: ThreadLinkReason | null,
): readonly (readonly [ThreadLinkCondition, boolean])[] {
	return [
		[
			"link_child_is_not_current_child",
			ownership === authoredReason("link_child_is_not_current_child"),
		],
		[
			"link_or_provenance_epoch_is_prior",
			ownership === authoredReason("link_or_provenance_epoch_is_prior"),
		],
		[
			"thread_start_settlement_was_lost",
			ownership === authoredReason("thread_start_settlement_was_lost"),
		],
		[
			"current_epoch_ownership_is_unproven",
			ownership === authoredReason("current_epoch_ownership_is_unproven"),
		],
	];
}

/**
 * The refusal conditions derived from the observed thread row.
 * @param thread The thread row, if one was observed.
 * @returns The thread conditions and whether each holds.
 */
function threadConditions(
	thread: SessionThread | null,
): readonly (readonly [ThreadLinkCondition, boolean])[] {
	const source = thread === null ? "unknown" : sourceOf(thread);
	const status = thread === null ? null : statusOf(thread);
	const directInput = thread === null ? null : observedDirectInput(thread);
	const statusOutcome = status === null ? null : statusReason(status);
	return [
		["thread_source_is_custom", sourceReason(source) === authoredReason("thread_source_is_custom")],
		[
			"thread_source_is_subagent",
			sourceReason(source) === authoredReason("thread_source_is_subagent"),
		],
		[
			"thread_source_is_unknown",
			sourceReason(source) === authoredReason("thread_source_is_unknown"),
		],
		[
			"thread_status_is_not_loaded",
			statusOutcome === authoredReason("thread_status_is_not_loaded"),
		],
		[
			"thread_status_is_system_error",
			statusOutcome === authoredReason("thread_status_is_system_error"),
		],
		["direct_input_capability_is_false", directInput === false],
		["direct_input_capability_is_null", directInput === null && thread !== null],
	];
}

/**
 * Every refusal condition the policy names, evaluated for one target.
 * @param input What was observed and proven.
 * @returns The conditions and whether each holds.
 */
function refusalConditions(input: RefusalInput): Map<ThreadLinkCondition, boolean> {
	const ownership = ownershipReason(
		input.target,
		input.started,
		input.ended,
		input.record,
		input.durableReason,
	);
	return new Map<ThreadLinkCondition, boolean>([
		...ownershipConditions(ownership),
		["persisted_target_row_is_missing", input.persistedRows === 0 && !input.ownedCreatedRoot],
		["persisted_target_rows_conflict", input.persistedRows > 1],
		["loaded_target_membership_is_duplicate_or_conflicting", input.loadedOccurrences > 1],
		...threadConditions(input.thread),
		["loaded_target_membership_is_missing", input.loadedOccurrences === 0],
	]);
}

/**
 * The first refusal in the authored precedence whose condition holds.
 * @param input What was observed and proven.
 * @returns The reason, or null when the link is executable.
 */
function classifyReason(input: RefusalInput): ThreadLinkReason | null {
	const conditions = refusalConditions(input);
	if (
		conditions.size !== REASON_PRECEDENCE.length ||
		REASON_PRECEDENCE.some((entry) => !conditions.has(entry.condition))
	) {
		throw new Error("additional-context thread-link policy has an unimplemented refusal condition");
	}
	const refused = REASON_PRECEDENCE.find((entry) => conditions.get(entry.condition) === true);
	return refused === undefined ? null : refused.reason;
}

/**
 * What was observed about the target across both lists.
 * @param thread The thread row, if one was observed.
 * @param loadedOccurrences How many times the loaded list named the thread.
 * @param persistedRows How many persisted rows named the thread.
 * @returns The observation.
 */
function observationFor(
	thread: SessionThread | null,
	loadedOccurrences: number,
	persistedRows: number,
): ThreadLinkObservation {
	const counts = {
		persisted: persistedRows > 0,
		persistedRows,
		loaded: loadedOccurrences > 0,
		loadedOccurrences,
	};
	if (thread === null) {
		return Object.freeze({
			...counts,
			source: "unknown",
			status: "notLoaded",
			canAcceptDirectInput: null,
		});
	}
	return Object.freeze({
		...counts,
		source: sourceOf(thread),
		status: statusOf(thread),
		canAcceptDirectInput: observedDirectInput(thread),
	});
}

/**
 * Whether an observed status allows execution.
 * @param value The status.
 * @returns True for an executable status.
 */
function isExecutableStatus(
	value: ThreadLinkObservation["status"],
): value is ThreadLinkExecutableStatus {
	return isExecutableThreadLinkStatus(value);
}

/**
 * The link a classification publishes: executable under the current epoch, or inspect-only
 * with its reason.
 * @param target The target.
 * @param current The current epoch.
 * @param observation What was observed.
 * @param refusal The reason, if any.
 * @returns The link.
 */
function linkFor(
	target: ThreadLinkTarget,
	current: ThreadLinkCurrentEpoch | null,
	observation: ThreadLinkObservation,
	refusal: ThreadLinkReason | null,
): ThreadLink {
	if (refusal !== null) {
		return Object.freeze({
			kind: "thread_link" as const,
			state: "inspect_only" as const,
			childId: null,
			epoch: null,
			threadId: target.threadId,
			source: observation.source,
			status: observation.status,
			loaded: observation.loaded,
			canAcceptDirectInput: false as const,
			reason: refusal,
		});
	}
	if (
		current === null ||
		!isAllowedThreadLinkSource(observation.source) ||
		!isExecutableStatus(observation.status)
	) {
		throw new Error("an executable link failed its final source, status, or epoch guard");
	}
	return Object.freeze({
		kind: "thread_link" as const,
		state: "executable" as const,
		childId: current.childId,
		epoch: current.epoch,
		threadId: target.threadId,
		source: observation.source,
		status: observation.status,
		loaded: true as const,
		canAcceptDirectInput: true as const,
		reason: null,
	});
}

export { classifyReason, linkFor, observationFor, ownershipReason };
export type { RefusalInput };
