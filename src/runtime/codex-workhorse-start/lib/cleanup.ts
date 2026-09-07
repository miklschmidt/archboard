import type { ChildEpoch, ChildId, OperationId, ThreadId } from "@/shared/codex-workbench-identity";
import type {
	EpochConfirmation,
	EpochOperationRecord,
	EpochTransaction,
} from "@/runtime/codex-epoch";
import type { ThreadLinkBindingSnapshot } from "@/runtime/codex-thread-link";
import {
	WORKHORSE_CLEANUP_OPERATION_KIND,
	WORKHORSE_CLEANUP_RPC,
	WORKHORSE_INSTRUCTION_HASH,
	WORKHORSE_MANIFEST_HASH,
	WORKHORSE_THREAD_SOURCE,
} from "@/runtime/codex-workhorse-start/lib/model";
import type {
	CodexWorkhorseStartOptions,
	WorkhorseCleanupFacts,
	WorkhorseSnapshot,
	WorkhorseStartInput,
	WorkhorseStartTransaction,
} from "@/runtime/codex-workhorse-start/lib/contract";
import {
	cleanupFacts,
	errorMessage,
	inspectSnapshot,
	mutationOutcome,
} from "@/runtime/codex-workhorse-start/lib/state";
import {
	isCommittedCleanupRecord,
	isExactIdleWorkhorseRoot,
	type ValidatedWorkhorseStart,
} from "@/runtime/codex-workhorse-start/lib/validation";

/** Everything one compensation runs against, fixed before the first step. */
interface CleanupContext {
	readonly options: CodexWorkhorseStartOptions;
	readonly input: WorkhorseStartInput;
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly operationId: OperationId;
	readonly started: ValidatedWorkhorseStart;
	readonly binding: ThreadLinkBindingSnapshot | null;
	/** Why the workhorse could not be bound, which every outcome message begins with. */
	readonly failureReason: string;
}

/**
 * The pane's snapshot after a failed bind: the thread exists and its start was delivered, so it
 * stays inspect-only whatever the cleanup did, with the cleanup's own outcome recorded beside it.
 * @param context - The compensation context.
 * @param reason - What happened, appended to the bind failure.
 * @param cleanup - What the cleanup proved, or null when none was attempted.
 * @returns The inspect-only snapshot.
 */
function inspectAfterBindFailure(
	context: CleanupContext,
	reason: string,
	cleanup: WorkhorseCleanupFacts | null,
): WorkhorseSnapshot {
	return inspectSnapshot({
		paneId: context.input.paneId,
		childId: context.childId,
		epoch: context.epoch,
		threadId: context.started.threadId,
		operationId: context.operationId,
		outcome: "delivered",
		start: context.started.facts,
		binding: context.binding,
		cleanup,
		reason,
	});
}

/**
 * Reread the thread and decide whether deleting it is permitted. Deletion is only ever allowed
 * for the exact new idle root this start created; anything else, including a reread that fails,
 * leaves the thread in place.
 * @param context - The compensation context.
 * @returns The snapshot that stops the cleanup, or null when deletion may go ahead.
 */
async function refusalBeforeCleanup(context: CleanupContext): Promise<WorkhorseSnapshot | null> {
	const { started } = context;
	let readResponse;
	try {
		readResponse = await context.options.session.threadRead({
			threadId: started.threadId,
			includeTurns: true,
		});
	} catch (error) {
		return inspectAfterBindFailure(
			context,
			`${context.failureReason} Cleanup was not attempted because the exact thread could not be reread: ${errorMessage(error)}`,
			null,
		);
	}
	let exactIdleRoot: boolean;
	try {
		exactIdleRoot = isExactIdleWorkhorseRoot(readResponse.thread, started);
	} catch (error) {
		return inspectAfterBindFailure(
			context,
			`${context.failureReason} Cleanup was refused because the thread reread was invalid: ${errorMessage(error)}`,
			null,
		);
	}
	return exactIdleRoot
		? null
		: inspectAfterBindFailure(
				context,
				`${context.failureReason} Cleanup was refused because the reread was not the exact new idle root.`,
				null,
			);
}

/** One cleanup operation, staged durably and ready to delete. */
interface StagedCleanupOperation {
	readonly operationId: OperationId;
	readonly transaction: WorkhorseStartTransaction;
}

/** A staged cleanup operation, or the snapshot that stopped it from being staged. */
type StagedCleanup = StagedCleanupOperation | { readonly snapshot: WorkhorseSnapshot };

/**
 * Issue the cleanup's own operation identity and stage it durably, so a delete is never sent
 * without a durable record of the attempt.
 * @param context - The compensation context.
 * @returns The staged cleanup, or the snapshot that stops it.
 */
