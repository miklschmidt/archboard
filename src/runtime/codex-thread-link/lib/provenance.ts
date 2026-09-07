import { createHash } from "node:crypto";
import type {
	EpochExecutionProof,
	EpochManifest,
	EpochOperationRecord,
} from "@/runtime/codex-epoch";
import {
	epochBelongsToChild,
	hasExactKeys,
	isBoundedToken,
	isCanonicalAbsolutePath,
	isCanonicalIdentity,
	isHash,
	isNullableString,
	isReason,
	isRecord,
	isTimestamp,
} from "@/runtime/codex-thread-link/lib/record-shape";

const RECORD_KEYS: readonly string[] = Object.freeze([
	"correlation",
	"operation",
	"status",
	"outcome",
	"provenance",
	"reason",
	"createdAtMs",
	"updatedAtMs",
]);
const CORRELATION_KEYS: readonly string[] = Object.freeze(["childId", "epoch", "operationId"]);
const OPERATION_KEYS: readonly string[] = Object.freeze(["id", "kind", "rpc"]);
const PROVENANCE_KEYS: readonly string[] = Object.freeze([
	"childId",
	"epoch",
	"threadId",
	"turnId",
	"threadSource",
	"workspaceRoot",
	"instructionHash",
	"manifestHash",
	"confirmedAtMs",
]);
const MANIFEST_KEYS: readonly string[] = Object.freeze([
	"schema",
	"revision",
	"activeEpoch",
	"records",
	"integrity",
]);
const ACTIVE_EPOCH_KEYS: readonly string[] = Object.freeze(["childId", "epoch", "operationId"]);
const INTEGRITY_KEYS: readonly string[] = Object.freeze(["algorithm", "digest"]);
/** The provenance a staged record has not observed yet, because nothing has been delivered. */
const STAGED_NULL_PROVENANCE: readonly string[] = Object.freeze([
	"threadId",
	"turnId",
	"threadSource",
	"confirmedAtMs",
] as const);
const STATUS_OUTCOME_PAIRS: ReadonlyMap<unknown, unknown> = new Map<unknown, unknown>([
	["staged", "pending"],
	["committed", "delivered"],
	["rolled_back", "not_delivered"],
	["inspect_only", "outcome_unknown"],
]);

/** The three nested objects every durable record is made of. */
interface RecordSections {
	readonly correlation: Record<string, unknown>;
	readonly operation: Record<string, unknown>;
	readonly provenance: Record<string, unknown>;
}

/**
 * Whether a record's status and outcome are the one pair the epoch contract allows together.
 * @param record The record.
 * @returns True for a matching pair.
 */
function statusOutcomePairIsValid(record: Record<string, unknown>): boolean {
	const expected = STATUS_OUTCOME_PAIRS.get(record["status"]);
	return expected !== undefined && record["outcome"] === expected;
}

/**
 * Whether a correlation names one operation under an epoch minted for its own child.
 * @param correlation The correlation object.
 * @returns True when every identity is canonical and self-consistent.
 */
function correlationIsValid(correlation: Record<string, unknown>): boolean {
	return (
		hasExactKeys(correlation, CORRELATION_KEYS) &&
		isCanonicalIdentity(correlation["childId"], "child") &&
		isCanonicalIdentity(correlation["epoch"], "epoch") &&
		epochBelongsToChild(correlation["epoch"], correlation["childId"]) &&
		isBoundedToken(correlation["operationId"])
	);
}

/**
 * Whether an operation names the same id as its correlation, with a bounded kind and RPC.
 * @param operation The operation object.
 * @param correlation The correlation object it belongs to.
 * @returns True when the operation is well-formed and agrees with its correlation.
 */
function operationIsValid(
	operation: Record<string, unknown>,
	correlation: Record<string, unknown>,
): boolean {
	return (
		hasExactKeys(operation, OPERATION_KEYS) &&
		isBoundedToken(operation["id"]) &&
		operation["id"] === correlation["operationId"] &&
		isBoundedToken(operation["kind"]) &&
		isTokenOrNull(operation["rpc"])
	);
}

/**
 * Whether a value is a bounded token or null, which is the shape of an optional RPC name or
 * thread source.
 * @param value The value.
 * @returns True for null or a bounded token.
 */
function isTokenOrNull(value: unknown): boolean {
	return value === null || isBoundedToken(value);
}

/**
 * Whether a value is a canonical identity of the given kind, or null.
 * @param value The value.
 * @param kind Which identity it should be when present.
 * @returns True for null or that identity.
 */
function isIdentityOrNull(value: unknown, kind: "thread" | "turn"): boolean {
	return value === null || isCanonicalIdentity(value, kind);
}

