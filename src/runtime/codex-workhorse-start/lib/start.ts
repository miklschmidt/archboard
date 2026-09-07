import type { ChildEpoch, ChildId, OperationId, ThreadId } from "@/shared/codex-workbench-identity";
import type {
	EpochExecutionProof,
	EpochOperationRecord,
	EpochTransaction,
} from "@/runtime/codex-epoch";
import type { ThreadLinkBindingSnapshot, ThreadLinkTarget } from "@/runtime/codex-thread-link";
import { compensateAfterBindFailure } from "@/runtime/codex-workhorse-start/lib/cleanup";
import {
	WORKHORSE_INSTRUCTION_HASH,
	WORKHORSE_MANIFEST_HASH,
	WORKHORSE_OPERATION_KIND,
	WORKHORSE_RPC,
	WORKHORSE_THREAD_SOURCE,
	createWorkhorseThreadStartParams,
} from "@/runtime/codex-workhorse-start/lib/model";
import type {
	CodexWorkhorseStart,
	CodexWorkhorseStartOptions,
	WorkhorseSnapshot,
	WorkhorseStartInput,
	WorkhorseStartResponse,
	WorkhorseStartTransaction,
} from "@/runtime/codex-workhorse-start/lib/contract";
import {
	emptySnapshot,
	errorMessage,
	failedSnapshot,
	inspectSnapshot,
	mutationOutcome,
	readySnapshot,
	startingSnapshot,
} from "@/runtime/codex-workhorse-start/lib/state";
import {
	isCommittedStartRecord,
	isCurrentStartProof,
	isExecutableWorkhorseBinding,
	validateWorkhorseStartResponse,
	type ValidatedWorkhorseStart,
} from "@/runtime/codex-workhorse-start/lib/validation";
import { cloneAndFreeze } from "@/runtime/codex-workhorse-start/lib/immutability";

/** The facts one start attempt runs under, fixed before any step is taken. */
interface StartContext {
	readonly options: CodexWorkhorseStartOptions;
	readonly input: WorkhorseStartInput;
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly operationId: OperationId;
}

/**
 * A start step's refusal, carrying the snapshot the pane is left with. Steps throw this rather
 * than returning it so the start reads as one sequence, with every refusal settled in one place.
 */
class WorkhorseStartRefusal extends Error {
	override readonly name = "WorkhorseStartRefusal";
	readonly snapshot: WorkhorseSnapshot;

	/**
	 * Build the refusal.
	 * @param snapshot - The snapshot the start settles as.
	 */
	constructor(snapshot: WorkhorseSnapshot) {
		super(snapshot.reason ?? "The workhorse start was refused.");
		this.snapshot = snapshot;
	}
}

/**
 * Refuse the start with a snapshot that proves nothing reached Codex, so the pane may try again.
 * @param context - The start context.
 * @param reason - Why the start failed.
 * @returns The refusal to throw.
 */
function refuseAsFailed(context: StartContext, reason: string): WorkhorseStartRefusal {
	return new WorkhorseStartRefusal(
		failedSnapshot(context.input.paneId, context.operationId, reason),
	);
}

/**
 * Refuse the start with an inspect-only snapshot: something may have happened in Codex that
 * Archboard cannot prove, so the workhorse is left visible but undriveable.
 * @param context - The start context.
 * @param reason - What could not be proven.
 * @param threadId - The thread involved, when there is one.
 * @param started - What the start proved, when it got that far.
 * @returns The refusal to throw.
 */
function refuseAsUnknown(
	context: StartContext,
	reason: string,
	threadId: ThreadId | null = null,
	started: ValidatedWorkhorseStart | null = null,
): WorkhorseStartRefusal {
	return new WorkhorseStartRefusal(
		inspectSnapshot({
			paneId: context.input.paneId,
			childId: context.childId,
			epoch: context.epoch,
			threadId,
			operationId: context.operationId,
			outcome: "outcome_unknown",
			start: started === null ? null : started.facts,
			binding: null,
			cleanup: null,
			reason,
		}),
	);
}

/**
 * Stage the durable start operation and prove the epoch store staged exactly what was asked for.
 * @param context - The start context.
 * @returns The staged transaction.
 * @throws {WorkhorseStartRefusal} When staging fails or returns a non-canonical record.
 */
