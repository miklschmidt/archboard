import type { ChildEpoch, ChildId } from "@/shared/codex-workbench-identity";
import { CODEX_SESSION_THREAD_SOURCE } from "@/runtime/codex-session";
import type { ThreadLinkClassification } from "@/runtime/codex-thread-link";
import {
	CodexCoordinatorError,
	type CodexCoordinatorOptions,
	type CoordinatorConfiguredSettings,
	type CoordinatorEpochRecord,
	type CoordinatorEpochSnapshot,
	type CoordinatorPersistedState,
	type CoordinatorReviewHashes,
} from "@/runtime/codex-coordinator/lib/contract";
import { COORDINATOR_MODEL } from "@/runtime/codex-coordinator/lib/model";
import { hashCoordinatorSettings } from "@/runtime/codex-coordinator/lib/review";
import { errorMessage } from "@/runtime/codex-coordinator/lib/state";

const COORDINATOR_OPERATION_KIND = "coordinator_start" as const;
const COORDINATOR_RPC = "thread/start" as const;

type CandidateDecision =
	| { readonly kind: "reuse"; readonly persistence: CoordinatorPersistedState }
	| {
			readonly kind: "replace";
			readonly reason: string;
			readonly threadId: CoordinatorPersistedState["threadId"] | null;
	  }
	| {
			readonly kind: "inspect";
			readonly reason: string;
			readonly threadId: CoordinatorPersistedState["threadId"] | null;
			readonly operationId: string | null;
	  };

/**
 * Refuse to act unless the epoch store's active epoch is the child epoch this coordinator belongs
 * to: everything a coordinator does is recorded against that epoch.
 * @param snapshot - The epoch snapshot.
 * @param options - The coordinator options carrying the identity authority.
 * @throws {CodexCoordinatorError} When the active epoch is not the current child's.
 */
function assertCurrentEpoch(
	snapshot: CoordinatorEpochSnapshot,
	options: CodexCoordinatorOptions,
): void {
	const active = snapshot.manifest.activeEpoch;
	if (
		active === null ||
		active.childId !== options.identity.validator.childId ||
		active.epoch !== options.identity.validator.epoch
	) {
		throw new CodexCoordinatorError(
			"epoch_unavailable",
			"The epoch store does not contain the coordinator's current child epoch.",
		);
	}
}

/** One durable coordinator record, or the decision that stops the candidate being reused. */
type RecordCheck =
	| { readonly ok: true; readonly record: CoordinatorEpochRecord }
	| { readonly ok: false; readonly decision: CandidateDecision };

/**
 * The decision for a coordinator whose thread/start is still uncertain: a staged or unknown
 * transaction means a coordinator thread may exist that nothing has proven, so another start
 * could leave two.
 * @param records - The coordinator records in the current epoch.
 * @returns The inspect decision, or null when no transaction is uncertain.
 */
function uncertainTransactionDecision(
	records: readonly CoordinatorEpochRecord[],
): CandidateDecision | null {
	const uncertain = records.find(
		(record) =>
			(record.status === "inspect_only" && record.outcome === "outcome_unknown") ||
			(record.status === "staged" && record.outcome === "pending"),
	);
	if (uncertain === undefined) {
		return null;
	}
	return {
		kind: "inspect",
		threadId: uncertain.provenance.threadId,
		operationId: uncertain.correlation.operationId,
		reason:
			"A coordinator thread/start transaction is uncertain; inspect authoritative state before another start.",
	};
}

/**
 * Whether a durable record is a committed, delivered coordinator start.
 * @param record - The durable record.
 * @returns True when the record is committed evidence.
 */
function isCommittedRecord(record: CoordinatorEpochRecord): boolean {
	return record.status === "committed" && record.outcome === "delivered";
}

/**
 * The decision when nothing is retained: with no committed coordinator the first one is started,
 * and with one already committed the thread is left inspect-only, because reuse needs the
 * settings snapshot that was not kept.
 * @param records - The coordinator records in the current epoch.
 * @returns The decision.
 */