/**
 * Whether provenance names the same child epoch as its correlation.
 * @param provenance The provenance object.
 * @param correlation The correlation object it belongs to.
 * @returns True when both name one epoch of one child.
 */
function provenanceEpochIsValid(
	provenance: Record<string, unknown>,
	correlation: Record<string, unknown>,
): boolean {
	return (
		isCanonicalIdentity(provenance["childId"], "child") &&
		isCanonicalIdentity(provenance["epoch"], "epoch") &&
		epochBelongsToChild(provenance["epoch"], provenance["childId"]) &&
		provenance["childId"] === correlation["childId"] &&
		provenance["epoch"] === correlation["epoch"]
	);
}

/**
 * Whether provenance's thread, turn and source are canonical identities or null.
 * @param provenance The provenance object.
 * @returns True when each observed identity is well-formed.
 */
function provenanceThreadIsValid(provenance: Record<string, unknown>): boolean {
	return (
		isIdentityOrNull(provenance["threadId"], "thread") &&
		isIdentityOrNull(provenance["turnId"], "turn") &&
		isNullableString(provenance["threadSource"]) &&
		isTokenOrNull(provenance["threadSource"])
	);
}

/**
 * Whether provenance carries the workspace, hashes and confirmation time a record is judged by.
 * @param provenance The provenance object.
 * @returns True when each is well-formed.
 */
function provenanceContextIsValid(provenance: Record<string, unknown>): boolean {
	return (
		isCanonicalAbsolutePath(provenance["workspaceRoot"]) &&
		isHash(provenance["instructionHash"]) &&
		isHash(provenance["manifestHash"]) &&
		(provenance["confirmedAtMs"] === null || isTimestamp(provenance["confirmedAtMs"]))
	);
}

/**
 * Whether the whole provenance object is well-formed and agrees with its correlation.
 * @param provenance The provenance object.
 * @param correlation The correlation object it belongs to.
 * @returns True when every part checks out.
 */
function provenanceIsValid(
	provenance: Record<string, unknown>,
	correlation: Record<string, unknown>,
): boolean {
	return (
		hasExactKeys(provenance, PROVENANCE_KEYS) &&
		provenanceEpochIsValid(provenance, correlation) &&
		provenanceThreadIsValid(provenance) &&
		provenanceContextIsValid(provenance)
	);
}

/**
 * Whether a record's timestamps are ordered and its reason follows its status.
 * @param value The record.
 * @returns True when both hold.
 */
function timingIsValid(value: Record<string, unknown>): boolean {
	const created = value["createdAtMs"];
	const updated = value["updatedAtMs"];
	return (
		isReason(value["reason"]) && isTimestamp(created) && isTimestamp(updated) && updated >= created
	);
}

/**
 * Whether a staged record has observed nothing: no reason, and no delivered provenance.
 * @param value The record.
 * @param provenance Its provenance object.
 * @returns True when the record is still purely staged.
 */
function stagedIsUnobserved(
	value: Record<string, unknown>,
	provenance: Record<string, unknown>,
): boolean {
	return (
		value["reason"] === null && STAGED_NULL_PROVENANCE.every((key) => provenance[key] === null)
	);
}

/**
 * Whether a record's status agrees with what it claims to have observed: a staged record has
 * observed nothing yet, a settled one carries a reason, and a committed one is confirmed.
 * @param value The record.
 * @param provenance Its provenance object.
 * @returns True when the settlement invariants hold.
 */
function settlementIsValid(
	value: Record<string, unknown>,
	provenance: Record<string, unknown>,
): boolean {
	if (value["status"] === "staged") {
		return stagedIsUnobserved(value, provenance);
	}
	if (value["reason"] === null) {
		return false;
	}
	return value["status"] !== "committed" || provenance["confirmedAtMs"] !== null;
}

/**
 * Validates the complete durable record shape, including the invariants that make it
 * executable evidence rather than merely well-typed data.
 * @param value The candidate record.
 * @returns True when it is a valid epoch operation record.
 */
function isEpochOperationRecord(value: unknown): value is EpochOperationRecord {
	if (!isRecord(value) || !hasExactKeys(value, RECORD_KEYS)) {
		return false;
	}
	const sections = recordSectionsOf(value);
	if (sections === null) {
		return false;
	}
	return recordSectionsAreValid(value, sections) && recordSettlementIsValid(value, sections);
}

/**
 * The three nested objects a record is made of, when all three are present.
 * @param value The record.
 * @returns The sections, or null when any is missing or not an object.
 */
function recordSectionsOf(value: Record<string, unknown>): RecordSections | null {
	const correlation = value["correlation"];
	const operation = value["operation"];
	const provenance = value["provenance"];
	if (!isRecord(correlation) || !isRecord(operation) || !isRecord(provenance)) {
		return null;
	}
	return { correlation, operation, provenance };
}

