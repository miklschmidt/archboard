import { createHash } from "node:crypto";

import type { ThreadId } from "@/shared/codex-workbench-identity";
import { assertNoDuplicateKeys } from "@/runtime/codex-epoch/lib/manifest-json";
import {
	CODEX_EPOCH_MANIFEST_SCHEMA,
	THREAD_OWNERSHIP_CONTRACTS,
	type EpochManifest,
	type EpochManifestPayload,
	type EpochOperationRecord,
	type EpochThreadOwnershipProvenance,
} from "@/runtime/codex-epoch/lib/manifest-contract";
import {
	asArray,
	asObject,
	assertKeys,
	isInteger,
} from "@/runtime/codex-epoch/lib/manifest-scalars";
import {
	isSupportedSchema,
	validateActiveEpoch,
	validateIntegrity,
	validateRecord,
} from "@/runtime/codex-epoch/lib/manifest-validation";

/**
 * Whether a record is a settled operation that names this thread, which is the only kind of
 * record that can establish ownership of it.
 * @param record - The record, or undefined for a hole in the array.
 * @param threadId - The thread being resolved.
 * @returns True when the record is worth matching against the ownership table.
 */
function namesSettledThread(
	record: EpochOperationRecord | undefined,
	threadId: ThreadId,
): record is EpochOperationRecord {
	if (record === undefined || record.provenance.threadId !== threadId) {
		return false;
	}
	return record.status === "committed" || record.status === "inspect_only";
}

/**
 * Resolve only a canonical operation that establishes ownership of this thread, taking the
 * most recent one so a later attachment supersedes an earlier record.
 * @param manifest - The durable manifest.
 * @param threadId - The thread to resolve.
 * @returns How the thread is owned and by which record, or null when nothing owns it.
 */
function resolveThreadOwnershipProvenance(
	manifest: EpochManifest,
	threadId: ThreadId,
): EpochThreadOwnershipProvenance | null {
	for (let index = manifest.records.length - 1; index >= 0; index -= 1) {
		const record = manifest.records[index];
		if (!namesSettledThread(record, threadId)) {
			continue;
		}
		const contract = THREAD_OWNERSHIP_CONTRACTS.find(
			(candidate) =>
				candidate.kind === record.operation.kind && candidate.rpc === record.operation.rpc,
		);
		if (contract !== undefined) {
			return Object.freeze({ ownership: contract.ownership, record });
		}
	}
	return null;
}

/**
 * The manifest a store starts from before any epoch exists.
 * @returns An empty manifest at revision zero.
 */
function emptyManifest(): EpochManifest {
	return buildManifest({
		schema: CODEX_EPOCH_MANIFEST_SCHEMA,
		revision: 0,
		activeEpoch: null,
		records: [],
	});
}

/**
 * Seal a payload into a manifest by computing its integrity digest.
 * @param payload - The manifest contents.
 * @returns The frozen manifest.
 */
function buildManifest(payload: EpochManifestPayload): EpochManifest {
	return withIntegrity(payload);
}

/**
 * Encode a manifest as the exact bytes written to disk, which the decoder re-derives to prove
 * the file is canonical.
 * @param manifest - The manifest.
 * @returns The manifest text, newline terminated.
 */
function encodeManifest(manifest: EpochManifest): string {
	const payload = payloadOf(manifest);
	const integrity = integrityOf(payload);
	return `${JSON.stringify({ ...payload, integrity })}\n`;
}

/**
 * Decode manifest text: no duplicate keys, every field valid, the digest matching, and the
 * whole file byte-identical to what encoding the result would produce.
 * @param raw - The manifest text.
 * @returns The manifest.
 */
function decodeManifest(raw: string): EpochManifest {
	try {
		assertNoDuplicateKeys(raw);
		const parsed: unknown = JSON.parse(raw);
		const manifest = validateManifest(parsed);
		if (encodeManifest(manifest) !== raw) {
			throw new Error("manifest is not canonical");
		}
		return manifest;
	} catch (error) {
		const message = error instanceof Error ? error.message : "unknown parse error";
		throw new Error(`invalid codex epoch manifest: ${message}`, { cause: error });
	}
}

