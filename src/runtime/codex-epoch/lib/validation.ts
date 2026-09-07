import type { ChildEpoch, ChildId, ThreadId, TurnId } from "@/shared/codex-workbench-identity";
import type {
	EpochConfirmation,
	EpochExecutionRequest,
	EpochStageInput,
} from "@/runtime/codex-epoch/lib/contract";
import type {
	EpochManifest,
	EpochOperationRecord,
	EpochProvenance,
} from "@/runtime/codex-epoch/lib/manifest";
import { operationRequiresThreadProvenance } from "@/runtime/codex-epoch/lib/manifest";
import {
	OPERATION_PATTERN,
	TOKEN_PATTERN,
	boundedToken,
	canonicalChild,
	canonicalEpoch,
	canonicalThread,
	canonicalTurn,
	canonicalWorkspaceRoot,
	epochError,
	sha256Hash,
	timestamp,
} from "@/runtime/codex-epoch/lib/epoch-identity";

/** The identities a confirmation reports about what an operation actually reached. */
interface ConfirmedIdentities {
	readonly threadId: ThreadId | null;
	readonly turnId: TurnId | null;
	readonly threadSource: string | null;
}

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

/**
 * Validate everything a caller supplies when staging an operation, so nothing unvalidated
 * reaches the durable record.
 * @param input - The staging arguments.
 * @returns The validated input.
 */
export function prepareInput(input: EpochStageInput): EpochValidationInput {
	const childId = canonicalChild(input.childId, "childId");
	const epoch = canonicalEpoch(input.epoch, childId, "epoch");
	const operationId = boundedToken(input.operationId, "operationId", OPERATION_PATTERN);
	const kind = boundedToken(input.kind, "kind", TOKEN_PATTERN);
	const rpc =
		input.rpc === undefined || input.rpc === null
			? null
			: boundedToken(input.rpc, "rpc", TOKEN_PATTERN);
	return {
		childId,
		epoch,
		operationId,
		kind,
		rpc,
		workspaceRoot: canonicalWorkspaceRoot(input.workspaceRoot),
		instructionHash: sha256Hash(input.instructionHash, "instructionHash"),
		manifestHash: sha256Hash(input.manifestHash, "manifestHash"),
	};
}

/**
 * Validate the identity a caller asks the store to prove current.
 * @param request - The execution request.
 * @returns The validated request.
 */
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

/**
 * Validate one confirmed field, which a caller may leave out or explicitly report as absent.
 * @param value - The confirmed value, if any.
 * @param validate - Validates the value when there is one.
 * @returns The validated value, or null when nothing was confirmed.
 */
function confirmedField<Value, Validated>(
	value: Value | null | undefined,
	validate: (value: Value) => Validated,
): Validated | null {
	return value === undefined || value === null ? null : validate(value);
}

/**
 * Validate the identities a confirmation reports, refusing a turn that names no thread: a turn
 * only exists inside one.
 * @param confirmation - The confirmation, when the caller supplied one.
 * @param turnRequiresThread - The refusal message when a turn arrives without its thread.
 * @returns The confirmed thread, turn and source, each of which may be absent.
 */
function confirmedIdentities(
	confirmation: EpochConfirmation,
	turnRequiresThread: string,
): ConfirmedIdentities {
	const threadId = confirmedField(confirmation.threadId, (value) =>
		canonicalThread(value, "threadId"),
	);
	const turnId = confirmedField(confirmation.turnId, (value) => canonicalTurn(value, "turnId"));
	if (turnId !== null && threadId === null) {
		throw epochError("invalid_input", turnRequiresThread);
	}
	const threadSource = confirmedField(confirmation.threadSource, (value) =>
		boundedToken(value, "threadSource", TOKEN_PATTERN),
	);
	return { threadId, turnId, threadSource };
}

/**
 * The provenance a committed record carries: what the operation actually reached, and when it
 * was confirmed. An operation that must name a thread is refused without one.
 * @param record - The staged record being committed.
 * @param confirmation - What the caller observed, when anything.
 * @param now - The clock, for a confirmation that does not carry its own instant.
 * @returns The committed provenance.
 */
