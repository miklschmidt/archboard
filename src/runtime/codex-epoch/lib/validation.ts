import { isAbsolute, resolve } from "node:path";

import type {
	ChildEpoch,
	ChildId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	CodexEpochError,
	type CodexEpochErrorCode,
	type DiskState,
	type EpochCasToken,
	type EpochConfirmation,
	type EpochExecutionRequest,
	type EpochStageInput,
	type EpochTransaction,
} from "./contract.js";
import type {
	EpochManifest,
	EpochOperationCorrelation,
	EpochOperationRecord,
	EpochProvenance,
} from "./manifest.js";
import { operationRequiresThreadProvenance } from "./manifest.js";

const CHILD_PATTERN = /^archboard:child:([A-Za-z0-9][A-Za-z0-9._~-]{0,8192})$/u;
const EPOCH_PATTERN =
	/^archboard:epoch:([A-Za-z0-9][A-Za-z0-9._~-]{0,8192})\.([A-Za-z0-9][A-Za-z0-9._~-]{0,8192})$/u;
const THREAD_PATTERN = /^archboard:thread:[A-Za-z0-9][A-Za-z0-9._~-]{0,8192}$/u;
const TURN_PATTERN = /^archboard:turn:[A-Za-z0-9][A-Za-z0-9._~-]{0,8192}$/u;
const OPERATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~:/-]{0,255}$/u;
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~:/-]{0,255}$/u;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
export const EPOCH_START_KIND = "epoch_start";

export interface EpochValidationInput {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly operationId: string;
	readonly kind: string;
	readonly rpc: string | null;
	readonly workspaceRoot: string;
	readonly instructionHash: string;
	readonly manifestHash: string;
}

export interface PreparedExecutionRequest {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly operationId: string;
	readonly threadId: ThreadId | null | undefined;
}

export function prepareInput(input: EpochStageInput): EpochValidationInput {
	const childId = canonicalChild(input.childId, "childId");
	const epoch = canonicalEpoch(input.epoch, childId, "epoch");
	const operationId = boundedToken(input.operationId, "operationId", OPERATION_PATTERN);
	const kind = boundedToken(input.kind, "kind", TOKEN_PATTERN);
	const rpc =
		input.rpc === undefined || input.rpc === null
			? null
			: boundedToken(input.rpc, "rpc", TOKEN_PATTERN);
	const workspaceRoot = canonicalWorkspaceRoot(input.workspaceRoot);
	const instructionHash = sha256Hash(input.instructionHash, "instructionHash");
	const manifestHash = sha256Hash(input.manifestHash, "manifestHash");
	return {
		childId,
		epoch,
		operationId,
		kind,
		rpc,
		workspaceRoot,
		instructionHash,
		manifestHash,
	};
}

export function prepareExecutionRequest(request: EpochExecutionRequest): PreparedExecutionRequest {
	const childId = canonicalChild(request.childId, "childId");
	const epoch = canonicalEpoch(request.epoch, childId, "epoch");
	const operationId = boundedToken(request.operationId, "operationId", OPERATION_PATTERN);
	const threadId =
		request.threadId === null || request.threadId === undefined
			? request.threadId
			: canonicalThread(request.threadId, "threadId");
	return { childId, epoch, operationId, threadId };
}

export function committedProvenance(
	record: EpochOperationRecord,
	confirmation: EpochConfirmation | undefined,
	now: () => number,
): EpochProvenance {
	const input = confirmation ?? {};
	const threadId =
		input.threadId === undefined || input.threadId === null
			? null
			: canonicalThread(input.threadId, "threadId");
	const turnId =
		input.turnId === undefined || input.turnId === null
			? null
			: canonicalTurn(input.turnId, "turnId");
	if (operationRequiresThreadProvenance(record.operation.kind) && threadId === null) {
		throw epochError(
			"invalid_input",
			`${record.operation.kind} requires exact confirmed thread provenance`,
		);
	}
	if (turnId !== null && threadId === null) {
		throw epochError("invalid_input", "turn provenance requires a confirmed thread");
	}
	const threadSource =
		input.threadSource === undefined || input.threadSource === null
			? null
			: boundedToken(input.threadSource, "threadSource", TOKEN_PATTERN);
	const confirmedAtMs =
		input.confirmedAtMs === undefined
			? timestamp(now(), "confirmedAtMs", record.createdAtMs)
			: timestamp(input.confirmedAtMs, "confirmedAtMs", record.createdAtMs);
	return {
		...record.provenance,
		threadId,
		turnId,
		threadSource,
		confirmedAtMs,
	};
}