/**
 * Whether a record's correlation, operation, settlement pair and provenance are each valid
 * and agree with one another.
 * @param value The record.
 * @param sections Its nested objects.
 * @returns True when every section holds.
 */
function recordSectionsAreValid(value: Record<string, unknown>, sections: RecordSections): boolean {
	return (
		correlationIsValid(sections.correlation) &&
		operationIsValid(sections.operation, sections.correlation) &&
		statusOutcomePairIsValid(value) &&
		provenanceIsValid(sections.provenance, sections.correlation)
	);
}

/**
 * Whether a record's timing and settlement invariants hold together.
 * @param value The record.
 * @param sections Its nested objects.
 * @returns True when both hold.
 */
function recordSettlementIsValid(
	value: Record<string, unknown>,
	sections: RecordSections,
): boolean {
	return timingIsValid(value) && settlementIsValid(value, sections.provenance);
}

/**
 * Whether a value is an execution proof: a valid record with the manifest revision it was
 * proved against.
 * @param value The candidate proof.
 * @returns True for a valid proof.
 */
function isEpochExecutionProof(value: unknown): value is EpochExecutionProof {
	if (!isRecord(value) || !hasExactKeys(value, ["record", "manifestRevision"])) {
		return false;
	}
	const revision = value["manifestRevision"];
	return (
		typeof revision === "number" &&
		Number.isSafeInteger(revision) &&
		revision >= 0 &&
		isEpochOperationRecord(value["record"])
	);
}

/**
 * Structural equality for immutable JSON-like epoch records and proofs, which is how a
 * supplied record is compared against the live one.
 * @param left One value.
 * @param right The other.
 * @returns True when both describe the same data.
 */
function deepEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) {
		return true;
	}
	if (Array.isArray(left)) {
		return arraysEqual(left, right);
	}
	if (Array.isArray(right)) {
		return false;
	}
	return recordsEqual(left, right);
}

/**
 * Whether an array equals another value element by element.
 * @param left The array.
 * @param right The other value.
 * @returns True when the other value is an array of equal elements.
 */
function arraysEqual(left: readonly unknown[], right: unknown): boolean {
	return (
		Array.isArray(right) &&
		left.length === right.length &&
		left.every((value, index) => deepEqual(value, right[index]))
	);
}

/**
 * Whether two values are objects with the same keys and equal values.
 * @param left One value.
 * @param right The other.
 * @returns True when both are objects that match.
 */
function recordsEqual(left: unknown, right: unknown): boolean {
	if (!isRecord(left) || !isRecord(right)) {
		return false;
	}
	const leftKeys = Object.keys(left).toSorted();
	const rightKeys = Object.keys(right).toSorted();
	return (
		deepEqual(leftKeys, rightKeys) && leftKeys.every((key) => deepEqual(left[key], right[key]))
	);
}

/**
 * Whether a manifest's digest still covers its own contents, so a hand-edited manifest cannot
 * pass as evidence.
 * @param manifest The manifest.
 * @returns True when the recomputed digest matches.
 */
function manifestIntegrityIsValid(manifest: Record<string, unknown>): boolean {
	const integrity = manifest["integrity"];
	if (!isRecord(integrity) || !hasExactKeys(integrity, INTEGRITY_KEYS)) {
		return false;
	}
	if (integrity["algorithm"] !== "sha256" || !isHash(integrity["digest"])) {
		return false;
	}
	const payload = {
		schema: manifest["schema"],
		revision: manifest["revision"],
		activeEpoch: manifest["activeEpoch"],
		records: manifest["records"],
	};
	const digest = createHash("sha256")
		.update(`${JSON.stringify(payload)}\n`, "utf8")
		.digest("hex");
	return digest === integrity["digest"];
}

/**
 * Whether a manifest's records name distinct operations, so no operation has two histories.
 * @param records The records.
 * @returns True when every operation id appears once.
 */
function operationIdsAreDistinct(records: readonly EpochOperationRecord[]): boolean {
	const operationIds = new Set<string>();
	for (const record of records) {
		if (operationIds.has(record.correlation.operationId)) {
			return false;
		}
		operationIds.add(record.correlation.operationId);
	}
	return true;
}

/**
 * Whether the manifest's active epoch is well-formed.
 * @param activeEpoch The active epoch object.
 * @returns True when it names one canonical child epoch and operation.
 */