export function committedProvenance(
	record: EpochOperationRecord,
	confirmation: EpochConfirmation | undefined,
	now: () => number,
): EpochProvenance {
	const observed = confirmedIdentities(
		confirmation ?? {},
		"turn provenance requires a confirmed thread",
	);
	if (operationRequiresThreadProvenance(record.operation.kind) && observed.threadId === null) {
		throw epochError(
			"invalid_input",
			`${record.operation.kind} requires exact confirmed thread provenance`,
		);
	}
	const confirmedAtMs = timestamp(
		confirmation?.confirmedAtMs ?? now(),
		"confirmedAtMs",
		record.createdAtMs,
	);
	return { ...record.provenance, ...observed, confirmedAtMs };
}

/**
 * The provenance a record carries when its outcome is unknown: whatever was observed, with no
 * confirmation instant unless the caller supplied one.
 * @param record - The staged record being settled.
 * @param confirmation - What the caller observed, when anything.
 * @returns The provenance.
 */
export function uncertainProvenance(
	record: EpochOperationRecord,
	confirmation: EpochConfirmation | undefined,
): EpochProvenance {
	if (confirmation === undefined) {
		return record.provenance;
	}
	const observed = confirmedIdentities(confirmation, "uncertain turn provenance requires a thread");
	const confirmedAtMs =
		confirmation.confirmedAtMs === undefined
			? null
			: timestamp(confirmation.confirmedAtMs, "confirmedAtMs", record.createdAtMs);
	return { ...record.provenance, ...observed, confirmedAtMs };
}

/**
 * Refuse a confirmation that contradicts what the record already recorded. Provenance may be
 * filled in, never rewritten.
 * @param previous - The provenance the record already carried.
 * @param confirmed - The provenance the confirmation produced.
 */
export function assertExactConfirmation(
	previous: EpochProvenance,
	confirmed: EpochProvenance,
): void {
	const contradicts = (["threadId", "turnId", "threadSource"] as const).some(
		(field) => previous[field] !== null && previous[field] !== confirmed[field],
	);
	if (contradicts) {
		throw epochError("unknown_provenance", "confirmation does not match the recorded correlation");
	}
}

/**
 * Refuse an execution proof for the wrong thread, and refuse to prove an operation that must
 * name a thread without one.
 * @param record - The committed record.
 * @param threadId - The thread the caller is asking about.
 */
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

/**
 * Refuse a thread another record has already claimed in a way this one cannot override: a
 * tombstoned thread stays tombstoned, and a thread owned by a replaced child or a prior epoch
 * cannot be confirmed or relinked now.
 * @param candidate - The other record naming the same thread.
 * @param record - The record being settled.
 */
function assertThreadNotClaimed(
	candidate: EpochOperationRecord,
	record: EpochOperationRecord,
): void {
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

/**
 * Refuse to record thread provenance that another record in the manifest already owns.
 * @param manifest - The durable manifest.
 * @param record - The record being settled.
 * @param threadId - The thread it names, when it names one.
 */
export function assertThreadProvenanceEligible(
	manifest: EpochManifest,
	record: EpochOperationRecord,
	threadId: ThreadId | null,
): void {
	if (threadId === null) {
		return;
	}
	for (const candidate of manifest.records) {
		if (
			candidate.correlation.operationId === record.correlation.operationId ||
			candidate.provenance.threadId !== threadId
		) {
			continue;
		}
		assertThreadNotClaimed(candidate, record);
	}
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
} from "@/runtime/codex-epoch/lib/manifest-relations";

export {
	boundedToken,
	canonicalChild,
	canonicalEpoch,
	canonicalThread,
	canonicalTurn,
	canonicalWorkspaceRoot,
	epochError,
	normalizeRoot,
	prepareReason,
	sha256Hash,
	timestamp,
} from "@/runtime/codex-epoch/lib/epoch-identity";