/**
 * The digest of the manifest file's own bytes, which is what a compare-and-swap compares.
 * @param raw - The manifest text.
 * @returns The digest.
 */
function manifestBytesHash(raw: string): string {
	return sha256(raw);
}

/**
 * The digest of a manifest's contents, ignoring the integrity section it carries.
 * @param manifest - The manifest.
 * @returns The digest.
 */
function manifestPayloadHash(manifest: EpochManifest): string {
	return sha256(`${JSON.stringify(payloadOf(manifest))}\n`);
}

/**
 * The contents of a manifest without its integrity section.
 * @param manifest - The manifest.
 * @returns The payload.
 */
function payloadOf(manifest: EpochManifest): EpochManifestPayload {
	return {
		schema: manifest.schema,
		revision: manifest.revision,
		activeEpoch: manifest.activeEpoch,
		records: manifest.records,
	};
}

/**
 * Freeze a payload and seal it with its digest.
 * @param payload - The manifest contents.
 * @returns The frozen manifest.
 */
function withIntegrity(payload: EpochManifestPayload): EpochManifest {
	const normalized: EpochManifestPayload = {
		...payload,
		activeEpoch: payload.activeEpoch === null ? null : Object.freeze({ ...payload.activeEpoch }),
		records: Object.freeze(payload.records.map((record) => freezeRecord(record))),
	};
	return Object.freeze({
		...normalized,
		integrity: Object.freeze(integrityOf(normalized)),
	});
}

/**
 * The integrity section for a payload.
 * @param payload - The manifest contents.
 * @returns The algorithm and digest.
 */
function integrityOf(payload: EpochManifestPayload): EpochManifest["integrity"] {
	return {
		algorithm: "sha256",
		digest: sha256(`${JSON.stringify(payload)}\n`),
	};
}

/**
 * The SHA-256 digest of a UTF-8 string.
 * @param value - The text.
 * @returns The lowercase hex digest.
 */
function sha256(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Freeze a record and each of its sections, so a manifest handed to a caller cannot be edited
 * into something the digest no longer describes.
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
 * Validate a decoded manifest field by field and prove its digest covers what it contains.
 * @param value - The decoded value.
 * @returns The manifest.
 */
function validateManifest(value: unknown): EpochManifest {
	const object = asObject(value, "manifest");
	assertKeys(object, ["schema", "revision", "activeEpoch", "records", "integrity"], "manifest");
	if (!isSupportedSchema(object["schema"])) {
		throw new Error("unsupported schema");
	}
	const revision = object["revision"];
	if (!isInteger(revision) || revision < 0) {
		throw new Error("invalid revision");
	}
	const payload: EpochManifestPayload = {
		schema: CODEX_EPOCH_MANIFEST_SCHEMA,
		revision,
		activeEpoch: object["activeEpoch"] === null ? null : validateActiveEpoch(object["activeEpoch"]),
		records: asArray(object["records"], "records").map((record, index) =>
			validateRecord(record, `records[${index}]`),
		),
	};
	if (validateIntegrity(object["integrity"]).digest !== integrityOf(payload).digest) {
		throw new Error("integrity digest mismatch");
	}
	return withIntegrity(payload);
}

export {
	CODEX_EPOCH_MANIFEST_SCHEMA,
	EPOCH_THREAD_ATTACH_OPERATION,
	operationRequiresThreadProvenance,
	type ActiveEpoch,
	type EpochManifest,
	type EpochManifestPayload,
	type EpochOperationCorrelation,
	type EpochOperationDescriptor,
	type EpochOperationOutcome,
	type EpochOperationRecord,
	type EpochOperationStatus,
	type EpochProvenance,
	type EpochThreadOwnership,
	type EpochThreadOwnershipProvenance,
} from "@/runtime/codex-epoch/lib/manifest-contract";

export {
	resolveThreadOwnershipProvenance,
	emptyManifest,
	buildManifest,
	encodeManifest,
	decodeManifest,
	manifestBytesHash,
	manifestPayloadHash,
};
