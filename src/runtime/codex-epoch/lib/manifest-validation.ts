import {
	CODEX_EPOCH_MANIFEST_SCHEMA,
	EPOCH_OPERATION_OUTCOMES,
	EPOCH_OPERATION_STATUSES,
	STATUS_OUTCOME,
	THREAD_PROVENANCE_KINDS,
	type ActiveEpoch,
	type EpochManifest,
	type EpochOperationCorrelation,
	type EpochOperationDescriptor,
	type EpochOperationRecord,
	type EpochOperationStatus,
	type EpochProvenance,
} from "@/runtime/codex-epoch/lib/manifest-contract";
import {
	asAbsolutePath,
	asChildId,
	asEnum,
	asEpoch,
	asHash,
	asObject,
	asReason,
	asThreadId,
	asTimestamp,
	asToken,
	asTurnId,
	assertKeys,
} from "@/runtime/codex-epoch/lib/manifest-scalars";

const RECORD_KEYS: readonly string[] = [
	"correlation",
	"operation",
	"status",
	"outcome",
	"provenance",
	"reason",
	"createdAtMs",
	"updatedAtMs",
];
const PROVENANCE_KEYS: readonly string[] = [
	"childId",
	"epoch",
	"threadId",
	"turnId",
	"threadSource",
	"workspaceRoot",
	"instructionHash",
	"manifestHash",
	"confirmedAtMs",
];

/**
 * Validate the active-epoch pointer.
 * @param value - The decoded value.
 * @returns The active epoch.
 */
function validateActiveEpoch(value: unknown): ActiveEpoch {
	const object = asObject(value, "activeEpoch");
	assertKeys(object, ["childId", "epoch", "operationId"], "activeEpoch");
	return {
		childId: asChildId(object["childId"], "activeEpoch.childId"),
		epoch: asEpoch(object["epoch"], object["childId"], "activeEpoch.epoch"),
		operationId: asToken(object["operationId"], "activeEpoch.operationId"),
	};
}

/**
 * Validate a record's correlation.
 * @param value - The decoded value.
 * @param label - Which record, for failure messages.
 * @returns The correlation.
 */
function validateCorrelation(value: unknown, label: string): EpochOperationCorrelation {
	const object = asObject(value, label);
	assertKeys(object, ["childId", "epoch", "operationId"], label);
	return {
		childId: asChildId(object["childId"], `${label}.childId`),
		epoch: asEpoch(object["epoch"], object["childId"], `${label}.epoch`),
		operationId: asToken(object["operationId"], `${label}.operationId`),
	};
}

/**
 * Validate a record's operation descriptor.
 * @param value - The decoded value.
 * @param label - Which record, for failure messages.
 * @returns The descriptor.
 */
function validateOperation(value: unknown, label: string): EpochOperationDescriptor {
	const object = asObject(value, label);
	assertKeys(object, ["id", "kind", "rpc"], label);
	return {
		id: asToken(object["id"], `${label}.id`),
		kind: asToken(object["kind"], `${label}.kind`),
		rpc: object["rpc"] === null ? null : asToken(object["rpc"], `${label}.rpc`),
	};
}

/**
 * Validate the observed identities a record's provenance carries.
 * @param object - The provenance section.
 * @param label - Which provenance, for failure messages.
 * @returns The thread, turn and source, each of which may be absent.
 */
function validateObserved(
	object: Record<string, unknown>,
	label: string,
): Pick<EpochProvenance, "threadId" | "turnId" | "threadSource"> {
	return {
		threadId:
			object["threadId"] === null ? null : asThreadId(object["threadId"], `${label}.threadId`),
		turnId: object["turnId"] === null ? null : asTurnId(object["turnId"], `${label}.turnId`),
		threadSource:
			object["threadSource"] === null
				? null
				: asToken(object["threadSource"], `${label}.threadSource`),
	};
}

/**
 * Validate a record's provenance: which child epoch acted, what it observed, and where.
 * @param value - The decoded value.
 * @param label - Which record, for failure messages.
 * @returns The provenance.
 */
function validateProvenance(value: unknown, label: string): EpochProvenance {
	const object = asObject(value, label);
	assertKeys(object, PROVENANCE_KEYS, label);
	return {
		childId: asChildId(object["childId"], `${label}.childId`),
		epoch: asEpoch(object["epoch"], object["childId"], `${label}.epoch`),
		...validateObserved(object, label),
		workspaceRoot: asAbsolutePath(object["workspaceRoot"], `${label}.workspaceRoot`),
		instructionHash: asHash(object["instructionHash"], `${label}.instructionHash`),
		manifestHash: asHash(object["manifestHash"], `${label}.manifestHash`),
		confirmedAtMs:
			object["confirmedAtMs"] === null
				? null
				: asTimestamp(object["confirmedAtMs"], `${label}.confirmedAtMs`),
	};
}

/**
 * Validate the manifest's integrity section.
 * @param value - The decoded value.
 * @returns The integrity section.
 */
function validateIntegrity(value: unknown): EpochManifest["integrity"] {
	const object = asObject(value, "integrity");
	assertKeys(object, ["algorithm", "digest"], "integrity");
	if (object["algorithm"] !== "sha256") {
		throw new Error("unsupported integrity algorithm");
	}
	return { algorithm: "sha256", digest: asHash(object["digest"], "integrity.digest") };
}

/**
 * Refuse a staged record that claims anything it cannot yet have observed: no reason, and no
 * delivered provenance.
 * @param provenance - The record's provenance.
 * @param reason - The record's reason.
 * @param label - Which record, for failure messages.
 */