function stageStartTransaction(context: StartContext): WorkhorseStartTransaction {
	const { options } = context;
	try {
		const epochSnapshot = options.epoch.snapshot();
		const transaction = options.epoch.stageOperation({
			childId: context.childId,
			epoch: context.epoch,
			operationId: context.operationId,
			kind: WORKHORSE_OPERATION_KIND,
			rpc: WORKHORSE_RPC,
			workspaceRoot: options.checkoutRoot,
			instructionHash: WORKHORSE_INSTRUCTION_HASH,
			manifestHash: WORKHORSE_MANIFEST_HASH,
			expected: epochSnapshot.cas,
		});
		assertTransaction(
			transaction,
			context.childId,
			context.epoch,
			context.operationId,
			WORKHORSE_OPERATION_KIND,
			WORKHORSE_RPC,
		);
		return transaction;
	} catch (error) {
		throw refuseAsFailed(
			context,
			`The workhorse start transaction could not be staged: ${errorMessage(error)}`,
		);
	}
}

/**
 * Build the authored thread/start body. A body that cannot be built means nothing was sent, so
 * the staged operation is rolled back; only a rollback that cannot itself be made durable leaves
 * the outcome unknown.
 * @param context - The start context.
 * @param transaction - The staged transaction.
 * @returns The thread/start parameters.
 * @throws {WorkhorseStartRefusal} When the authored profile is not valid.
 */
function buildStartParams(
	context: StartContext,
	transaction: WorkhorseStartTransaction,
): ReturnType<typeof createWorkhorseThreadStartParams> {
	try {
		return createWorkhorseThreadStartParams(context.options.checkoutRoot);
	} catch (error) {
		const detail = `The workhorse start profile was not valid: ${errorMessage(error)}`;
		if (rollback(context.options, transaction, "The workhorse start profile was not valid.")) {
			throw refuseAsFailed(context, detail);
		}
		markUnknown(
			context.options,
			transaction,
			"The workhorse start profile was invalid and local rollback durability is unknown.",
			null,
		);
		throw refuseAsUnknown(context, detail);
	}
}

/**
 * Settle a thread/start that threw. Only a session that proves the call was never delivered lets
 * the staged operation be rolled back; anything else leaves a thread that may exist, so the start
 * settles as unknown and is never retried or inferred.
 * @param context - The start context.
 * @param transaction - The staged transaction.
 * @param error - What the session threw.
 * @returns The refusal to throw.
 */
function refuseStartFailure(
	context: StartContext,
	transaction: WorkhorseStartTransaction,
	error: unknown,
): WorkhorseStartRefusal {
	if (mutationOutcome(error) !== "not_delivered") {
		markUnknown(
			context.options,
			transaction,
			"The workhorse thread/start outcome is unknown.",
			null,
		);
		return refuseAsUnknown(
			context,
			"The workhorse thread/start outcome is unknown; it was not retried or inferred.",
		);
	}
	if (rollback(context.options, transaction, "The workhorse thread/start was not delivered.")) {
		return refuseAsFailed(
			context,
			"The workhorse thread/start was not delivered; the staged operation was rolled back.",
		);
	}
	const reason =
		"The workhorse thread/start was not delivered, but local rollback durability is unknown.";
	markUnknown(context.options, transaction, reason, null);
	return refuseAsUnknown(context, reason);
}

/**
 * Send thread/start and prove the response is the authored workhorse.
 * @param context - The start context.
 * @param transaction - The staged transaction.
 * @param params - The thread/start parameters.
 * @returns The validated start.
 * @throws {WorkhorseStartRefusal} When the call fails or the response is not the authored profile.
 */
async function startWorkhorseThread(
	context: StartContext,
	transaction: WorkhorseStartTransaction,
	params: ReturnType<typeof createWorkhorseThreadStartParams>,
): Promise<ValidatedWorkhorseStart> {
	let response: WorkhorseStartResponse;
	try {
		response = await context.options.session.threadStart(params);
	} catch (error) {
		throw refuseStartFailure(context, transaction, error);
	}
	try {
		return validateWorkhorseStartResponse(response, context.options);
	} catch (error) {
		markUnknown(
			context.options,
			transaction,
			"The workhorse thread/start confirmation was invalid.",
			null,
		);
		throw refuseAsUnknown(
			context,
			`The workhorse thread/start confirmation was invalid: ${errorMessage(error)}`,
		);
	}
}

