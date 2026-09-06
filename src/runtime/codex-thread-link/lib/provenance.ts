import { isAbsolute, resolve } from "node:path";
import { createHash } from "node:crypto";
import type {
	EpochExecutionProof,
	EpochManifest,
	EpochOperationRecord,
} from "@/runtime/codex-epoch";

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function isNullableString(value: unknown): value is string | null {
	return value === null || isNonEmptyString(value);
}

function isTimestamp(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	const actual = Object.keys(value).toSorted();
	const expected = [...keys].toSorted();
	return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isCanonicalIdentity(value: unknown, kind: "child" | "epoch" | "thread" | "turn"): boolean {
	if (!isNonEmptyString(value)) {
		return false;
	}
	if (kind === "child") {
		return /^archboard:child:[A-Za-z0-9][A-Za-z0-9._~-]{0,8192}$/u.test(value);
	}
	if (kind === "thread") {
		return /^archboard:thread:[A-Za-z0-9][A-Za-z0-9._~-]{0,8192}$/u.test(value);
	}
	if (kind === "turn") {
		return /^archboard:turn:[A-Za-z0-9][A-Za-z0-9._~-]{0,8192}$/u.test(value);
	}
	return /^archboard:epoch:[A-Za-z0-9][A-Za-z0-9._~-]{0,8192}\.[A-Za-z0-9][A-Za-z0-9._~-]{0,8192}$/u.test(
		value,
	);
}

function epochBelongsToChild(epoch: unknown, child: unknown): boolean {
	if (!isNonEmptyString(epoch) || !isNonEmptyString(child)) {
		return false;
	}
	const childToken = /^archboard:child:([A-Za-z0-9][A-Za-z0-9._~-]{0,8192})$/u.exec(child)?.[1];
	const epochTokens =
		/^archboard:epoch:([A-Za-z0-9][A-Za-z0-9._~-]{0,8192})\.([A-Za-z0-9][A-Za-z0-9._~-]{0,8192})$/u.exec(
			epoch,
		)?.[1];
	return childToken !== undefined && epochTokens === childToken;
}

function isBoundedToken(value: unknown): value is string {
	return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._~:/-]{0,255}$/u.test(value);
}

function isHash(value: unknown): value is string {
	return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function isCanonicalAbsolutePath(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length <= 4096 &&
		isAbsolute(value) &&
		resolve(value) === value
	);
}

function isReason(value: unknown): value is string | null {
	return (
		value === null ||
		(typeof value === "string" &&
			value.length > 0 &&
			value.length <= 1024 &&
			!value.includes("\0") &&
			!value.includes("\r") &&
			!value.includes("\n"))
	);
}

function statusOutcomePairIsValid(record: Record<string, unknown>): boolean {
	return (
		(record["status"] === "staged" && record["outcome"] === "pending") ||
		(record["status"] === "committed" && record["outcome"] === "delivered") ||
		(record["status"] === "rolled_back" && record["outcome"] === "not_delivered") ||
		(record["status"] === "inspect_only" && record["outcome"] === "outcome_unknown")
	);
}

/** Validate the complete durable record shape, including its executable invariants. */
function isEpochOperationRecord(value: unknown): value is EpochOperationRecord {
	if (!isRecord(value)) {
		return false;
	}
	if (
		!hasExactKeys(value, [
			"correlation",
			"operation",
			"status",
			"outcome",
			"provenance",
			"reason",
			"createdAtMs",
			"updatedAtMs",
		])
	) {
		return false;
	}
	const correlation = value["correlation"];
	const operation = value["operation"];
	const provenance = value["provenance"];
	if (!isRecord(correlation) || !isRecord(operation) || !isRecord(provenance)) {
		return false;
	}
	if (
		!hasExactKeys(correlation, ["childId", "epoch", "operationId"]) ||
		!hasExactKeys(operation, ["id", "kind", "rpc"]) ||
		!hasExactKeys(provenance, [
			"childId",
			"epoch",
			"threadId",
			"turnId",
			"threadSource",
			"workspaceRoot",
			"instructionHash",
			"manifestHash",
			"confirmedAtMs",
		])
	) {
		return false;
	}
	if (
		!isCanonicalIdentity(correlation["childId"], "child") ||
		!isCanonicalIdentity(correlation["epoch"], "epoch") ||
		!epochBelongsToChild(correlation["epoch"], correlation["childId"]) ||
		!isBoundedToken(correlation["operationId"]) ||
		!isBoundedToken(operation["id"]) ||
		operation["id"] !== correlation["operationId"] ||
		!isBoundedToken(operation["kind"]) ||
		!isNullableString(operation["rpc"]) ||
		(operation["rpc"] !== null && !isBoundedToken(operation["rpc"])) ||
		!statusOutcomePairIsValid(value) ||
		!isCanonicalIdentity(provenance["childId"], "child") ||
		!isCanonicalIdentity(provenance["epoch"], "epoch") ||
		!epochBelongsToChild(provenance["epoch"], provenance["childId"]) ||
		provenance["childId"] !== correlation["childId"] ||
		provenance["epoch"] !== correlation["epoch"] ||
		(provenance["threadId"] !== null && !isCanonicalIdentity(provenance["threadId"], "thread")) ||
		(provenance["turnId"] !== null && !isCanonicalIdentity(provenance["turnId"], "turn")) ||
		!isNullableString(provenance["threadId"]) ||
		!isNullableString(provenance["turnId"]) ||
		!isNullableString(provenance["threadSource"]) ||
		(provenance["threadSource"] !== null && !isBoundedToken(provenance["threadSource"])) ||
		!isCanonicalAbsolutePath(provenance["workspaceRoot"]) ||
		!isHash(provenance["instructionHash"]) ||
		!isHash(provenance["manifestHash"]) ||
		(provenance["confirmedAtMs"] !== null && !isTimestamp(provenance["confirmedAtMs"])) ||
		!isReason(value["reason"]) ||
		!isTimestamp(value["createdAtMs"]) ||
		!isTimestamp(value["updatedAtMs"]) ||
		value["updatedAtMs"] < value["createdAtMs"] ||
		(value["status"] === "staged" &&
			(value["reason"] !== null ||
				provenance["threadId"] !== null ||
				provenance["turnId"] !== null ||
				provenance["threadSource"] !== null ||
				provenance["confirmedAtMs"] !== null)) ||
		(value["status"] !== "staged" && value["reason"] === null) ||
		(value["status"] === "committed" && provenance["confirmedAtMs"] === null)
	) {
		return false;
	}
	return true;
}

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

