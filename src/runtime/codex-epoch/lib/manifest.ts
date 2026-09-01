import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";

import type {
	ChildEpoch,
	ChildId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import { assertNoDuplicateKeys } from "./manifest-json.js";

export const CODEX_EPOCH_MANIFEST_SCHEMA = 1 as const;
const THREAD_PROVENANCE_KINDS = new Set([
	"link",
	"thread_link",
	"attached",
	"create",
	"create_thread",
	"thread_create",
	"fork",
	"fork_thread",
	"thread_fork",
	"initial_turn",
	"create_thread_initial_turn",
	"fork_thread_initial_turn",
	"send_message_to_thread",
]);

export function operationRequiresThreadProvenance(kind: string): boolean {
	return THREAD_PROVENANCE_KINDS.has(kind);
}

export type EpochOperationStatus = "staged" | "committed" | "rolled_back" | "inspect_only";

export type EpochOperationOutcome = "pending" | "delivered" | "not_delivered" | "outcome_unknown";

export interface EpochOperationCorrelation {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly operationId: string;
}

export interface EpochOperationDescriptor {
	readonly id: string;
	readonly kind: string;
	readonly rpc: string | null;
}

export interface EpochProvenance {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly threadId: ThreadId | null;
	readonly turnId: TurnId | null;
	readonly threadSource: string | null;
	readonly workspaceRoot: string;
	readonly instructionHash: string;
	readonly manifestHash: string;
	readonly confirmedAtMs: number | null;
}

export interface EpochOperationRecord {
	readonly correlation: EpochOperationCorrelation;
	readonly operation: EpochOperationDescriptor;
	readonly status: EpochOperationStatus;
	readonly outcome: EpochOperationOutcome;
	readonly provenance: EpochProvenance;
	readonly reason: string | null;
	readonly createdAtMs: number;
	readonly updatedAtMs: number;
}

export interface ActiveEpoch {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly operationId: string;
}

export interface EpochManifestPayload {
	readonly schema: typeof CODEX_EPOCH_MANIFEST_SCHEMA;
	readonly revision: number;
	readonly activeEpoch: ActiveEpoch | null;
	readonly records: readonly EpochOperationRecord[];
}

export interface EpochManifest extends EpochManifestPayload {
	readonly integrity: {
		readonly algorithm: "sha256";
		readonly digest: string;
	};
}

export function emptyManifest(): EpochManifest {
	return buildManifest({
		schema: CODEX_EPOCH_MANIFEST_SCHEMA,
		revision: 0,
		activeEpoch: null,
		records: [],
	});
}

export function buildManifest(payload: EpochManifestPayload): EpochManifest {
	if (payload.schema !== CODEX_EPOCH_MANIFEST_SCHEMA) {
		throw new Error("unsupported schema");
	}
	return withIntegrity(payload);
}

export function encodeManifest(manifest: EpochManifest): string {
	const payload = payloadOf(manifest);
	const integrity = integrityOf(payload);
	return `${JSON.stringify({ ...payload, integrity })}\n`;
}

export function decodeManifest(raw: string): EpochManifest {
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

export function manifestBytesHash(raw: string): string {
	return sha256(raw);
}

export function manifestPayloadHash(manifest: EpochManifest): string {
	return sha256(`${JSON.stringify(payloadOf(manifest))}\n`);
}

function payloadOf(manifest: EpochManifest): EpochManifestPayload {
	return {
		schema: manifest.schema,
		revision: manifest.revision,
		activeEpoch: manifest.activeEpoch,
		records: manifest.records,
	};
}

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

function integrityOf(payload: EpochManifestPayload): EpochManifest["integrity"] {
	return {
		algorithm: "sha256",
		digest: sha256(`${JSON.stringify(payload)}\n`),
	};
}

function sha256(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

function validateManifest(value: unknown): EpochManifest {
	const object = asObject(value, "manifest");
	assertKeys(object, ["schema", "revision", "activeEpoch", "records", "integrity"], "manifest");
	if (object.schema !== CODEX_EPOCH_MANIFEST_SCHEMA) {
		throw new Error("unsupported schema");
	}
	if (!isInteger(object.revision) || object.revision < 0) {
		throw new Error("invalid revision");
	}
	const records = asArray(object.records, "records").map((record, index) =>
		validateRecord(record, `records[${index}]`),
	);
	const activeEpoch = object.activeEpoch === null ? null : validateActiveEpoch(object.activeEpoch);
	const integrity = validateIntegrity(object.integrity);
	const payload: EpochManifestPayload = {
		schema: CODEX_EPOCH_MANIFEST_SCHEMA,
		revision: object.revision,
		activeEpoch,
		records,
	};
	const expectedIntegrity = integrityOf(payload);
	if (integrity.digest !== expectedIntegrity.digest) {
		throw new Error("integrity digest mismatch");
	}
	return withIntegrity(payload);
}

function validateActiveEpoch(value: unknown): ActiveEpoch {
	const object = asObject(value, "activeEpoch");
	assertKeys(object, ["childId", "epoch", "operationId"], "activeEpoch");
	return {
		childId: asChildId(object.childId, "activeEpoch.childId"),
		epoch: asEpoch(object.epoch, object.childId, "activeEpoch.epoch"),
		operationId: asToken(object.operationId, "activeEpoch.operationId"),
	};
}

function validateRecord(value: unknown, label: string): EpochOperationRecord {
	const object = asObject(value, label);
	assertKeys(
		object,
		[
			"correlation",
			"operation",
			"status",
			"outcome",
			"provenance",
			"reason",
			"createdAtMs",
			"updatedAtMs",
		],
		label,
	);
	const correlation = validateCorrelation(object.correlation, `${label}.correlation`);
	const operation = validateOperation(object.operation, `${label}.operation`);
	const status = asEnum(
		object.status,
		["staged", "committed", "rolled_back", "inspect_only"],
		`${label}.status`,
	) as EpochOperationStatus;
	const outcome = asEnum(
		object.outcome,
		["pending", "delivered", "not_delivered", "outcome_unknown"],
		`${label}.outcome`,
	) as EpochOperationOutcome;
	if (
		(status === "staged" && outcome !== "pending") ||
		(status === "committed" && outcome !== "delivered") ||
		(status === "rolled_back" && outcome !== "not_delivered") ||
		(status === "inspect_only" && outcome !== "outcome_unknown")
	) {
		throw new Error(`${label} has an invalid status/outcome pair`);
	}
	const provenance = validateProvenance(object.provenance, `${label}.provenance`);
	const reason = object.reason === null ? null : asReason(object.reason, `${label}.reason`);
	const createdAtMs = asTimestamp(object.createdAtMs, `${label}.createdAtMs`);
	const updatedAtMs = asTimestamp(object.updatedAtMs, `${label}.updatedAtMs`);
	if (updatedAtMs < createdAtMs) {
		throw new Error(`${label}.updatedAtMs precedes createdAtMs`);
	}
	if (status === "staged" && reason !== null) {
		throw new Error(`${label}.staged record cannot have a reason`);
	}
	if (
		status === "staged" &&
		(provenance.threadId !== null ||
			provenance.turnId !== null ||
			provenance.threadSource !== null ||
			provenance.confirmedAtMs !== null)
	) {
		throw new Error(`${label}.staged record cannot have confirmed provenance`);
	}
	if (status !== "staged" && reason === null) {
		throw new Error(`${label} terminal record needs a reason`);
	}
	if (status === "committed" && provenance.confirmedAtMs === null) {
		throw new Error(`${label}.committed record needs a confirmation timestamp`);
	}
	if (status === "committed" && THREAD_PROVENANCE_KINDS.has(operation.kind)) {
		if (provenance.threadId === null) {
			throw new Error(`${label}.committed thread effect needs thread provenance`);
		}
	}
	if (operation.id !== correlation.operationId) {
		throw new Error(`${label} operation id does not match correlation`);
	}
	if (provenance.childId !== correlation.childId || provenance.epoch !== correlation.epoch) {
		throw new Error(`${label} provenance does not match correlation`);
	}
	return {
		correlation,
		operation,
		status,
		outcome,
		provenance,
		reason,
		createdAtMs,
		updatedAtMs,
	};
}

function validateCorrelation(value: unknown, label: string): EpochOperationCorrelation {
	const object = asObject(value, label);
	assertKeys(object, ["childId", "epoch", "operationId"], label);
	return {
		childId: asChildId(object.childId, `${label}.childId`),
		epoch: asEpoch(object.epoch, object.childId, `${label}.epoch`),
		operationId: asToken(object.operationId, `${label}.operationId`),
	};
}

function validateOperation(value: unknown, label: string): EpochOperationDescriptor {
	const object = asObject(value, label);
	assertKeys(object, ["id", "kind", "rpc"], label);
	return {
		id: asToken(object.id, `${label}.id`),
		kind: asToken(object.kind, `${label}.kind`),
		rpc: object.rpc === null ? null : asToken(object.rpc, `${label}.rpc`),
	};
}

function validateProvenance(value: unknown, label: string): EpochProvenance {
	const object = asObject(value, label);
	assertKeys(
		object,
		[
			"childId",
			"epoch",
			"threadId",
			"turnId",
			"threadSource",
			"workspaceRoot",
			"instructionHash",
			"manifestHash",
			"confirmedAtMs",
		],
		label,
	);
	return {
		childId: asChildId(object.childId, `${label}.childId`),
		epoch: asEpoch(object.epoch, object.childId, `${label}.epoch`),
		threadId:
			object.threadId === null
				? null
				: (asDomainIdentity(object.threadId, "thread", `${label}.threadId`) as ThreadId),
		turnId:
			object.turnId === null
				? null
				: (asDomainIdentity(object.turnId, "turn", `${label}.turnId`) as TurnId),
		threadSource:
			object.threadSource === null ? null : asToken(object.threadSource, `${label}.threadSource`),
		workspaceRoot: asAbsolutePath(object.workspaceRoot, `${label}.workspaceRoot`),
		instructionHash: asHash(object.instructionHash, `${label}.instructionHash`),
		manifestHash: asHash(object.manifestHash, `${label}.manifestHash`),
		confirmedAtMs:
			object.confirmedAtMs === null
				? null
				: asTimestamp(object.confirmedAtMs, `${label}.confirmedAtMs`),
	};
}

function validateIntegrity(value: unknown): EpochManifest["integrity"] {
	const object = asObject(value, "integrity");
	assertKeys(object, ["algorithm", "digest"], "integrity");
	if (object.algorithm !== "sha256") {
		throw new Error("unsupported integrity algorithm");
	}
	if (typeof object.digest !== "string" || !/^[0-9a-f]{64}$/.test(object.digest)) {
		throw new Error("invalid integrity digest");
	}
	return { algorithm: "sha256", digest: object.digest };
}

function asObject(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object`);
	}
	return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string): unknown[] {
	if (!Array.isArray(value)) {
		throw new Error(`${label} must be an array`);
	}
	return value;
}

function assertKeys(
	object: Record<string, unknown>,
	expected: readonly string[],
	label: string,
): void {
	const keys = Object.keys(object);
	if (keys.length !== expected.length || expected.some((key) => !Object.hasOwn(object, key))) {
		throw new Error(`${label} has missing or unknown fields`);
	}
}

function asChildId(value: unknown, label: string): ChildId {
	return asDomainIdentity(value, "child", label) as ChildId;
}

function asEpoch(value: unknown, childValue: unknown, label: string): ChildEpoch {
	const child = asDomainIdentity(childValue, "child", `${label}.child`) as ChildId;
	const epoch = asDomainIdentity(value, "epoch", label);
	const childToken = /^archboard:child:([A-Za-z0-9][A-Za-z0-9._~-]{0,8192})$/u.exec(child)?.[1];
	const epochToken =
		/^archboard:epoch:([A-Za-z0-9][A-Za-z0-9._~-]{0,8192})\.([A-Za-z0-9][A-Za-z0-9._~-]{0,8192})$/u.exec(
			epoch,
		);
	if (childToken === undefined || epochToken === null || epochToken[1] !== childToken) {
		throw new Error(`${label} does not belong to its child`);
	}
	return epoch as ChildEpoch;
}

function asDomainIdentity(
	value: unknown,
	domain: "child" | "epoch" | "thread" | "turn",
	label: string,
): string {
	const identity = asBoundedString(value, label, 8193);
	const match = new RegExp(`^archboard:${domain}:([A-Za-z0-9][A-Za-z0-9._~-]{0,8192})$`, "u").exec(
		identity,
	);
	if (match === null) {
		throw new Error(`${label} is not a canonical ${domain} identity`);
	}
	return identity;
}

function asToken(value: unknown, label: string): string {
	const token = asBoundedString(value, label, 256);
	if (!/^[A-Za-z0-9][A-Za-z0-9._~:/-]{0,255}$/u.test(token)) {
		throw new Error(`${label} is not a bounded token`);
	}
	return token;
}

function asReason(value: unknown, label: string): string {
	const reason = asBoundedString(value, label, 1024);
	if (reason.includes("\0") || reason.includes("\r") || reason.includes("\n")) {
		throw new Error(`${label} contains a control character`);
	}
	return reason;
}

function asHash(value: unknown, label: string): string {
	const hash = asBoundedString(value, label, 64);
	if (!/^[0-9a-f]{64}$/u.test(hash)) {
		throw new Error(`${label} must be a lowercase SHA-256 digest`);
	}
	return hash;
}

function asAbsolutePath(value: unknown, label: string): string {
	const path = asBoundedString(value, label, 4096);
	if (!isAbsolute(path) || resolve(path) !== path) {
		throw new Error(`${label} must be a canonical absolute path`);
	}
	return path;
}

function asBoundedString(value: unknown, label: string, maxLength: number): string {
	if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
		throw new Error(`${label} must be a non-empty bounded string`);
	}
	return value;
}

function asTimestamp(value: unknown, label: string): number {
	if (!isInteger(value) || value < 0) {
		throw new Error(`${label} must be a non-negative integer`);
	}
	return value;
}

function isInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value);
}

function freezeRecord(record: EpochOperationRecord): EpochOperationRecord {
	return Object.freeze({
		...record,
		correlation: Object.freeze({ ...record.correlation }),
		operation: Object.freeze({ ...record.operation }),
		provenance: Object.freeze({ ...record.provenance }),
	});
}

function asEnum(value: unknown, values: readonly string[], label: string): string {
	if (typeof value !== "string" || !values.includes(value)) {
		throw new Error(`${label} has an unknown value`);
	}
	return value;
}