/**
 * Take durable ownership of the started thread and prove the committed record says so. Without
 * that record Archboard cannot claim the thread on a later run, so the start settles as unknown.
 * @param context - The start context.
 * @param transaction - The staged transaction.
 * @param started - The validated start.
 * @throws {WorkhorseStartRefusal} When the commit fails or its record is not canonical.
 */
function commitStart(
	context: StartContext,
	transaction: WorkhorseStartTransaction,
	started: ValidatedWorkhorseStart,
): void {
	let committed: EpochOperationRecord;
	try {
		committed = context.options.epoch.commitOperation(transaction, {
			threadId: started.threadId,
			threadSource: WORKHORSE_THREAD_SOURCE,
		});
	} catch (error) {
		markUnknown(
			context.options,
			transaction,
			"The workhorse start was returned but could not be durably committed.",
			started.threadId,
		);
		throw refuseAsUnknown(
			context,
			`The workhorse start was confirmed, but durable ownership failed: ${errorMessage(error)}`,
			started.threadId,
			started,
		);
	}
	const canonical = isCommittedStartRecord(
		committed,
		context.childId,
		context.epoch,
		context.operationId,
		started.threadId,
		context.options.checkoutRoot,
	);
	if (!canonical) {
		throw refuseAsUnknown(
			context,
			"The workhorse start returned a non-canonical durable ownership record.",
			started.threadId,
			started,
		);
	}
}

/**
 * Read back the current ownership proof and require it to be this start's, at the manifest
 * revision the epoch store is on now.
 * @param context - The start context.
 * @param started - The validated start.
 * @returns The current execution proof.
 * @throws {Error} When the proof is missing or non-canonical.
 */
function currentOwnershipProof(
	context: StartContext,
	started: ValidatedWorkhorseStart,
): EpochExecutionProof {
	const proof = context.options.epoch.assertCurrent({
		childId: context.childId,
		epoch: context.epoch,
		operationId: context.operationId,
		threadId: started.threadId,
	});
	const proofSnapshot = context.options.epoch.snapshot();
	const canonical =
		proof.manifestRevision === proofSnapshot.manifest.revision &&
		isCurrentStartProof(
			proof,
			context.childId,
			context.epoch,
			context.operationId,
			started.threadId,
			context.options.checkoutRoot,
		);
	if (!canonical) {
		throw new Error("the current workhorse ownership proof is non-canonical");
	}
	return proof;
}

/**
 * Bind the pane to the started workhorse. Every failure from here on compensates: the thread was
 * created, so it is either cleaned up or left inspect-only, never silently abandoned.
 * @param context - The start context.
 * @param started - The validated start.
 * @returns The ready snapshot.
 * @throws {WorkhorseStartRefusal} Carrying the compensated snapshot when binding does not hold.
 */
async function bindWorkhorse(
	context: StartContext,
	started: ValidatedWorkhorseStart,
): Promise<WorkhorseSnapshot> {
	const { options, input, childId, epoch, operationId } = context;
	let proof: EpochExecutionProof;
	try {
		proof = currentOwnershipProof(context, started);
	} catch (error) {
		throw new WorkhorseStartRefusal(
			await compensateAfterBindFailure(
				options,
				input,
				childId,
				epoch,
				operationId,
				started,
				null,
				`The committed workhorse could not be bound: ${errorMessage(error)}`,
			),
		);
	}

	let binding: ThreadLinkBindingSnapshot;
	try {
		const target: ThreadLinkTarget = cloneAndFreeze({
			threadId: started.threadId,
			childId,
			epoch,
			operationId,
			provenance: proof,
		});
		binding = await options.threadLink.classifyAndBind(input.paneId, input.expected, target);
	} catch (error) {
		throw new WorkhorseStartRefusal(
			await compensateAfterBindFailure(
				options,
				input,
				childId,
				epoch,
				operationId,
				started,
				null,
				`The workhorse thread link could not be bound: ${errorMessage(error)}`,
			),
		);
	}

	if (!isExecutableWorkhorseBinding(binding, input.paneId, childId, epoch, started.threadId)) {
		throw new WorkhorseStartRefusal(
			await compensateAfterBindFailure(
				options,
				input,
				childId,
				epoch,
				operationId,
				started,
				binding,
				"The workhorse thread link did not become executable.",
			),
		);
	}
	return readySnapshot(input.paneId, childId, epoch, operationId, started.facts, binding);
}

