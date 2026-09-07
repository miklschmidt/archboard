import {
	CodexEpochError,
	type EpochExecutionProof,
	type EpochManifest,
	type EpochOperationRecord,
} from "@/runtime/codex-epoch";
import {
	cloneAndFreeze,
	deepEqual,
	isEpochExecutionProof,
	isEpochOperationRecord,
	proofMatchesManifest,
} from "@/runtime/codex-thread-link/lib/provenance";
import {
	CodexThreadLinkError,
	type CodexThreadLinkClassifierOptions,
	type ThreadLinkEpochAuthority,
	type ThreadLinkReason,
	type ThreadLinkTarget,
} from "@/runtime/codex-thread-link/lib/contract";
import { authoredReason } from "@/runtime/codex-thread-link/lib/thread-vocabulary";

/** The provenance a target supplied, reduced to its record and the revision it claims. */
interface SuppliedEvidence {
	readonly record: EpochOperationRecord;
	readonly manifestRevision: number | null;
}

/** What the durable epoch authority proved about a target, and why it fell short if it did. */
interface DurableEvidence {
	readonly record: EpochOperationRecord | null;
	readonly proof: EpochExecutionProof | null;
	readonly reason: ThreadLinkReason | null;
}

/** A target whose fields let the durable authority be consulted at all. */
interface ProvableTarget extends ThreadLinkTarget {
	readonly childId: NonNullable<ThreadLinkTarget["childId"]>;
	readonly epoch: NonNullable<ThreadLinkTarget["epoch"]>;
	readonly operationId: string;
}

/**
 * The refusal each epoch-error code earns. A code absent from this table is not a refusal at
 * all: it means the authority itself could not be read.
 */
const EPOCH_ERROR_CONDITIONS: ReadonlyMap<string, Parameters<typeof authoredReason>[0]> = new Map([
	["stale_child", "link_child_is_not_current_child"],
	["prior_epoch", "link_or_provenance_epoch_is_prior"],
	["unknown_provenance", "current_epoch_ownership_is_unproven"],
	["inspect_only", "current_epoch_ownership_is_unproven"],
	["not_executable", "current_epoch_ownership_is_unproven"],
	["not_initialized", "current_epoch_ownership_is_unproven"],
	["invalid_input", "current_epoch_ownership_is_unproven"],
]);

/**
 * The evidence a target supplied, whether a proof or a bare record.
 * @param target The target.
 * @returns The evidence, or null when none was supplied or it is malformed.
 */
function suppliedEvidence(target: ThreadLinkTarget): SuppliedEvidence | null {
	const value = target.provenance;
	if (value === undefined || value === null) {
		return null;
	}
	if (isEpochExecutionProof(value)) {
		return { record: value.record, manifestRevision: value.manifestRevision };
	}
	if (isEpochOperationRecord(value)) {
		return { record: value, manifestRevision: null };
	}
	return null;
}

/**
 * Whether a target supplied provenance that is neither a proof nor a record.
 * @param target The target.
 * @returns True for malformed provenance.
 */
function hasMalformedEvidence(target: ThreadLinkTarget): boolean {
	return (
		target.provenance !== undefined &&
		target.provenance !== null &&
		suppliedEvidence(target) === null
	);
}

/**
 * Whether a record is a thread/start whose settlement was lost, which earns its own reason.
 * @param record The record.
 * @returns True for an inspect-only, outcome-unknown thread/start.
 */
function isThreadStartOutcomeUnknown(record: EpochOperationRecord): boolean {
	return (
		record.status === "inspect_only" &&
		record.outcome === "outcome_unknown" &&
		record.operation.rpc === "thread/start"
	);
}

/**
 * The epoch-unavailable error for an authority that could not be read.
 * @param message What could not be read.
 * @param cause The underlying failure.
 * @returns The error.
 */
function epochUnavailable(message: string, cause?: unknown): CodexThreadLinkError {
	return new CodexThreadLinkError("current_epoch_unavailable", message, cause);
}

/**
 * The single manifest record for an operation.
 * @param manifest The manifest.
 * @param operationId The operation id.
 * @returns The record, or null when none, several, or a malformed one match.
 */
function recordForOperation(
	manifest: EpochManifest,
	operationId: string,
): EpochOperationRecord | null {
	const matches = manifest.records.filter(
		(record) => record.correlation.operationId === operationId,
	);
	if (matches.length !== 1) {
		return null;
	}
	const record = matches[0] ?? null;
	return record !== null && isEpochOperationRecord(record) ? record : null;
}

/**
 * The reason an assertCurrent failure earns.
 * @param error What assertCurrent threw.
 * @param record The manifest record for the target, if any.
 * @returns The reason.
 */
function reasonForEpochError(
	error: unknown,
	record: EpochOperationRecord | null,
): ThreadLinkReason {
	if (!(error instanceof CodexEpochError)) {
		return authoredReason("current_epoch_ownership_is_unproven");
	}
	if (error.code === "inspect_only" && record !== null && isThreadStartOutcomeUnknown(record)) {
		return authoredReason("thread_start_settlement_was_lost");
	}
	const condition = EPOCH_ERROR_CONDITIONS.get(error.code);
	if (condition === undefined) {
		throw epochUnavailable(
			"The live epoch proof could not be read; the thread link was not classified.",
			error,
		);
	}
	return authoredReason(condition);
}

/**
 * Whether the target names everything the durable authority needs.
 * @param target The target.
 * @returns True when child, epoch and operation are all present.
 */
function isProvableTarget(target: ThreadLinkTarget): target is ProvableTarget {
	return target.operationId !== undefined && target.childId !== null && target.epoch !== null;
}