function stageCleanup(context: CleanupContext): StagedCleanup {
	const { options, started } = context;
	const cleanupOperationId = options.operation.issuer.mintOperationId();
	try {
		options.operation.validator.assertCurrentOperationId(cleanupOperationId);
	} catch (error) {
		return {
			snapshot: inspectAfterBindFailure(
				context,
				`${context.failureReason} Cleanup could not issue a current operation identity: ${errorMessage(error)}`,
				null,
			),
		};
	}
	try {
		const epochSnapshot = options.epoch.snapshot();
		const transaction = options.epoch.stageOperation({
			childId: context.childId,
			epoch: context.epoch,
			operationId: cleanupOperationId,
			kind: WORKHORSE_CLEANUP_OPERATION_KIND,
			rpc: WORKHORSE_CLEANUP_RPC,
			workspaceRoot: options.checkoutRoot,
			instructionHash: WORKHORSE_INSTRUCTION_HASH,
			manifestHash: WORKHORSE_MANIFEST_HASH,
			expected: epochSnapshot.cas,
		});
		assertTransaction(
			transaction,
			context.childId,
			context.epoch,
			cleanupOperationId,
			WORKHORSE_CLEANUP_OPERATION_KIND,
			WORKHORSE_CLEANUP_RPC,
		);
		return { operationId: cleanupOperationId, transaction };
	} catch (error) {
		return {
			snapshot: inspectAfterBindFailure(
				context,
				`${context.failureReason} Cleanup was not attempted because its transaction could not be staged.`,
				cleanupFacts(
					cleanupOperationId,
					started.threadId,
					"not_delivered",
					`Cleanup transaction was not staged: ${errorMessage(error)}`,
				),
			),
		};
	}
}

/**
 * Settle a delete the session proved was never sent: the staged cleanup is rolled back, and only
 * a rollback that cannot be made durable leaves the cleanup's own outcome unknown.
 * @param context - The compensation context.
 * @param staged - The staged cleanup operation.
 * @returns The inspect-only snapshot.
 */
function settleUndeliveredDelete(
	context: CleanupContext,
	staged: StagedCleanupOperation,
): WorkhorseSnapshot {
	const { options, started } = context;
	const rolledBack = rollback(
		options,
		staged.transaction,
		"The workhorse cleanup delete was not delivered.",
	);
	if (!rolledBack) {
		markUnknown(
			options,
			staged.transaction,
			"The workhorse cleanup delete was not delivered, but rollback durability is unknown.",
			started.threadId,
		);
	}
	return inspectAfterBindFailure(
		context,
		`${context.failureReason} Cleanup delete was not delivered; inspect the exact thread.`,
		cleanupFacts(
			staged.operationId,
			started.threadId,
			rolledBack ? "not_delivered" : "outcome_unknown",
			rolledBack
				? "The exact idle workhorse was not deleted; the cleanup transaction was rolled back."
				: "The exact idle workhorse was not deleted, but cleanup rollback durability is unknown.",
		),
	);
}

/**
 * Settle a delete whose outcome the session could not decide. The thread may be gone, so nothing
 * is retried and the pane is told to inspect it.
 * @param context - The compensation context.
 * @param staged - The staged cleanup operation.
 * @param outcome - The outcome the session asserted.
 * @returns The inspect-only snapshot.
 */
function settleUnknownDelete(
	context: CleanupContext,
	staged: StagedCleanupOperation,
	outcome: "not_delivered" | "outcome_unknown",
): WorkhorseSnapshot {
	markUnknown(
		context.options,
		staged.transaction,
		"The workhorse cleanup delete outcome is unknown.",
		context.started.threadId,
	);
	return inspectAfterBindFailure(
		context,
		`${context.failureReason} Cleanup delete outcome is unknown; inspect the exact thread.`,
		cleanupFacts(
			staged.operationId,
			context.started.threadId,
			outcome,
			"The workhorse cleanup delete outcome is unknown; it was not retried.",
		),
	);
}

/**
 * Commit the delivered delete durably and prove the committed record says what it should. A
 * settlement that cannot be proven leaves the cleanup unknown even though the delete succeeded.
 * @param context - The compensation context.
 * @param staged - The staged cleanup operation.
 * @returns The inspect-only snapshot.
 */
