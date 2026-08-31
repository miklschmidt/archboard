import type {
	ChildEpoch,
	ChildId,
	OperationId,
	ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	EpochConfirmation,
	EpochOperationRecord,
	EpochTransaction,
} from "../../codex-epoch/index.js";
import type { ThreadLinkBindingSnapshot } from "../../codex-thread-link/index.js";
import {
	WORKHORSE_CLEANUP_OPERATION_KIND,
	WORKHORSE_CLEANUP_RPC,
	WORKHORSE_INSTRUCTION_HASH,
	WORKHORSE_MANIFEST_HASH,
	WORKHORSE_THREAD_SOURCE,
} from "./model.js";
import type {
	CodexWorkhorseStartOptions,
	WorkhorseCleanupFacts,
	WorkhorseSnapshot,
	WorkhorseStartInput,
	WorkhorseStartTransaction,
} from "./contract.js";
import { cleanupFacts, errorMessage, inspectSnapshot, mutationOutcome } from "./state.js";
import {
	isCommittedCleanupRecord,
	isExactIdleWorkhorseRoot,
	type ValidatedWorkhorseStart,
} from "./validation.js";

export async function compensateAfterBindFailure(
	options: CodexWorkhorseStartOptions,
	input: WorkhorseStartInput,
	childId: ChildId,
	epoch: ChildEpoch,
	operationId: OperationId,
	started: ValidatedWorkhorseStart,
	binding: ThreadLinkBindingSnapshot | null,
	failureReason: string,
): Promise<WorkhorseSnapshot> {
	let readResponse;
	try {
		readResponse = await options.session.threadRead({
			threadId: started.threadId,
			includeTurns: true,
		});
	} catch (error) {
		return inspectAfterBindFailure(
			input,
			childId,
			epoch,
			operationId,
			started,
			binding,
			`${failureReason} Cleanup was not attempted because the exact thread could not be reread: ${errorMessage(error)}`,
			null,
		);
	}

	let exactIdleRoot: boolean;
	try {
		exactIdleRoot = isExactIdleWorkhorseRoot(readResponse.thread, started);
	} catch (error) {
		return inspectAfterBindFailure(
			input,
			childId,
			epoch,
			operationId,
			started,
			binding,
			`${failureReason} Cleanup was refused because the thread reread was invalid: ${errorMessage(error)}`,
			null,
		);
	}
	if (!exactIdleRoot) {
		return inspectAfterBindFailure(
			input,
			childId,
			epoch,
			operationId,
			started,
			binding,
			`${failureReason} Cleanup was refused because the reread was not the exact new idle root.`,
			null,
		);
	}

	const cleanupOperationId = options.operation.issuer.mintOperationId();
	try {
		options.operation.validator.assertCurrentOperationId(cleanupOperationId);
	} catch (error) {
		return inspectAfterBindFailure(
			input,
			childId,
			epoch,
			operationId,
			started,
			binding,
			`${failureReason} Cleanup could not issue a current operation identity: ${errorMessage(error)}`,
			null,
		);
	}

	let cleanupTransaction: WorkhorseStartTransaction;
	try {
		const epochSnapshot = options.epoch.snapshot();
		cleanupTransaction = options.epoch.stageOperation({
			childId,
			epoch,
			operationId: cleanupOperationId,
			kind: WORKHORSE_CLEANUP_OPERATION_KIND,
			rpc: WORKHORSE_CLEANUP_RPC,
			workspaceRoot: options.checkoutRoot,
			instructionHash: WORKHORSE_INSTRUCTION_HASH,
			manifestHash: WORKHORSE_MANIFEST_HASH,
			expected: epochSnapshot.cas,
		});
		assertTransaction(
			cleanupTransaction,
			childId,
			epoch,
			cleanupOperationId,
			WORKHORSE_CLEANUP_OPERATION_KIND,
			WORKHORSE_CLEANUP_RPC,
		);
	} catch (error) {
		const cleanup = cleanupFacts(
			cleanupOperationId,
			started.threadId,
			"not_delivered",
			`Cleanup transaction was not staged: ${errorMessage(error)}`,
		);
		return inspectAfterBindFailure(
			input,
			childId,
			epoch,
			operationId,
			started,
			binding,
			`${failureReason} Cleanup was not attempted because its transaction could not be staged.`,
			cleanup,
		);
	}

	try {
		await options.session.threadDelete({ threadId: started.threadId });
	} catch (error) {
		const outcome = mutationOutcome(error);
		if (outcome === "not_delivered") {
			const rolledBack = rollback(
				options,
				cleanupTransaction,
				"The workhorse cleanup delete was not delivered.",
			);
			if (!rolledBack) {
				markUnknown(
					options,
					cleanupTransaction,
					"The workhorse cleanup delete was not delivered, but rollback durability is unknown.",
					started.threadId,
				);
			}
			const cleanup = cleanupFacts(
				cleanupOperationId,
				started.threadId,
				rolledBack ? outcome : "outcome_unknown",
				rolledBack
					? "The exact idle workhorse was not deleted; the cleanup transaction was rolled back."
					: "The exact idle workhorse was not deleted, but cleanup rollback durability is unknown.",
			);
			return inspectAfterBindFailure(
				input,
				childId,
				epoch,
				operationId,
				started,
				binding,
				`${failureReason} Cleanup delete was not delivered; inspect the exact thread.`,
				cleanup,
			);
		}
		const cleanup = cleanupFacts(
			cleanupOperationId,
			started.threadId,
			outcome,
			"The workhorse cleanup delete outcome is unknown; it was not retried.",
		);
		markUnknown(
			options,
			cleanupTransaction,
			"The workhorse cleanup delete outcome is unknown.",
			started.threadId,
		);
		return inspectAfterBindFailure(
			input,
			childId,
			epoch,
			operationId,
			started,
			binding,
			`${failureReason} Cleanup delete outcome is unknown; inspect the exact thread.`,
			cleanup,
		);
	}

	let committedCleanup: EpochOperationRecord;
	try {
		committedCleanup = options.epoch.commitOperation(cleanupTransaction, {
			threadId: started.threadId,
			threadSource: WORKHORSE_THREAD_SOURCE,
		});
	} catch (error) {
		markUnknown(
			options,
			cleanupTransaction,
			"The workhorse cleanup delete was delivered but its durable settlement is unknown.",
			started.threadId,
		);
		const cleanup = cleanupFacts(
			cleanupOperationId,
			started.threadId,
			"outcome_unknown",
			`Cleanup settlement is unknown: ${errorMessage(error)}`,
		);
		return inspectAfterBindFailure(
			input,
			childId,
			epoch,
			operationId,
			started,
			binding,
			`${failureReason} Cleanup was delivered but durable settlement is unknown.`,
			cleanup,
		);
	}
	if (
		!isCommittedCleanupRecord(
			committedCleanup,
			childId,
			epoch,
			cleanupOperationId,
			started.threadId,
			options.checkoutRoot,
		)
	) {
		const cleanup = cleanupFacts(
			cleanupOperationId,
			started.threadId,
			"outcome_unknown",
			"Cleanup returned a non-canonical durable settlement.",
		);
		return inspectAfterBindFailure(
			input,
			childId,
			epoch,
			operationId,
			started,
			binding,
			`${failureReason} Cleanup settlement was not canonical; inspect the exact thread.`,
			cleanup,
		);
	}
	const cleanup = cleanupFacts(cleanupOperationId, started.threadId, "delivered", null);
	return inspectAfterBindFailure(
		input,
		childId,
		epoch,
		operationId,
		started,
		binding,
		`${failureReason} The exact new idle root was deleted; the pane remains inspect-only.`,
		cleanup,
	);
}