function noCandidateDecision(records: readonly CoordinatorEpochRecord[]): CandidateDecision {
	const committed = records.filter(isCommittedRecord);
	if (committed.length === 0) {
		return {
			kind: "replace",
			threadId: null,
			reason: "No coordinator evidence is retained; establish the first coordinator.",
		};
	}
	const reason = "A persisted coordinator settings snapshot is required before reuse.";
	const only = committed.length === 1 ? committed[0] : undefined;
	if (only === undefined) {
		return { kind: "inspect", threadId: null, operationId: null, reason };
	}
	return {
		kind: "inspect",
		threadId: only.provenance.threadId,
		operationId: only.correlation.operationId,
		reason,
	};
}

/**
 * The one durable record that proves the retained coordinator's own operation was delivered.
 * Anything else — no record, several, or one that is not a confirmed effect — leaves the thread
 * inspect-only rather than reused.
 * @param candidate - The retained coordinator.
 * @param records - The coordinator records in the current epoch.
 * @returns The record, or the decision that stops reuse.
 */
function candidateRecordCheck(
	candidate: CoordinatorPersistedState,
	records: readonly CoordinatorEpochRecord[],
): RecordCheck {
	/**
	 * The decision that stops reuse for this candidate.
	 * @param reason - Why it cannot be reused.
	 * @returns The failed check.
	 */
	const inspect = (reason: string): RecordCheck => ({
		ok: false,
		decision: {
			kind: "inspect",
			threadId: candidate.threadId,
			operationId: candidate.operationId,
			reason,
		},
	});
	const matching = records.filter(
		(record) => record.correlation.operationId === candidate.operationId,
	);
	const record = matching.length === 1 ? matching[0] : undefined;
	if (record === undefined) {
		return inspect("The persisted coordinator operation has no unique current durable provenance.");
	}
	if (
		record.status === "inspect_only" ||
		record.status === "staged" ||
		record.outcome !== "delivered"
	) {
		return inspect("The persisted coordinator operation is not a confirmed reusable effect.");
	}
	return { ok: true, record };
}

/**
 * Whether the live epoch proof identifies this exact retained operation, on this thread, from the
 * reviewed instructions and manifest.
 * @param record - The record the current epoch proof carries.
 * @param candidate - The retained coordinator.
 * @param reviewed - The reviewed hashes.
 * @returns True when the proof is the retained coordinator's own.
 */
function proofIdentifiesCandidate(
	record: CoordinatorEpochRecord,
	candidate: CoordinatorPersistedState,
	reviewed: CoordinatorReviewHashes,
): boolean {
	const checks = [
		record.correlation.operationId === candidate.operationId,
		record.operation.id === candidate.operationId,
		record.operation.kind === COORDINATOR_OPERATION_KIND,
		record.operation.rpc === COORDINATOR_RPC,
		record.provenance.threadId === candidate.threadId,
		record.provenance.instructionHash === reviewed.instructionHash,
		record.provenance.manifestHash === reviewed.catalogueHash,
	];
	return checks.every((matched) => matched);
}

/**
 * Prove the retained coordinator is the current durable owner of its thread.
 * @param candidate - The retained coordinator.
 * @param reviewed - The reviewed hashes.
 * @param options - The coordinator options carrying the epoch store.
 * @returns The decision that stops reuse, or null when the proof holds.
 */
function currentProofDecision(
	candidate: CoordinatorPersistedState,
	reviewed: CoordinatorReviewHashes,
	options: CodexCoordinatorOptions,
): CandidateDecision | null {
	/**
	 * The inspect decision for this candidate.
	 * @param reason - Why it cannot be reused.
	 * @returns The decision.
	 */
	const inspect = (reason: string): CandidateDecision => ({
		kind: "inspect",
		threadId: candidate.threadId,
		operationId: candidate.operationId,
		reason,
	});
	try {
		const proof = options.epoch.assertCurrent({
			childId: candidate.childId,
			epoch: candidate.epoch,
			operationId: candidate.operationId,
			threadId: candidate.threadId,
		});
		return proofIdentifiesCandidate(proof.record, candidate, reviewed)
			? null
			: inspect("The current epoch proof does not identify the retained coordinator operation.");
	} catch (error) {
		return inspect(`The retained coordinator cannot be proved current: ${errorMessage(error)}`);
	}
}