export function uncertainProvenance(
	record: EpochOperationRecord,
	confirmation: EpochConfirmation | undefined,
): EpochProvenance {
	if (confirmation === undefined) {
		return record.provenance;
	}
	const threadId =
		confirmation.threadId === undefined || confirmation.threadId === null
			? null
			: canonicalThread(confirmation.threadId, "threadId");
	const turnId =
		confirmation.turnId === undefined || confirmation.turnId === null
			? null
			: canonicalTurn(confirmation.turnId, "turnId");
	if (turnId !== null && threadId === null) {
		throw epochError("invalid_input", "uncertain turn provenance requires a thread");
	}
	const threadSource =
		confirmation.threadSource === undefined || confirmation.threadSource === null
			? null
			: boundedToken(confirmation.threadSource, "threadSource", TOKEN_PATTERN);
	const confirmedAtMs =
		confirmation.confirmedAtMs === undefined
			? null
			: timestamp(confirmation.confirmedAtMs, "confirmedAtMs", record.createdAtMs);
	return {
		...record.provenance,
		threadId,
		turnId,
		threadSource,
		confirmedAtMs,
	};
}

export function assertExactConfirmation(
	previous: EpochProvenance,
	confirmed: EpochProvenance,
): void {
	if (
		(previous.threadId !== null && previous.threadId !== confirmed.threadId) ||
		(previous.turnId !== null && previous.turnId !== confirmed.turnId) ||
		(previous.threadSource !== null && previous.threadSource !== confirmed.threadSource)
	) {
		throw epochError("unknown_provenance", "confirmation does not match the recorded correlation");
	}
}

export function assertExecutionThread(
	record: EpochOperationRecord,
	threadId: ThreadId | null | undefined,
): void {
	if (operationRequiresThreadProvenance(record.operation.kind) && threadId === undefined) {
		throw epochError("unknown_provenance", "thread identity is required for this operation");
	}
	if (threadId !== undefined && threadId !== record.provenance.threadId) {
		throw epochError(
			"unknown_provenance",
			"thread identity does not match the confirmed operation",
		);
	}
}

export function assertThreadProvenanceEligible(
	manifest: EpochManifest,
	record: EpochOperationRecord,
	threadId: ThreadId | null,
): void {
	for (const candidate of manifest.records) {
		if (
			threadId === null ||
			candidate.correlation.operationId === record.correlation.operationId ||
			candidate.provenance.threadId !== threadId
		) {
			continue;
		}
		if (candidate.status === "inspect_only") {
			throw epochError("inspect_only", "a tombstoned thread cannot be confirmed or relinked");
		}
		if (candidate.correlation.childId !== record.correlation.childId) {
			throw epochError("stale_child", "thread provenance belongs to a replaced child");
		}
		if (candidate.correlation.epoch !== record.correlation.epoch) {
			throw epochError("prior_epoch", "thread provenance belongs to a prior epoch");
		}
	}
}