function activeEpochIsValid(activeEpoch: Record<string, unknown>): boolean {
	return (
		hasExactKeys(activeEpoch, ACTIVE_EPOCH_KEYS) &&
		isCanonicalIdentity(activeEpoch["childId"], "child") &&
		isCanonicalIdentity(activeEpoch["epoch"], "epoch") &&
		epochBelongsToChild(activeEpoch["epoch"], activeEpoch["childId"]) &&
		isBoundedToken(activeEpoch["operationId"])
	);
}

/**
 * Whether the record the active epoch points at is a committed, delivered epoch start for
 * exactly that child epoch.
 * @param records The manifest's records.
 * @param activeEpoch The manifest's active epoch.
 * @returns True when the active record backs the active epoch.
 */
function activeRecordIsValid(
	records: readonly EpochOperationRecord[],
	activeEpoch: Record<string, unknown>,
): boolean {
	const activeRecord = records.find(
		(record) => record.correlation.operationId === activeEpoch["operationId"],
	);
	return (
		activeRecord?.operation.kind === "epoch_start" &&
		isDeliveredEpochStart(activeRecord) &&
		activeRecord.correlation.childId === activeEpoch["childId"] &&
		activeRecord.correlation.epoch === activeEpoch["epoch"]
	);
}

/**
 * Whether the record that establishes an epoch actually settled as delivered.
 * @param record The record.
 * @returns True for a committed, delivered record.
 */
function isDeliveredEpochStart(record: EpochOperationRecord): boolean {
	return record.status === "committed" && record.outcome === "delivered";
}

/**
 * Whether a manifest's records are singular per operation and its active epoch is backed by
 * one of them.
 * @param records The manifest's records.
 * @param activeEpoch The manifest's active epoch, which may be null.
 * @returns True when the manifest is internally consistent.
 */
function manifestRecordsAreConsistent(
	records: readonly EpochOperationRecord[],
	activeEpoch: unknown,
): boolean {
	if (!operationIdsAreDistinct(records)) {
		return false;
	}
	if (activeEpoch === null) {
		return true;
	}
	if (!isRecord(activeEpoch) || !activeEpochIsValid(activeEpoch)) {
		return false;
	}
	return activeRecordIsValid(records, activeEpoch);
}

/**
 * Whether a manifest is itself well-formed enough to judge a proof against.
 * @param manifest The value the epoch store returned as its manifest.
 * @returns True when its shape, integrity and records all hold.
 */
function manifestIsValid(manifest: unknown): manifest is EpochManifest {
	if (!isRecord(manifest) || !manifestHeaderIsValid(manifest)) {
		return false;
	}
	const records: unknown = manifest["records"];
	if (!Array.isArray(records) || !records.every(isEpochOperationRecord)) {
		return false;
	}
	return (
		manifestIntegrityIsValid(manifest) &&
		manifestRecordsAreConsistent(records, manifest["activeEpoch"])
	);
}

/**
 * Whether a manifest declares the schema and revision this classifier can read.
 * @param manifest The manifest.
 * @returns True for the expected keys, schema version and revision.
 */
function manifestHeaderIsValid(manifest: Record<string, unknown>): boolean {
	return (
		hasExactKeys(manifest, MANIFEST_KEYS) &&
		manifest["schema"] === 1 &&
		isTimestamp(manifest["revision"])
	);
}

/**
 * Proves that an epoch proof is the current, singular manifest record: the manifest is intact,
 * the revisions agree, and exactly one record matches the proof exactly.
 * @param proof The proof.
 * @param manifest The manifest to judge it against.
 * @returns True when the proof may be adopted.
 */
function proofMatchesManifest(proof: EpochExecutionProof, manifest: EpochManifest): boolean {
	if (
		!isEpochExecutionProof(proof) ||
		!manifestIsValid(manifest) ||
		proof.manifestRevision !== manifest.revision
	) {
		return false;
	}
	const matches = manifest.records.filter(
		(record) => record.correlation.operationId === proof.record.correlation.operationId,
	);
	return matches.length === 1 && deepEqual(matches[0], proof.record);
}

/**
 * Freezes every value reachable from a copy.
 * @param value The copy.
 * @returns The same value, deeply frozen.
 */
function deepFreeze<T>(value: T): T {
	if (value === null || typeof value !== "object") {
		return value;
	}
	for (const child of Object.values(value)) {
		deepFreeze(child);
	}
	Object.freeze(value);
	return value;
}

/**
 * Clones a session or epoch observation and freezes every retained nested value, so a
 * classification cannot be mutated after it is published.
 * @param value The observation.
 * @returns A deeply frozen copy.
 */
function cloneAndFreeze<T>(value: T): T {
	return deepFreeze(structuredClone(value));
}

export {
	isEpochOperationRecord,
	isEpochExecutionProof,
	deepEqual,
	proofMatchesManifest,
	cloneAndFreeze,
};