/**
 * Whether a classification says the retained coordinator can still be driven: an executable link
 * to the same Archboard-created thread on the same child and epoch, with a live proof.
 * @param link - The classified link.
 * @param proof - The classification's proof, or null when it has none.
 * @param candidate - The retained coordinator.
 * @returns True when the coordinator may be reused.
 */
function classificationAllowsReuse(
	link: ThreadLinkClassification["link"],
	proof: ThreadLinkClassification["proof"],
	candidate: CoordinatorPersistedState,
): boolean {
	const checks = [
		link.state === "executable",
		link.source === CODEX_SESSION_THREAD_SOURCE,
		link.threadId === candidate.threadId,
		link.childId === candidate.childId,
		link.epoch === candidate.epoch,
		link.canAcceptDirectInput,
		proof !== null,
	];
	return checks.every((matched) => matched);
}

/**
 * Classify the retained coordinator's thread as it is now, and decide from that whether it can be
 * reused, must be replaced, or can only be inspected.
 * @param candidate - The retained coordinator.
 * @param record - Its durable record.
 * @param options - The coordinator options carrying the thread-link classifier.
 * @returns The decision.
 */
async function classifyCandidate(
	candidate: CoordinatorPersistedState,
	record: CoordinatorEpochRecord,
	options: CodexCoordinatorOptions,
): Promise<CandidateDecision> {
	try {
		const classification = await options.threadLink.classify({
			threadId: candidate.threadId,
			childId: candidate.childId,
			epoch: candidate.epoch,
			operationId: candidate.operationId,
			provenance: record,
		});
		if (classificationAllowsReuse(classification.link, classification.proof, candidate)) {
			return { kind: "reuse", persistence: candidate };
		}
		return {
			kind: "replace",
			threadId: candidate.threadId,
			reason:
				classification.link.state === "inspect_only"
					? `The retained coordinator is inspect-only (${classification.link.reason}).`
					: "The retained coordinator is not controllable in the current epoch.",
		};
	} catch (error) {
		return {
			kind: "inspect",
			threadId: candidate.threadId,
			operationId: candidate.operationId,
			reason: `The retained coordinator could not be classified: ${errorMessage(error)}`,
		};
	}
}

/**
 * Decide what to do with the coordinator the workbench retained: reuse it, replace it, or leave
 * its thread inspect-only. Reuse is the narrow case — the retained state, the durable record, the
 * live epoch proof and a fresh classification must all agree — because a coordinator that cannot
 * be proven is one Archboard must not drive.
 * @param candidate - The retained coordinator, or null when nothing was retained.
 * @param configured - The settings the coordinator must have been given.
 * @param reviewed - The reviewed instruction and manifest hashes.
 * @param epochSnapshot - The current durable epoch.
 * @param options - The coordinator options.
 * @returns The decision.
 */
async function decideCandidate(
	candidate: CoordinatorPersistedState | null,
	configured: CoordinatorConfiguredSettings,
	reviewed: CoordinatorReviewHashes,
	epochSnapshot: CoordinatorEpochSnapshot,
	options: CodexCoordinatorOptions,
): Promise<CandidateDecision> {
	const currentEpoch = epochSnapshot.manifest.activeEpoch;
	if (currentEpoch === null) {
		return inspectDecision(candidate, "The coordinator has no active epoch to own.");
	}
	const currentRecords = coordinatorRecords(
		epochSnapshot,
		currentEpoch.childId,
		currentEpoch.epoch,
	);
	const uncertain = uncertainTransactionDecision(currentRecords);
	if (uncertain !== null) {
		return uncertain;
	}
	if (candidate === null) {
		return noCandidateDecision(currentRecords);
	}
	if (
		candidate.childId !== options.identity.validator.childId ||
		candidate.epoch !== options.identity.validator.epoch
	) {
		return {
			kind: "replace",
			threadId: candidate.threadId,
			reason: "The retained coordinator belongs to a stale child epoch.",
		};
	}
	return decideRetainedCandidate(candidate, currentRecords, configured, reviewed, options);
}

/**
 * Decide about a retained coordinator that belongs to the current child epoch: its durable
 * record, its retained evidence, its live proof, and finally its classification.
 * @param candidate - The retained coordinator.
 * @param currentRecords - The coordinator records in the current epoch.
 * @param configured - The settings the coordinator must have been given.
 * @param reviewed - The reviewed instruction and manifest hashes.
 * @param options - The coordinator options.
 * @returns The decision.
 */
