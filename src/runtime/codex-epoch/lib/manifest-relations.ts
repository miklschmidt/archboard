import type {
	DiskState,
	EpochCasToken,
	EpochTransaction,
} from "@/runtime/codex-epoch/lib/contract";
import type {
	EpochManifest,
	EpochOperationCorrelation,
	EpochOperationRecord,
} from "@/runtime/codex-epoch/lib/manifest";
import { epochError, isSafeInteger, HASH_PATTERN } from "@/runtime/codex-epoch/lib/epoch-identity";

const EPOCH_START_KIND = "epoch_start";
const CAS_KEYS: readonly string[] = ["revision", "bytesHash"];

/**
 * Find the durable record a transaction refers to, refusing one that belongs to another child
 * epoch than the transaction claims.
 * @param manifest - The durable manifest.
 * @param transaction - The staged transaction.
 * @returns The record.
 */
function findRecord(manifest: EpochManifest, transaction: EpochTransaction): EpochOperationRecord {
	const record = manifest.records.find(
		(candidate) => candidate.correlation.operationId === transaction.record.correlation.operationId,
	);
	if (record === undefined) {
		throw epochError(
			"unknown_provenance",
			`operation ${transaction.record.correlation.operationId} is absent from the epoch manifest`,
		);
	}
	if (
		record.correlation.childId !== transaction.record.correlation.childId ||
		record.correlation.epoch !== transaction.record.correlation.epoch
	) {
		throw epochError("conflict", "transaction correlation does not match the durable record");
	}
	return record;
}

/**
 * Whether two records describe the same staged input, which is what lets a transaction be
 * settled against a record read back from disk.
 * @param left - One record.
 * @param right - The other.
 * @returns True when the operation and its context match.
 */
function sameRecordInput(left: EpochOperationRecord, right: EpochOperationRecord): boolean {
	return (
		left.operation.id === right.operation.id &&
		left.operation.kind === right.operation.kind &&
		left.operation.rpc === right.operation.rpc &&
		left.provenance.workspaceRoot === right.provenance.workspaceRoot &&
		left.provenance.instructionHash === right.provenance.instructionHash &&
		left.provenance.manifestHash === right.provenance.manifestHash
	);
}

/**
 * Find the still-staged record a transaction settles, refusing one that has already reached a
 * terminal state or whose input has changed underneath.
 * @param manifest - The durable manifest.
 * @param transaction - The staged transaction.
 * @returns The staged record.
 */
function findStagedRecord(
	manifest: EpochManifest,
	transaction: EpochTransaction,
): EpochOperationRecord {
	const record = findRecord(manifest, transaction);
	if (record.status !== "staged" || record.outcome !== "pending") {
		throw epochError(
			"invalid_transition",
			`operation ${transaction.record.correlation.operationId} is terminal and cannot be rewritten`,
		);
	}
	if (!sameRecordInput(record, transaction.record)) {
		throw epochError("conflict", "transaction input no longer matches the durable record");
	}
	return record;
}

/**
 * Refuse an operation that does not belong to the manifest's active child epoch.
 * @param manifest - The durable manifest.
 * @param correlation - The operation's correlation.
 */
function assertCurrentGeneration(
	manifest: EpochManifest,
	correlation: EpochOperationCorrelation,
): void {
	const active = manifest.activeEpoch;
	if (active === null) {
		throw epochError("not_initialized", "no child epoch has been committed");
	}
	if (active.childId !== correlation.childId) {
		throw epochError("stale_child", "the operation belongs to a replaced child");
	}
	if (active.epoch !== correlation.epoch) {
		throw epochError("prior_epoch", "the operation belongs to a prior epoch");
	}
}

/**
 * Whether an epoch start would re-start the epoch that is already active.
 * @param manifest - The durable manifest.
 * @param childId - The child being started.
 * @param epoch - The epoch being started.
 * @returns True when the active epoch is exactly this one.
 */
function startsActiveEpoch(
	manifest: EpochManifest,
	childId: EpochOperationCorrelation["childId"],
	epoch: EpochOperationCorrelation["epoch"],
): boolean {
	const active = manifest.activeEpoch;
	return active?.childId === childId && active.epoch === epoch;
}

/**
 * Refuse a staged operation that the manifest's generation does not admit: an epoch start
 * cannot repeat the active epoch, and anything else must belong to it.
 * @param manifest - The durable manifest.
 * @param input - The staged operation's identity and kind.
 */
function assertStageGeneration(
	manifest: EpochManifest,
	input: EpochOperationCorrelation & { readonly kind: string },
): void {
	if (input.kind === EPOCH_START_KIND) {
		if (startsActiveEpoch(manifest, input.childId, input.epoch)) {
			throw epochError("invalid_transition", "the active child epoch cannot be started twice");
		}
		return;
	}
	assertCurrentGeneration(manifest, {
		childId: input.childId,
		epoch: input.epoch,
		operationId: input.operationId,
	});
}