/**
 * Reads the manifest, charging a failure to the epoch authority.
 * @param epoch The authority.
 * @param detail What the read was for, for the failure message.
 * @returns The manifest.
 */
function readManifest(epoch: ThreadLinkEpochAuthority, detail: string): EpochManifest {
	try {
		return epoch.snapshot().manifest;
	} catch (error) {
		throw epochUnavailable(`${detail}; the thread link was not classified.`, error);
	}
}

/**
 * Asks the authority to prove the target current.
 * @param epoch The authority.
 * @param target The target.
 * @param observedRecord The manifest record, for classifying a refusal.
 * @returns The proof, or the reason it was refused.
 */
function proveCurrent(
	epoch: ThreadLinkEpochAuthority,
	target: ProvableTarget,
	observedRecord: EpochOperationRecord,
): { readonly proof: EpochExecutionProof } | { readonly reason: ThreadLinkReason } {
	try {
		return {
			proof: epoch.assertCurrent({
				childId: target.childId,
				epoch: target.epoch,
				operationId: target.operationId,
				threadId: target.threadId,
			}),
		};
	} catch (error) {
		return { reason: reasonForEpochError(error, observedRecord) };
	}
}

/**
 * Whether a proof still describes the manifest as it is now and the record as first observed.
 * @param proof The proof.
 * @param manifest The current manifest.
 * @param target The target.
 * @param observedRecord The record read before proving.
 * @returns True when the proof can be adopted.
 */
function proofIsCurrent(
	proof: EpochExecutionProof,
	manifest: EpochManifest,
	target: ProvableTarget,
	observedRecord: EpochOperationRecord,
): boolean {
	return (
		isEpochExecutionProof(proof) &&
		proofMatchesManifest(proof, manifest) &&
		proof.record.correlation.operationId === target.operationId &&
		deepEqual(observedRecord, proof.record)
	);
}

/**
 * The reason the active epoch refuses the target, if any.
 * @param manifest The current manifest.
 * @param target The target.
 * @returns The reason, or null when the target names the active child and epoch.
 */
function activeEpochReason(
	manifest: EpochManifest,
	target: ProvableTarget,
): ThreadLinkReason | null {
	const activeEpoch = manifest.activeEpoch;
	if (activeEpoch === null) {
		return authoredReason("current_epoch_ownership_is_unproven");
	}
	if (activeEpoch.childId !== target.childId) {
		return authoredReason("link_child_is_not_current_child");
	}
	if (activeEpoch.epoch !== target.epoch) {
		return authoredReason("link_or_provenance_epoch_is_prior");
	}
	return null;
}

/**
 * Whether the evidence a target supplied contradicts the live proof.
 * @param evidence The supplied evidence, if any.
 * @param proof The live proof.
 * @returns True when the supplied record or revision differs.
 */
function suppliedEvidenceConflicts(
	evidence: SuppliedEvidence | null,
	proof: EpochExecutionProof,
): boolean {
	if (evidence === null) {
		return false;
	}
	return (
		!deepEqual(evidence.record, proof.record) ||
		(evidence.manifestRevision !== null && evidence.manifestRevision !== proof.manifestRevision)
	);
}

/**
 * Judges a live proof against the current manifest, the active epoch and any supplied evidence.
 * @param epoch The authority.
 * @param target The target.
 * @param observedRecord The record read before proving.
 * @param proof The live proof.
 * @returns The evidence, with the proof retained only when every check passes.
 */
function judgeProof(
	epoch: ThreadLinkEpochAuthority,
	target: ProvableTarget,
	observedRecord: EpochOperationRecord,
	proof: EpochExecutionProof,
): DurableEvidence {
	const unknown = authoredReason("current_epoch_ownership_is_unproven");
	const manifest = readManifest(epoch, "The durable epoch manifest changed before proof adoption");
	if (!proofIsCurrent(proof, manifest, target, observedRecord)) {
		return { record: observedRecord, proof: null, reason: unknown };
	}
	const activeReason = activeEpochReason(manifest, target);
	if (activeReason !== null) {
		return { record: proof.record, proof: null, reason: activeReason };
	}
	if (suppliedEvidenceConflicts(suppliedEvidence(target), proof)) {
		return { record: proof.record, proof: null, reason: unknown };
	}
	return { record: proof.record, proof: cloneAndFreeze(proof), reason: null };
}

/**
 * What the durable epoch authority can prove about a target: its manifest record, a live
 * proof when the target is current, and otherwise the reason it is not.
 * @param options The classifier options, whose epoch authority is consulted when present.
 * @param target The target.
 * @returns The evidence.
 */
function durableEvidence(
	options: CodexThreadLinkClassifierOptions,
	target: ThreadLinkTarget,
): DurableEvidence {
	const unknown = authoredReason("current_epoch_ownership_is_unproven");
	if (hasMalformedEvidence(target) || options.epoch === undefined || !isProvableTarget(target)) {
		return { record: null, proof: null, reason: unknown };
	}
	const manifest = readManifest(options.epoch, "The durable epoch manifest could not be read");
	const observedRecord = recordForOperation(manifest, target.operationId);
	if (observedRecord === null) {
		return { record: null, proof: null, reason: unknown };
	}
	const proven = proveCurrent(options.epoch, target, observedRecord);
	if ("reason" in proven) {
		return { record: observedRecord, proof: null, reason: proven.reason };
	}
	return judgeProof(options.epoch, target, observedRecord, proven.proof);
}

export { durableEvidence };
export type { DurableEvidence };