async function decideRetainedCandidate(
	candidate: CoordinatorPersistedState,
	currentRecords: readonly CoordinatorEpochRecord[],
	configured: CoordinatorConfiguredSettings,
	reviewed: CoordinatorReviewHashes,
	options: CodexCoordinatorOptions,
): Promise<CandidateDecision> {
	const check = candidateRecordCheck(candidate, currentRecords);
	if (!check.ok) {
		return check.decision;
	}
	let mismatch: string | null;
	try {
		mismatch = persistenceMismatch(candidate, check.record, configured, reviewed, options);
	} catch (error) {
		return {
			kind: "inspect",
			threadId: candidate.threadId,
			operationId: candidate.operationId,
			reason: `The retained coordinator evidence is malformed: ${errorMessage(error)}`,
		};
	}
	if (mismatch !== null) {
		return { kind: "replace", threadId: candidate.threadId, reason: mismatch };
	}
	const proofDecision = currentProofDecision(candidate, reviewed, options);
	if (proofDecision !== null) {
		return proofDecision;
	}
	return classifyCandidate(candidate, check.record, options);
}

/**
 * Every durable coordinator record for one child epoch, which is the evidence a reuse decision is
 * made from.
 * @param snapshot - The epoch snapshot.
 * @param childId - The Codex child.
 * @param epoch - That child's epoch.
 * @returns The matching records.
 */
function coordinatorRecords(
	snapshot: CoordinatorEpochSnapshot,
	childId: ChildId,
	epoch: ChildEpoch,
): readonly CoordinatorEpochRecord[] {
	return snapshot.manifest.records.filter(
		(record) =>
			record.correlation.childId === childId &&
			record.correlation.epoch === epoch &&
			record.operation.kind === COORDINATOR_OPERATION_KIND &&
			record.operation.rpc === COORDINATOR_RPC,
	);
}

/**
 * Whether the retained settings are still the reviewed ones. The comparison is against what the
 * retained coordinator was actually given, not against the reviewed constants: the service tier is
 * advertised per account and can be withdrawn, and the model and effort are evidence of what a
 * coordinator started under, which a constant bump leaves behind.
 * @param persistence - The retained coordinator.
 * @param configured - The settings the coordinator must have been given.
 * @param reviewed - The reviewed hashes.
 * @returns Why the settings no longer match, or null when they do.
 */
function settingsMismatchReason(
	persistence: CoordinatorPersistedState,
	configured: CoordinatorConfiguredSettings,
	reviewed: CoordinatorReviewHashes,
): string | null {
	// Both sides are typed from the reviewed constants, so the compiler reads these two
	// comparisons as redundant. They are not: the left side is retained evidence of what a
	// coordinator was actually started under, which a constant bump leaves behind.
	// oxlint-disable-next-line typescript/no-unnecessary-condition -- retained evidence, not a constant
	if (persistence.settings.configured.model !== configured.model) {
		return "The retained coordinator model does not match the reviewed model.";
	}
	// oxlint-disable-next-line typescript/no-unnecessary-condition -- retained evidence, not a constant
	if (persistence.settings.configured.effort !== configured.effort) {
		return "The retained coordinator effort does not match the reviewed effort.";
	}
	if (persistence.settings.configured.serviceTier !== configured.serviceTier) {
		return "The retained coordinator service-tier choice is no longer advertised.";
	}
	return reviewMismatchReason(persistence, reviewed);
}

/**
 * Whether the retained review hashes are still the reviewed ones.
 * @param persistence - The retained coordinator.
 * @param reviewed - The reviewed hashes.
 * @returns Why they no longer match, or null when they do.
 */
function reviewMismatchReason(
	persistence: CoordinatorPersistedState,
	reviewed: CoordinatorReviewHashes,
): string | null {
	if (persistence.review.instructionHash !== reviewed.instructionHash) {
		return "The retained coordinator instruction hash drifted.";
	}
	if (persistence.review.catalogueHash !== reviewed.catalogueHash) {
		return "The retained coordinator catalogue hash drifted.";
	}
	if (
		persistence.review.workhorseCatalogueHash !== reviewed.workhorseCatalogueHash ||
		persistence.review.voiceCatalogueHash !== reviewed.voiceCatalogueHash
	) {
		return "The retained coordinator tool-manifest hash drifted.";
	}
	if (persistence.review.settingsHash !== hashCoordinatorSettings(persistence.settings)) {
		return "The retained coordinator settings hash is not self-consistent.";
	}
	return null;
}

