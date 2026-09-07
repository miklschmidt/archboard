import type { EpochOperationRecord } from "@/runtime/codex-epoch";
import type { ExecutableThreadLink, ThreadLinkClassification } from "@/runtime/codex-thread-link";
import type { WorkhorseOperationTarget } from "@/runtime/codex-workhorse-operations/lib/contract";
import {
	mapLinkReason,
	operationError,
} from "@/runtime/codex-workhorse-operations/lib/operation-errors";

const WORKHORSE_CREATION_KIND = "create_thread";
const WORKHORSE_THREAD_SOURCE = "archboard";

/**
 * Check that a durable record's correlation names the target's child, epoch and operation.
 * @param record - The committed epoch record.
 * @param target - The operation target.
 * @returns Whether the correlation matches.
 */
function correlationMatchesTarget(
	record: EpochOperationRecord,
	target: WorkhorseOperationTarget,
): boolean {
	return (
		record.correlation.childId === target.childId &&
		record.correlation.epoch === target.epoch &&
		record.correlation.operationId === target.operationId
	);
}

/**
 * Check that a durable record's provenance names the target's thread under the same ownership
 * and carries a confirmed thread source.
 * @param record - The committed epoch record.
 * @param target - The operation target.
 * @returns Whether the provenance matches.
 */
function provenanceMatchesTarget(
	record: EpochOperationRecord,
	target: WorkhorseOperationTarget,
): boolean {
	return (
		record.provenance.childId === target.childId &&
		record.provenance.epoch === target.epoch &&
		record.provenance.threadId === target.threadId &&
		record.provenance.threadSource !== null
	);
}

/**
 * Check that a durable record proves ownership of exactly the operation target.
 * @param record - The committed epoch record.
 * @param target - The operation target.
 * @returns Whether both correlation and provenance match.
 */
function recordMatchesTarget(
	record: EpochOperationRecord,
	target: WorkhorseOperationTarget,
): boolean {
	return correlationMatchesTarget(record, target) && provenanceMatchesTarget(record, target);
}

/**
 * Check that an executable link still names the captured target.
 * @param link - The executable link from the classifier.
 * @param target - The operation target.
 * @returns Whether child, epoch and thread agree.
 */
function linkMatchesTarget(link: ExecutableThreadLink, target: WorkhorseOperationTarget): boolean {
	return (
		link.childId === target.childId &&
		link.epoch === target.epoch &&
		link.threadId === target.threadId
	);
}

/**
 * Check that the classification carries a committed, delivered proof for the target.
 * @param classification - The classified link.
 * @param target - The operation target.
 * @returns Whether the proof is present and canonical for the target.
 */
function proofMatchesTarget(
	classification: ThreadLinkClassification,
	target: WorkhorseOperationTarget,
): boolean {
	const proof = classification.proof;
	return (
		proof !== null &&
		recordMatchesTarget(proof.record, target) &&
		proof.record.status === "committed" &&
		proof.record.outcome === "delivered"
	);
}

/**
 * Refuse any link that is not executable for the exact target with current durable proof.
 * Mutations run only against a link the classifier and the epoch store both vouch for.
 * @param classification - The classified link.
 * @param target - The operation target the link must match.
 * @param label - How the link is named in the refusal.
 */
function assertExecutableClassification(
	classification: ThreadLinkClassification,
	target: WorkhorseOperationTarget,
	label: string,
): void {
	const link = classification.link;
	if (link.state !== "executable") {
		const reason = link.reason;
		throw operationError(
			mapLinkReason(reason),
			`${label} is inspect-only: ${reason}. Re-read the current linked state before retrying.`,
		);
	}
	if (!linkMatchesTarget(link, target) || !proofMatchesTarget(classification, target)) {
		throw operationError(
			"unknown_provenance",
			`${label} lost its current executable provenance; inspect the link before retrying.`,
		);
	}
}

/**
 * Recognise the workhorse this host created, the only thread whose queue it may touch.
 * @param classification - The classified workhorse link.
 * @returns Whether the link is executable, app-server sourced and proven by a creation record.
 */
function isCreatedWorkhorse(classification: ThreadLinkClassification): boolean {
	return (
		classification.link.state === "executable" &&
		classification.link.source === "appServer" &&
		classification.proof?.record.operation.kind === WORKHORSE_CREATION_KIND &&
		classification.proof.record.provenance.threadSource === WORKHORSE_THREAD_SOURCE
	);
}

/**
 * Refuse queue access to any thread other than the created, proven workhorse.
 * @param classification - The classified workhorse link.
 */
function assertCreatedWorkhorse(classification: ThreadLinkClassification): void {
	if (!isCreatedWorkhorse(classification)) {
		throw operationError(
			"unknown_provenance",
			"Queue access is restricted to the created Archboard workhorse with proven ownership.",
		);
	}
}

export {
	WORKHORSE_CREATION_KIND,
	WORKHORSE_THREAD_SOURCE,
	recordMatchesTarget,
	assertExecutableClassification,
	assertCreatedWorkhorse,
	isCreatedWorkhorse,
};