function settleCommittedDelete(
	context: CleanupContext,
	staged: StagedCleanupOperation,
): WorkhorseSnapshot {
	const { options, started } = context;
	let committedCleanup: EpochOperationRecord;
	try {
		committedCleanup = options.epoch.commitOperation(staged.transaction, {
			threadId: started.threadId,
			threadSource: WORKHORSE_THREAD_SOURCE,
		});
	} catch (error) {
		markUnknown(
			options,
			staged.transaction,
			"The workhorse cleanup delete was delivered but its durable settlement is unknown.",
			started.threadId,
		);
		return inspectAfterBindFailure(
			context,
			`${context.failureReason} Cleanup was delivered but durable settlement is unknown.`,
			cleanupFacts(
				staged.operationId,
				started.threadId,
				"outcome_unknown",
				`Cleanup settlement is unknown: ${errorMessage(error)}`,
			),
		);
	}
	const canonical = isCommittedCleanupRecord(
		committedCleanup,
		context.childId,
		context.epoch,
		staged.operationId,
		started.threadId,
		options.checkoutRoot,
	);
	if (!canonical) {
		return inspectAfterBindFailure(
			context,
			`${context.failureReason} Cleanup settlement was not canonical; inspect the exact thread.`,
			cleanupFacts(
				staged.operationId,
				started.threadId,
				"outcome_unknown",
				"Cleanup returned a non-canonical durable settlement.",
			),
		);
	}
	return inspectAfterBindFailure(
		context,
		`${context.failureReason} The exact new idle root was deleted; the pane remains inspect-only.`,
		cleanupFacts(staged.operationId, started.threadId, "delivered", null),
	);
}

/**
 * Delete the exact new idle root under its staged cleanup operation and settle whatever happened.
 * @param context - The compensation context.
 * @param staged - The staged cleanup operation.
 * @returns The inspect-only snapshot.
 */
async function deleteExactIdleRoot(
	context: CleanupContext,
	staged: StagedCleanupOperation,
): Promise<WorkhorseSnapshot> {
	try {
		await context.options.session.threadDelete({ threadId: context.started.threadId });
	} catch (error) {
		const outcome = mutationOutcome(error);
		return outcome === "not_delivered"
			? settleUndeliveredDelete(context, staged)
			: settleUnknownDelete(context, staged, outcome);
	}
	return settleCommittedDelete(context, staged);
}

/**
 * Compensate for a workhorse that was created but could not be bound to its pane. The thread
 * already exists, so the pane is left inspect-only either way; the only question this answers is
 * whether the exact new idle root could be deleted, and what it can prove about that.
 * @param options - The session, epoch store and operation authorities.
 * @param input - The pane the start was for.
 * @param childId - The Codex child the workhorse runs on.
 * @param epoch - That child's epoch.
 * @param operationId - The start operation identity.
 * @param started - What the start proved about the thread.
 * @param binding - The binding that was attempted, when there was one.
 * @param failureReason - Why the bind failed.
 * @returns The inspect-only snapshot the pane is left with.
 */
async function compensateAfterBindFailure(
	options: CodexWorkhorseStartOptions,
	input: WorkhorseStartInput,
	childId: ChildId,
	epoch: ChildEpoch,
	operationId: OperationId,
	started: ValidatedWorkhorseStart,
	binding: ThreadLinkBindingSnapshot | null,
	failureReason: string,
): Promise<WorkhorseSnapshot> {
	const context: CleanupContext = {
		options,
		input,
		childId,
		epoch,
		operationId,
		started,
		binding,
		failureReason,
	};
	const refusal = await refusalBeforeCleanup(context);
	if (refusal !== null) {
		return refusal;
	}
	const staged = stageCleanup(context);
	if ("snapshot" in staged) {
		return staged.snapshot;
	}
	return deleteExactIdleRoot(context, staged);
}

/**
 * Prove the epoch store staged exactly the cleanup that was asked for.
 * @param transaction - The staged transaction.
 * @param childId - The Codex child the cleanup runs on.
 * @param epoch - That child's epoch.
 * @param operationId - The cleanup operation identity.
 * @param kind - The operation kind the record must name.
 * @param rpc - The wire RPC the record must name.
 * @throws {Error} When the staged record does not match.
 */
function assertTransaction(
	transaction: EpochTransaction,
	childId: ChildId,
	epoch: ChildEpoch,
	operationId: OperationId,
	kind: string,
	rpc: string,
): void {
	const record = transaction.record;
	const checks = [
		record.correlation.childId === childId,
		record.correlation.epoch === epoch,
		record.correlation.operationId === operationId,
		record.operation.id === operationId,
		record.operation.kind === kind,
		record.operation.rpc === rpc,
		record.status === "staged",
		record.outcome === "pending",
	];
	if (!checks.every((matched) => matched)) {
		throw new Error("the epoch store returned a non-canonical staged transaction");
	}
}

/**
 * Roll back a staged cleanup, reporting whether the rollback itself was made durable.
 * @param options - The start options carrying the epoch store.
 * @param transaction - The staged transaction.
 * @param reason - Why the cleanup is being rolled back.
 * @returns True when the rollback was recorded.
 */
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

/**
 * Record durably that a cleanup's outcome could not be decided, naming the thread that may still
 * exist so a later run can find it.
 * @param options - The start options carrying the epoch store.
 * @param transaction - The staged transaction.
 * @param reason - What could not be decided.
 * @param threadId - The thread that may still exist, or null.
 * @returns True when the unknown outcome was recorded.
 */
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

export { compensateAfterBindFailure };