/**
 * Whether the settings Codex actually applied are the reviewed selection.
 * @param persistence - The retained coordinator.
 * @param configured - The settings the coordinator must have been given.
 * @returns True when the effective settings match.
 */
function effectiveSettingsMatch(
	persistence: CoordinatorPersistedState,
	configured: CoordinatorConfiguredSettings,
): boolean {
	const effective = persistence.settings.effective;
	const checks = [
		effective.model === COORDINATOR_MODEL,
		effective.effort === "medium",
		configured.serviceTier !== "priority" || effective.serviceTier === "priority",
	];
	return checks.every((matched) => matched);
}

/**
 * Whether the durable record is matching ownership evidence for the retained coordinator: the
 * same operation, on the same child, epoch, thread and checkout, confirmed, and authored from the
 * reviewed instructions and manifest.
 * @param persistence - The retained coordinator.
 * @param record - Its durable record.
 * @param reviewed - The reviewed hashes.
 * @param options - The coordinator options carrying the checkout root.
 * @returns True when the record proves ownership.
 */
function recordProvesOwnership(
	persistence: CoordinatorPersistedState,
	record: CoordinatorEpochRecord,
	reviewed: CoordinatorReviewHashes,
	options: CodexCoordinatorOptions,
): boolean {
	const checks = [
		record.operation.id === persistence.operationId,
		record.operation.kind === COORDINATOR_OPERATION_KIND,
		record.operation.rpc === COORDINATOR_RPC,
		record.correlation.childId === persistence.childId,
		record.correlation.epoch === persistence.epoch,
		record.provenance.childId === persistence.childId,
		record.provenance.epoch === persistence.epoch,
		record.provenance.threadId === persistence.threadId,
		record.provenance.threadSource === CODEX_SESSION_THREAD_SOURCE,
		record.provenance.confirmedAtMs !== null,
		record.provenance.workspaceRoot === options.checkoutRoot,
		record.provenance.instructionHash === reviewed.instructionHash,
		record.provenance.manifestHash === reviewed.catalogueHash,
	];
	return checks.every((matched) => matched);
}

/**
 * Why the retained coordinator cannot be reused as it stands: its settings drifted from the
 * reviewed ones, or its durable record does not prove Archboard owns the thread.
 * @param persistence - The retained coordinator.
 * @param record - Its durable record.
 * @param configured - The settings the coordinator must have been given.
 * @param reviewed - The reviewed hashes.
 * @param options - The coordinator options.
 * @returns The reason to replace it, or null when it still matches.
 */
function persistenceMismatch(
	persistence: CoordinatorPersistedState,
	record: CoordinatorEpochRecord,
	configured: CoordinatorConfiguredSettings,
	reviewed: CoordinatorReviewHashes,
	options: CodexCoordinatorOptions,
): string | null {
	const settings = settingsMismatchReason(persistence, configured, reviewed);
	if (settings !== null) {
		return settings;
	}
	if (!effectiveSettingsMatch(persistence, configured)) {
		return "The retained coordinator effective settings do not match the reviewed selection.";
	}
	return recordProvesOwnership(persistence, record, reviewed, options)
		? null
		: "The retained coordinator lacks matching durable ownership evidence.";
}

/**
 * The inspect decision for a candidate that cannot be reused, naming whatever thread and
 * operation were retained so a person can go and look at them.
 * @param candidate - The retained coordinator, or null.
 * @param reason - Why it cannot be reused.
 * @returns The decision.
 */
function inspectDecision(
	candidate: CoordinatorPersistedState | null,
	reason: string,
): CandidateDecision {
	return {
		kind: "inspect",
		threadId: candidate?.threadId ?? null,
		operationId: candidate?.operationId ?? null,
		reason,
	};
}

export {
	COORDINATOR_OPERATION_KIND,
	COORDINATOR_RPC,
	type CandidateDecision,
	assertCurrentEpoch,
	decideCandidate,
};