/**
 * Refuse a manifest that records one operation twice, which would make its history ambiguous.
 * @param manifest - The durable manifest.
 */
function assertDistinctOperations(manifest: EpochManifest): void {
	const operationIds = new Set<string>();
	for (const record of manifest.records) {
		if (operationIds.has(record.correlation.operationId)) {
			throw epochError("invalid_transition", "duplicate operation identity in epoch manifest");
		}
		operationIds.add(record.correlation.operationId);
	}
}

/**
 * Whether a record is the committed epoch start that the active-epoch pointer names.
 * @param record - The record the pointer resolves to, if any.
 * @param active - The active-epoch pointer.
 * @returns True when the record backs the pointer.
 */
function backsActiveEpoch(
	record: EpochOperationRecord | undefined,
	active: NonNullable<EpochManifest["activeEpoch"]>,
): boolean {
	return (
		record?.operation.kind === EPOCH_START_KIND &&
		record.status === "committed" &&
		record.outcome === "delivered" &&
		record.correlation.childId === active.childId &&
		record.correlation.epoch === active.epoch
	);
}

/**
 * Refuse a manifest whose own records do not support what it claims: distinct operations, and
 * an active epoch backed by a committed epoch start.
 * @param manifest - The durable manifest.
 */
function assertManifestRelations(manifest: EpochManifest): void {
	assertDistinctOperations(manifest);
	const active = manifest.activeEpoch;
	if (active === null) {
		return;
	}
	const activeRecord = manifest.records.find(
		(record) => record.correlation.operationId === active.operationId,
	);
	if (!backsActiveEpoch(activeRecord, active)) {
		throw epochError("invalid_transition", "active epoch does not match a committed epoch record");
	}
}

/**
 * Replace one record in a manifest's record list, leaving the others as they were.
 * @param records - The current records.
 * @param replacement - The record to put in place of the one with its operation id.
 * @returns The new record list.
 */
function replaceRecord(
	records: readonly EpochOperationRecord[],
	replacement: EpochOperationRecord,
): readonly EpochOperationRecord[] {
	return records.map((record) =>
		record.correlation.operationId === replacement.correlation.operationId ? replacement : record,
	);
}

/**
 * Freeze a record and each of its sections before it is published.
 * @param record - The record.
 * @returns The frozen record.
 */
function freezeRecord(record: EpochOperationRecord): EpochOperationRecord {
	return Object.freeze({
		...record,
		correlation: Object.freeze({ ...record.correlation }),
		operation: Object.freeze({ ...record.operation }),
		provenance: Object.freeze({ ...record.provenance }),
	});
}

/**
 * The compare-and-swap token for a manifest and the bytes it was read from.
 * @param manifest - The manifest.
 * @param bytesHash - The digest of the file it came from.
 * @returns The token.
 */
function casFor(manifest: EpochManifest, bytesHash: string): EpochCasToken {
	return Object.freeze({ revision: manifest.revision, bytesHash });
}

/**
 * The compare-and-swap token for the state currently on disk.
 * @param state - The disk state.
 * @returns The token.
 */
function casForState(state: DiskState): EpochCasToken {
	return Object.freeze({ revision: state.manifest.revision, bytesHash: state.bytesHash });
}

/**
 * Whether two tokens describe the same durable state.
 * @param left - One token.
 * @param right - The other.
 * @returns True when the revision and bytes both match.
 */
function sameCas(left: EpochCasToken, right: EpochCasToken): boolean {
	return left.revision === right.revision && left.bytesHash === right.bytesHash;
}

/**
 * Whether a value has exactly the two fields a CAS token carries.
 * @param value - The caller-supplied token.
 * @returns True when the shape is right.
 */
function hasCasShape(value: unknown): value is EpochCasToken {
	if (value === null || typeof value !== "object") {
		return false;
	}
	const keys = Object.keys(value);
	return keys.length === CAS_KEYS.length && CAS_KEYS.every((key) => Object.hasOwn(value, key));
}

/**
 * Validate a caller-supplied CAS token, which crosses the store's public boundary and so is
 * checked structurally rather than trusted from its declared type.
 * @param value - The caller-supplied token.
 * @returns The frozen token.
 */
function prepareCas(value: unknown): EpochCasToken {
	if (!hasCasShape(value) || !isSafeInteger(value.revision) || value.revision < 0) {
		throw epochError("invalid_input", "CAS token is malformed");
	}
	if (value.bytesHash !== null && !HASH_PATTERN.test(value.bytesHash)) {
		throw epochError("invalid_input", "CAS token is malformed");
	}
	return Object.freeze({ revision: value.revision, bytesHash: value.bytesHash });
}

export {
	EPOCH_START_KIND,
	assertCurrentGeneration,
	assertManifestRelations,
	assertStageGeneration,
	casFor,
	casForState,
	findRecord,
	findStagedRecord,
	freezeRecord,
	prepareCas,
	replaceRecord,
	sameCas,
	sameRecordInput,
};