export function findStagedRecord(
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

export function findRecord(
	manifest: EpochManifest,
	transaction: EpochTransaction,
): EpochOperationRecord {
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

export function sameRecordInput(left: EpochOperationRecord, right: EpochOperationRecord): boolean {
	return (
		left.operation.id === right.operation.id &&
		left.operation.kind === right.operation.kind &&
		left.operation.rpc === right.operation.rpc &&
		left.provenance.workspaceRoot === right.provenance.workspaceRoot &&
		left.provenance.instructionHash === right.provenance.instructionHash &&
		left.provenance.manifestHash === right.provenance.manifestHash
	);
}

export function assertStageGeneration(manifest: EpochManifest, input: EpochValidationInput): void {
	if (input.kind === EPOCH_START_KIND) {
		if (
			manifest.activeEpoch !== null &&
			manifest.activeEpoch.childId === input.childId &&
			manifest.activeEpoch.epoch === input.epoch
		) {
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

export function assertCurrentGeneration(
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

export function assertManifestRelations(manifest: EpochManifest): void {
	const operationIds = new Set<string>();
	for (const record of manifest.records) {
		if (operationIds.has(record.correlation.operationId)) {
			throw epochError("invalid_transition", "duplicate operation identity in epoch manifest");
		}
		operationIds.add(record.correlation.operationId);
	}
	if (manifest.activeEpoch === null) {
		return;
	}
	const activeRecord = manifest.records.find(
		(record) => record.correlation.operationId === manifest.activeEpoch?.operationId,
	);
	if (
		activeRecord === undefined ||
		activeRecord.operation.kind !== EPOCH_START_KIND ||
		activeRecord.status !== "committed" ||
		activeRecord.outcome !== "delivered" ||
		activeRecord.correlation.childId !== manifest.activeEpoch.childId ||
		activeRecord.correlation.epoch !== manifest.activeEpoch.epoch
	) {
		throw epochError("invalid_transition", "active epoch does not match a committed epoch record");
	}
}

export function replaceRecord(
	records: readonly EpochOperationRecord[],
	replacement: EpochOperationRecord,
): readonly EpochOperationRecord[] {
	return records.map((record) =>
		record.correlation.operationId === replacement.correlation.operationId ? replacement : record,
	);
}

export function freezeRecord(record: EpochOperationRecord): EpochOperationRecord {
	return Object.freeze({
		...record,
		correlation: Object.freeze({ ...record.correlation }),
		operation: Object.freeze({ ...record.operation }),
		provenance: Object.freeze({ ...record.provenance }),
	});
}

export function casFor(manifest: EpochManifest, bytesHash: string): EpochCasToken {
	return Object.freeze({ revision: manifest.revision, bytesHash });
}

export function casForState(state: DiskState): EpochCasToken {
	return Object.freeze({ revision: state.manifest.revision, bytesHash: state.bytesHash });
}

export function sameCas(left: EpochCasToken, right: EpochCasToken): boolean {
	return left.revision === right.revision && left.bytesHash === right.bytesHash;
}

export function prepareCas(value: EpochCasToken): EpochCasToken {
	if (
		value === null ||
		typeof value !== "object" ||
		Object.keys(value).length !== 2 ||
		!Object.hasOwn(value, "revision") ||
		!Object.hasOwn(value, "bytesHash") ||
		!Number.isSafeInteger(value.revision) ||
		value.revision < 0 ||
		(value.bytesHash !== null && !/^[0-9a-f]{64}$/u.test(value.bytesHash))
	) {
		throw epochError("invalid_input", "CAS token is malformed");
	}
	return Object.freeze({ revision: value.revision, bytesHash: value.bytesHash });
}

export function normalizeRoot(value: string): string {
	if (typeof value !== "string" || !isAbsolute(value)) {
		throw epochError("invalid_input", "epoch root must be an absolute path");
	}
	const root = resolve(value);
	if (root === "/") {
		throw epochError("invalid_input", "epoch root cannot be the filesystem root");
	}
	return root;
}

export function canonicalChild(value: unknown, label: string): ChildId {
	if (typeof value !== "string") {
		throw epochError("invalid_input", `${label} must be a canonical child identity`);
	}
	if (CHILD_PATTERN.exec(value) === null) {
		throw epochError("invalid_input", `${label} must be a canonical child identity`);
	}
	return value as ChildId;
}

export function canonicalEpoch(value: unknown, childId: ChildId, label: string): ChildEpoch {
	if (typeof value !== "string") {
		throw epochError("invalid_input", `${label} must be a canonical child epoch`);
	}
	const match = EPOCH_PATTERN.exec(value);
	const childMatch = CHILD_PATTERN.exec(childId);
	if (match === null || childMatch === null || match[1] !== childMatch[1]) {
		throw epochError("invalid_input", `${label} must be bound to the supplied child identity`);
	}
	return value as ChildEpoch;
}

export function canonicalThread(value: unknown, label: string): ThreadId {
	if (typeof value !== "string" || THREAD_PATTERN.exec(value) === null) {
		throw epochError("invalid_input", `${label} must be a canonical thread identity`);
	}
	return value as ThreadId;
}

export function canonicalTurn(value: unknown, label: string): TurnId {
	if (typeof value !== "string" || TURN_PATTERN.exec(value) === null) {
		throw epochError("invalid_input", `${label} must be a canonical turn identity`);
	}
	return value as TurnId;
}

export function boundedToken(value: unknown, label: string, pattern: RegExp): string {
	if (typeof value !== "string" || pattern.exec(value) === null) {
		throw epochError("invalid_input", `${label} must be a bounded token`);
	}
	return value;
}

export function canonicalWorkspaceRoot(value: unknown): string {
	if (typeof value !== "string" || !isAbsolute(value)) {
		throw epochError("invalid_input", "workspaceRoot must be an absolute path");
	}
	const root = resolve(value);
	if (root === "/") {
		throw epochError("invalid_input", "workspaceRoot cannot be the filesystem root");
	}
	return root;
}

export function sha256Hash(value: unknown, label: string): string {
	if (typeof value !== "string" || HASH_PATTERN.exec(value) === null) {
		throw epochError("invalid_input", `${label} must be a lowercase SHA-256 digest`);
	}
	return value;
}

export function prepareReason(value: unknown): string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > 1024 ||
		value.includes("\0") ||
		value.includes("\r") ||
		value.includes("\n")
	) {
		throw epochError(
			"invalid_input",
			"terminal reason must be bounded and free of control characters",
		);
	}
	return value;
}

export function timestamp(value: unknown, label: string, minimum = 0): number {
	if (!Number.isSafeInteger(value) || (value as number) < minimum) {
		throw epochError("invalid_input", `${label} must be a safe timestamp`);
	}
	return value as number;
}

export function epochError(
	code: CodexEpochErrorCode,
	message: string,
	cause?: unknown,
): CodexEpochError {
	return new CodexEpochError(code, message, cause);
}