/**
 * Mint the operation identity this start runs under and prove it is the current one.
 * @param options - The start options carrying the operation authority.
 * @param paneId - The pane the start belongs to.
 * @returns The issued identity.
 * @throws {WorkhorseStartRefusal} When the identity is not current.
 */
function issueStartOperation(options: CodexWorkhorseStartOptions, paneId: string): OperationId {
	const operationId = options.operation.issuer.mintOperationId();
	try {
		options.operation.validator.assertCurrentOperationId(operationId);
	} catch (error) {
		throw new WorkhorseStartRefusal(
			failedSnapshot(
				paneId,
				operationId,
				`The workhorse operation identity is not current: ${errorMessage(error)}`,
			),
		);
	}
	return operationId;
}

/**
 * Build the module that starts exactly one workhorse thread per pane and keeps the snapshot of
 * what happened. Starts are serialised: a second start waits for the first, so two workhorses can
 * never be created for one pane.
 * @param options - The session, epoch store, thread-link, identity and operation authorities.
 * @returns The workhorse start module.
 */
function createCodexWorkhorseStart(options: CodexWorkhorseStartOptions): CodexWorkhorseStart {
	let latest = emptySnapshot();
	let tail: Promise<void> = Promise.resolve();

	/**
	 * The pane's current workhorse snapshot.
	 * @returns The latest snapshot.
	 */
	const snapshot = (): WorkhorseSnapshot => latest;

	/**
	 * Run one start behind every start enqueued before it.
	 * @param input - The pane and the binding it expects to replace.
	 * @returns The snapshot the start settled as.
	 */
	const start = (input: WorkhorseStartInput): Promise<WorkhorseSnapshot> => {
		const run = tail.then(() => execute(input));
		tail = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	};

	/**
	 * Start one workhorse: issue the operation, stage it durably, create the thread, prove the
	 * response and the durable record, then bind the pane to it. Every step that cannot prove what
	 * happened settles the snapshot and stops; nothing is retried or inferred.
	 * @param input - The pane and the binding it expects to replace.
	 * @returns The snapshot the start settled as.
	 */
	async function execute(input: WorkhorseStartInput): Promise<WorkhorseSnapshot> {
		const childId = options.identity.validator.childId;
		const epoch = options.identity.validator.epoch;
		try {
			const operationId = issueStartOperation(options, input.paneId);
			const context: StartContext = { options, input, childId, epoch, operationId };
			latest = startingSnapshot(input.paneId, childId, epoch, operationId);
			const transaction = stageStartTransaction(context);
			const params = buildStartParams(context, transaction);
			const started = await startWorkhorseThread(context, transaction, params);
			commitStart(context, transaction, started);
			latest = await bindWorkhorse(context, started);
			return latest;
		} catch (error) {
			if (error instanceof WorkhorseStartRefusal) {
				latest = error.snapshot;
				return latest;
			}
			throw error;
		}
	}

	return Object.freeze({ start, snapshot });
}

/**
 * Prove the epoch store staged exactly the operation that was asked for; a partial match proves
 * nothing about what the store will hold later.
 * @param transaction - The staged transaction.
 * @param childId - The Codex child the operation runs on.
 * @param epoch - That child's epoch.
 * @param operationId - The operation identity.
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
 * Roll back a staged operation, reporting whether the rollback itself was made durable.
 * @param options - The start options carrying the epoch store.
 * @param transaction - The staged transaction.
 * @param reason - Why the operation is being rolled back.
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
 * Record durably that an operation's outcome could not be decided, naming the thread when one may
 * exist so a later run can find it.
 * @param options - The start options carrying the epoch store.
 * @param transaction - The staged transaction.
 * @param reason - What could not be decided.
 * @param threadId - The thread that may exist, or null.
 * @returns True when the unknown outcome was recorded.
 */
function markUnknown(
	options: CodexWorkhorseStartOptions,
	transaction: WorkhorseStartTransaction,
	reason: string,
	threadId: ThreadId | null,
): boolean {
	try {
		const confirmation =
			threadId === null ? undefined : { threadId, threadSource: WORKHORSE_THREAD_SOURCE };
		options.epoch.markOutcomeUnknown(transaction, reason, confirmation);
		return true;
	} catch {
		return false;
	}
}

export { createCodexWorkhorseStart };