function inspectAfterBindFailure(
	input: WorkhorseStartInput,
	childId: ChildId,
	epoch: ChildEpoch,
	operationId: OperationId,
	started: ValidatedWorkhorseStart,
	binding: ThreadLinkBindingSnapshot | null,
	reason: string,
	cleanup: WorkhorseCleanupFacts | null,
): WorkhorseSnapshot {
	return inspectSnapshot({
		paneId: input.paneId,
		childId,
		epoch,
		threadId: started.threadId,
		operationId,
		outcome: "delivered",
		start: started.facts,
		binding,
		cleanup,
		reason,
	});
}

function assertTransaction(
	transaction: EpochTransaction,
	childId: ChildId,
	epoch: ChildEpoch,
	operationId: OperationId,
	kind: string,
	rpc: string,
): void {
	const record = transaction.record;
	if (
		record.correlation.childId !== childId ||
		record.correlation.epoch !== epoch ||
		record.correlation.operationId !== operationId ||
		record.operation.id !== operationId ||
		record.operation.kind !== kind ||
		record.operation.rpc !== rpc ||
		record.status !== "staged" ||
		record.outcome !== "pending"
	) {
		throw new Error("the epoch store returned a non-canonical staged transaction");
	}
}

function rollback(
	options: CodexWorkhorseStartOptions,
	transaction: WorkhorseStartTransaction,
	reason: string,
): boolean {
	try {
		options.epoch.rollbackOperation(transaction, reason);
		return true;
	} catch {
		return false;
	}
}

function markUnknown(
	options: CodexWorkhorseStartOptions,
	transaction: WorkhorseStartTransaction,
	reason: string,
	threadId: ThreadId | null,
): boolean {
	try {
		const confirmation: EpochConfirmation | undefined =
			threadId === null ? undefined : { threadId, threadSource: WORKHORSE_THREAD_SOURCE };
		options.epoch.markOutcomeUnknown(transaction, reason, confirmation);
		return true;
	} catch {
		return false;
	}
}
