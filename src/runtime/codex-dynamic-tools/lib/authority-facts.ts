import { CodexDynamicToolsError } from "@/runtime/codex-dynamic-tools/lib/errors";
import type {
	CodexDynamicToolsOptions,
	DynamicCallerAuthority,
	DynamicTargetAuthority,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import type { ThreadLinkClassification } from "@/runtime/codex-thread-link";
import type { DynamicRefusalReason } from "@/runtime/codex-dynamic-tools/lib/vocabulary";
import { isNonEmptyString } from "@/runtime/codex-dynamic-tools/lib/value-shape";

type AuthorityFacts = Readonly<
	Omit<DynamicTargetAuthority, "authority" | "role" | "linkClassification" | "threadLinkTarget">
>;
type CallerFacts = Readonly<
	Omit<DynamicCallerAuthority, "linkClassification" | "threadLinkTarget">
>;
type LinkEvidence = Readonly<Omit<ThreadLinkClassification, "thread">>;
type AuthorityShape = Readonly<
	Omit<DynamicCallerAuthority | DynamicTargetAuthority, "linkClassification" | "threadLinkTarget">
> & {
	readonly threadLinkTarget: Readonly<Pick<DynamicTargetAuthority["threadLinkTarget"], "threadId">>;
};
type ExecutionProof = NonNullable<DynamicCallerAuthority["provenance"]>;
type ProofRecord = ExecutionProof["record"];
type ThreadLinkDependency = Pick<CodexDynamicToolsOptions["threadLink"], "classify">;
type AuthorityDependencies = Pick<CodexDynamicToolsOptions, "threadAuthority" | "threadLink">;

/**
 * Build a refusal for the authority boundary.
 * @param code Refusal reason.
 * @param message Human-readable explanation.
 * @param cause The underlying thrown value, if any.
 * @returns The refusal error.
 */
function dynamicError(
	code: DynamicRefusalReason,
	message: string,
	cause?: unknown,
): CodexDynamicToolsError {
	return new CodexDynamicToolsError(code, message, cause);
}

/**
 * Whether a value is null or a non-empty string, the shape of an optional
 * identity field.
 * @param value Candidate of unknown origin.
 * @returns Whether the value is null or a non-empty string.
 */
function isNullOrNonEmptyString(value: unknown): value is string | null {
	return value === null || isNonEmptyString(value);
}

/**
 * Whether two durable records name the same staged operation correlation.
 * @param left One record.
 * @param right The other record.
 * @returns Whether the correlations are equal.
 */
function sameCorrelation(left: ProofRecord, right: ProofRecord): boolean {
	return (
		left.correlation.childId === right.correlation.childId &&
		left.correlation.epoch === right.correlation.epoch &&
		left.correlation.operationId === right.correlation.operationId
	);
}

/**
 * Whether two durable records describe the same operation.
 * @param left One record.
 * @param right The other record.
 * @returns Whether the operation fields are equal.
 */
function sameOperation(left: ProofRecord, right: ProofRecord): boolean {
	return (
		left.operation.id === right.operation.id &&
		left.operation.kind === right.operation.kind &&
		left.operation.rpc === right.operation.rpc
	);
}

/**
 * Whether two durable records carry the same provenance identity.
 * @param left One record.
 * @param right The other record.
 * @returns Whether the child, epoch, thread and turn are equal.
 */
function sameProvenanceIdentity(left: ProofRecord, right: ProofRecord): boolean {
	return (
		left.provenance.childId === right.provenance.childId &&
		left.provenance.epoch === right.provenance.epoch &&
		left.provenance.threadId === right.provenance.threadId &&
		left.provenance.turnId === right.provenance.turnId
	);
}

/**
 * Whether two durable records carry the same provenance evidence.
 * @param left One record.
 * @param right The other record.
 * @returns Whether the source, roots, hashes and confirmation time are equal.
 */
function sameProvenanceEvidence(left: ProofRecord, right: ProofRecord): boolean {
	return (
		left.provenance.threadSource === right.provenance.threadSource &&
		left.provenance.workspaceRoot === right.provenance.workspaceRoot &&
		left.provenance.instructionHash === right.provenance.instructionHash &&
		left.provenance.manifestHash === right.provenance.manifestHash &&
		left.provenance.confirmedAtMs === right.provenance.confirmedAtMs
	);
}

/**
 * Whether two durable records are in the same lifecycle state.
 * @param left One record.
 * @param right The other record.
 * @returns Whether status, outcome, reason and timestamps are equal.
 */
function sameRecordState(left: ProofRecord, right: ProofRecord): boolean {
	return (
		left.status === right.status &&
		left.outcome === right.outcome &&
		left.reason === right.reason &&
		left.createdAtMs === right.createdAtMs &&
		left.updatedAtMs === right.updatedAtMs
	);
}

/**
 * Whether two non-null execution proofs are field-for-field equal.
 * @param left One proof.
 * @param right The other proof.
 * @returns Whether every compared field is equal.
 */
function sameProofRecords(left: ExecutionProof, right: ExecutionProof): boolean {
	return (
		left.manifestRevision === right.manifestRevision &&
		sameCorrelation(left.record, right.record) &&
		sameOperation(left.record, right.record) &&
		sameProvenanceIdentity(left.record, right.record) &&
		sameProvenanceEvidence(left.record, right.record) &&
		sameRecordState(left.record, right.record)
	);
}

/**
 * Whether two execution proofs are equal, treating a malformed proof as unequal.
 * @param left One proof or null.
 * @param right The other proof or null.
 * @returns Whether both are null or field-for-field equal.
 */
function sameProof(
	left: DynamicCallerAuthority["provenance"],
	right: DynamicCallerAuthority["provenance"],
): boolean {
	if (left === null || right === null) {
		return left === right;
	}
	try {
		return sameProofRecords(left, right);
	} catch {
		return false;
	}
}

/**
 * Whether two thread sources are structurally equal.
 * @param left One source.
 * @param right The other source.
 * @returns Whether the sources serialize identically.
 */
function sameSource(
	left: DynamicCallerAuthority["source"],
	right: DynamicCallerAuthority["source"],
): boolean {
	try {
		return JSON.stringify(left) === JSON.stringify(right);
	} catch {
		return false;
	}
}

export {
	type AuthorityDependencies,
	type AuthorityFacts,
	type AuthorityShape,
	type CallerFacts,
	type ExecutionProof,
	type LinkEvidence,
	type ProofRecord,
	type ThreadLinkDependency,
	dynamicError,
	isNullOrNonEmptyString,
	sameProof,
	sameSource,
};