/** Structural equality for immutable JSON-like epoch records and proofs. */
function deepEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) {
		return true;
	}
	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
			return false;
		}
		return left.every((value, index) => deepEqual(value, right[index]));
	}
	if (!isRecord(left) || !isRecord(right)) {
		return false;
	}
	const leftKeys = Object.keys(left).toSorted();
	const rightKeys = Object.keys(right).toSorted();
	if (!deepEqual(leftKeys, rightKeys)) {
		return false;
	}
	return leftKeys.every((key) => deepEqual(left[key], right[key]));
}

/** Prove that the epoch proof is the current, singular manifest record. */
function proofMatchesManifest(proof: EpochExecutionProof, manifest: EpochManifest): boolean {
	if (
		!isEpochExecutionProof(proof) ||
		!isRecord(manifest) ||
		!hasExactKeys(manifest, ["schema", "revision", "activeEpoch", "records", "integrity"]) ||
		manifest.schema !== 1 ||
		!isTimestamp(manifest.revision) ||
		proof.manifestRevision !== manifest.revision ||
		!Array.isArray(manifest.records) ||
		!manifest.records.every(isEpochOperationRecord) ||
		!manifestIntegrityIsValid(manifest) ||
		!manifestRecordsAreConsistent(manifest)
	) {
		return false;
	}
	const matches = manifest.records.filter(
		(record) => record.correlation.operationId === proof.record.correlation.operationId,
	);
	return matches.length === 1 && deepEqual(matches[0], proof.record);
}

function manifestIntegrityIsValid(manifest: EpochManifest): boolean {
	if (!isRecord(manifest.integrity) || !hasExactKeys(manifest.integrity, ["algorithm", "digest"])) {
		return false;
	}
	if (manifest.integrity.algorithm !== "sha256" || !isHash(manifest.integrity.digest)) {
		return false;
	}
	const payload = {
		schema: manifest.schema,
		revision: manifest.revision,
		activeEpoch: manifest.activeEpoch,
		records: manifest.records,
	};
	const digest = createHash("sha256")
		.update(`${JSON.stringify(payload)}\n`, "utf8")
		.digest("hex");
	return digest === manifest.integrity.digest;
}

function manifestRecordsAreConsistent(manifest: EpochManifest): boolean {
	const operationIds = new Set<string>();
	for (const record of manifest.records) {
		if (operationIds.has(record.correlation.operationId)) {
			return false;
		}
		operationIds.add(record.correlation.operationId);
	}
	if (manifest.activeEpoch === null) {
		return true;
	}
	if (
		!isRecord(manifest.activeEpoch) ||
		!hasExactKeys(manifest.activeEpoch, ["childId", "epoch", "operationId"]) ||
		!isCanonicalIdentity(manifest.activeEpoch.childId, "child") ||
		!isCanonicalIdentity(manifest.activeEpoch.epoch, "epoch") ||
		!epochBelongsToChild(manifest.activeEpoch.epoch, manifest.activeEpoch.childId) ||
		!isBoundedToken(manifest.activeEpoch.operationId)
	) {
		return false;
	}
	const activeRecord = manifest.records.find(
		(record) => record.correlation.operationId === manifest.activeEpoch?.operationId,
	);
	return (
		activeRecord?.operation.kind === "epoch_start" &&
		activeRecord.status === "committed" &&
		activeRecord.outcome === "delivered" &&
		activeRecord.correlation.childId === manifest.activeEpoch.childId &&
		activeRecord.correlation.epoch === manifest.activeEpoch.epoch
	);
}

/** Clone a session/epoch observation and freeze every retained nested value. */
function cloneAndFreeze<T>(value: T): T {
	return deepFreeze(structuredClone(value));
}

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

export {
	isEpochOperationRecord,
	isEpochExecutionProof,
	deepEqual,
	proofMatchesManifest,
	cloneAndFreeze,
};