function assertStagedIsUnobserved(
	provenance: EpochProvenance,
	reason: string | null,
	label: string,
): void {
	if (reason !== null) {
		throw new Error(`${label}.staged record cannot have a reason`);
	}
	if (
		provenance.threadId !== null ||
		provenance.turnId !== null ||
		provenance.threadSource !== null ||
		provenance.confirmedAtMs !== null
	) {
		throw new Error(`${label}.staged record cannot have confirmed provenance`);
	}
}

/** What a settled record must be judged on: how it settled, what it did, and what it saw. */
interface SettledRecord {
	readonly status: EpochOperationStatus;
	readonly operation: EpochOperationDescriptor;
	readonly provenance: EpochProvenance;
	readonly reason: string | null;
}

/**
 * Refuse a settled record that does not carry what its settlement implies: a reason always, a
 * confirmation time once committed, and thread provenance for a committed thread effect.
 * @param record - How the record settled, what it did, and what it observed.
 * @param label - Which record, for failure messages.
 */
function assertSettledIsComplete(record: SettledRecord, label: string): void {
	if (record.reason === null) {
		throw new Error(`${label} terminal record needs a reason`);
	}
	if (record.status !== "committed") {
		return;
	}
	if (record.provenance.confirmedAtMs === null) {
		throw new Error(`${label}.committed record needs a confirmation timestamp`);
	}
	if (THREAD_PROVENANCE_KINDS.has(record.operation.kind) && record.provenance.threadId === null) {
		throw new Error(`${label}.committed thread effect needs thread provenance`);
	}
}

/**
 * Refuse a record whose sections disagree about which operation, child and epoch it belongs to.
 * @param correlation - The record's correlation.
 * @param operation - The record's operation.
 * @param provenance - The record's provenance.
 * @param label - Which record, for failure messages.
 */
function assertSectionsAgree(
	correlation: EpochOperationCorrelation,
	operation: EpochOperationDescriptor,
	provenance: EpochProvenance,
	label: string,
): void {
	if (operation.id !== correlation.operationId) {
		throw new Error(`${label} operation id does not match correlation`);
	}
	if (provenance.childId !== correlation.childId || provenance.epoch !== correlation.epoch) {
		throw new Error(`${label} provenance does not match correlation`);
	}
}

/**
 * Validate a record's settlement: the status and outcome must be the one pair the contract
 * allows together, and its timestamps must be ordered.
 * @param object - The record section.
 * @param label - Which record, for failure messages.
 * @returns The settled status, outcome and timestamps.
 */
function validateSettlement(
	object: Record<string, unknown>,
	label: string,
): Pick<EpochOperationRecord, "status" | "outcome" | "createdAtMs" | "updatedAtMs"> {
	const status = asEnum(object["status"], EPOCH_OPERATION_STATUSES, `${label}.status`);
	const outcome = asEnum(object["outcome"], EPOCH_OPERATION_OUTCOMES, `${label}.outcome`);
	if (STATUS_OUTCOME[status] !== outcome) {
		throw new Error(`${label} has an invalid status/outcome pair`);
	}
	const createdAtMs = asTimestamp(object["createdAtMs"], `${label}.createdAtMs`);
	const updatedAtMs = asTimestamp(object["updatedAtMs"], `${label}.updatedAtMs`);
	if (updatedAtMs < createdAtMs) {
		throw new Error(`${label}.updatedAtMs precedes createdAtMs`);
	}
	return { status, outcome, createdAtMs, updatedAtMs };
}

/**
 * Validate one durable operation record, including the invariants that make it evidence: a
 * staged record has observed nothing, a settled one is complete, and its sections agree.
 * @param value - The decoded value.
 * @param label - Which record, for failure messages.
 * @returns The record.
 */
function validateRecord(value: unknown, label: string): EpochOperationRecord {
	const object = asObject(value, label);
	assertKeys(object, RECORD_KEYS, label);
	const correlation = validateCorrelation(object["correlation"], `${label}.correlation`);
	const operation = validateOperation(object["operation"], `${label}.operation`);
	const settlement = validateSettlement(object, label);
	const provenance = validateProvenance(object["provenance"], `${label}.provenance`);
	const reason = object["reason"] === null ? null : asReason(object["reason"], `${label}.reason`);
	if (settlement.status === "staged") {
		assertStagedIsUnobserved(provenance, reason, label);
	} else {
		assertSettledIsComplete({ status: settlement.status, operation, provenance, reason }, label);
	}
	assertSectionsAgree(correlation, operation, provenance, label);
	// The field order is the manifest's canonical encoding order: a decoded record is
	// re-encoded byte for byte, so rebuilding it in any other order would make every
	// manifest read back as non-canonical.
	return {
		correlation,
		operation,
		status: settlement.status,
		outcome: settlement.outcome,
		provenance,
		reason,
		createdAtMs: settlement.createdAtMs,
		updatedAtMs: settlement.updatedAtMs,
	};
}

/**
 * Whether a value is the schema version this store reads.
 * @param value - The decoded schema field.
 * @returns True for the supported schema.
 */
function isSupportedSchema(value: unknown): value is typeof CODEX_EPOCH_MANIFEST_SCHEMA {
	return value === CODEX_EPOCH_MANIFEST_SCHEMA;
}

export { isSupportedSchema, validateActiveEpoch, validateIntegrity, validateRecord };
