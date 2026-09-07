import type { EpochOperationRecord, EpochTransaction } from "@/runtime/codex-epoch";
import type { QueuedSubmissionId, TurnId } from "@/shared/codex-workbench-identity";
import type {
	WorkhorseOperationOptions,
	WorkhorseOperationRpc,
} from "@/runtime/codex-workhorse-operations/lib/contract";
import { settleDurable as settleDurableOutcome } from "@/runtime/codex-workhorse-operations/lib/durable-settlement";
import {
	correlationForState,
	createEventPublisher,
} from "@/runtime/codex-workhorse-operations/lib/event-publishing";
import {
	operationRpc,
	sameBinding,
	threadIdWire,
	type OperationState,
	type StageInput,
	type WorkhorseEvents,
	snapshotCall,
} from "@/runtime/codex-workhorse-operations/lib/internal";
import { operationError } from "@/runtime/codex-workhorse-operations/lib/operation-errors";

type QueueEntry = { readonly id: QueuedSubmissionId };
type ConfirmedQueueEntry = QueueEntry & { readonly clientUserMessageId: string };

interface StageableFacts {
	readonly threadSource: string;
	readonly facts: EpochOperationRecord["provenance"];
}

/**
 * Refuse to stage an operation without workhorse proof or with a reused identity.
 * @param input - The staging input.
 * @param operations - The operations already staged in this session.
 * @returns The proven thread source and provenance facts of the workhorse.
 */
function assertStageable(
	input: StageInput,
	operations: ReadonlyMap<string, OperationState>,
): StageableFacts {
	if (input.workhorse.proof === null) {
		throw operationError("unknown_provenance", "Workhorse proof is missing.");
	}
	const facts = input.workhorse.proof.record.provenance;
	if (facts.threadSource === null) {
		throw operationError("unknown_provenance", "Workhorse source provenance is missing.");
	}
	if (operations.has(input.operationIdWire)) {
		throw operationError(
			"transaction_failed",
			"The operation identity was already used in this session.",
			{ operation: input.operation, operationId: input.operationId },
		);
	}
	return { threadSource: facts.threadSource, facts };
}

/**
 * Stage the operation in the epoch store under the workhorse's proven facts.
 * @param options - The operation options holding the epoch store.
 * @param input - The staging input.
 * @param facts - The workhorse's proven provenance facts.
 * @param rpc - The wire RPC the operation will issue.
 * @returns The staged transaction.
 */
function stageTransaction(
	options: WorkhorseOperationOptions,
	input: StageInput,
	facts: EpochOperationRecord["provenance"],
	rpc: WorkhorseOperationRpc,
): EpochTransaction {
	try {
		return options.epoch.stageOperation({
			childId: input.binding.childId,
			epoch: input.binding.epoch,
			operationId: input.operationIdWire,
			kind: input.operation,
			rpc,
			workspaceRoot: facts.workspaceRoot,
			instructionHash: facts.instructionHash,
			manifestHash: facts.manifestHash,
			expected: options.epoch.snapshot().cas,
		});
	} catch (error) {
		throw operationError("transaction_failed", "The operation could not be durably staged.", {
			operation: input.operation,
			operationId: input.operationId,
			cause: error,
		});
	}
}

/**
 * Whether a staged record is the one that was requested: still staged and unsettled, and naming
 * this operation's identity, kind and wire RPC.
 * @param record - The record the epoch store staged.
 * @param input - The staging input.
 * @param rpc - The wire RPC the record must name.
 * @returns True when every field matches the request.
 */
function isCanonicalStagedRecord(
	record: EpochOperationRecord,
	input: StageInput,
	rpc: WorkhorseOperationRpc,
): boolean {
	return (
		record.status === "staged" &&
		record.outcome === "pending" &&
		record.correlation.operationId === input.operationIdWire &&
		record.operation.id === input.operationIdWire &&
		record.operation.kind === input.operation &&
		record.operation.rpc === rpc
	);
}

/**
 * Check that the epoch store staged exactly the operation that was requested.
 * @param transaction - The staged transaction.
 * @param input - The staging input.
 * @param rpc - The wire RPC the record must name.
 */
function assertCanonicalStagedRecord(
	transaction: EpochTransaction,
	input: StageInput,
	rpc: WorkhorseOperationRpc,
): void {
	if (!isCanonicalStagedRecord(transaction.record, input, rpc)) {
		throw operationError(
			"transaction_failed",
			"The epoch store returned a non-canonical staged record.",
			{ operation: input.operation, operationId: input.operationId },
		);
	}
}

/**
 * Find the single queue entry confirmed by an operation's client identity.
 * @param queue - The authoritative queue.
 * @param clientUserMessageId - The operation's client identity.
 * @returns The entry when exactly one matches, otherwise null.
 */
function uniqueQueueMatch(
	queue: readonly ConfirmedQueueEntry[],
	clientUserMessageId: string,
): ConfirmedQueueEntry | null {
	const matches = queue.filter(
		(submission) => submission.clientUserMessageId === clientUserMessageId,
	);
	return matches.length === 1 ? matches[0]! : null;
}

/**
 * Recognise a queued add whose outcome is still unknown and can be confirmed by the queue.
 * @param state - The operation state.
 * @returns Whether a later queue read can settle the state.
 */
function isUnconfirmedQueuedAdd(
	state: OperationState,
): state is OperationState & { readonly clientUserMessageId: string } {
	return (
		state.queueOperation === "add" &&
		state.outcome === "outcome_unknown" &&
		state.clientUserMessageId !== null &&
		!state.terminalEmitted
	);
}

/**
 * Recognise an operation that must not adopt an observed turn: it already finished, or it is
 * bound to a different turn.
 * @param candidate - The operation state.
 * @param turnId - The observed turn identity.
 * @returns Whether the turn is ignored for this operation.
 */
function ignoresTurn(candidate: OperationState, turnId: TurnId): boolean {
	return candidate.terminalEmitted || (candidate.turnId !== null && candidate.turnId !== turnId);
}

/**
 * Recognise an operation whose outcome an observed turn can settle as delivered.
 * @param candidate - The operation state.
 * @returns Whether the outcome is still pending or unknown.
 */
function awaitsSettlement(candidate: OperationState): boolean {
	return candidate.outcome === "pending" || candidate.outcome === "outcome_unknown";
}

/**
 * Create the operation registry, durable settlement and event flow shared by every operation.
 * @param options - The operation options.
 * @returns The events port of the runtime.
 */
export function createWorkhorseEvents(options: WorkhorseOperationOptions): WorkhorseEvents {
	const publisher = createEventPublisher();
	const operations = new Map<string, OperationState>();
	const activeTurns = new Map<string, TurnId>();
	let queueReconcileTail: Promise<void> = Promise.resolve();
	const { emit } = publisher;

	/**
	 * Stage an operation durably and register it, emitting `accepted`.
	 * @param input - The staging input.
	 * @returns The registered operation state.
	 */
	const stage = (input: StageInput): OperationState => {
		const { threadSource: workhorseThreadSource, facts } = assertStageable(input, operations);
		const rpc = operationRpc(input.operation, input.queueOperation ?? undefined, input.rpc);
		const transaction = stageTransaction(options, input, facts, rpc);
		assertCanonicalStagedRecord(transaction, input, rpc);
		const state: OperationState = {
			operationId: input.operationId,
			operationIdWire: input.operationIdWire,
			operation: input.operation,
			queueOperation: input.queueOperation,
			rpc,
			call: snapshotCall(input.call),
			binding: input.binding,
			coordinatorThreadId: input.binding.coordinator.threadId,
			workhorseThreadId: input.binding.workhorse.threadId,
			workhorseThreadSource,
			transaction,
			clientUserMessageId: input.clientUserMessageId,
			queuedSubmissionId: null,
			turnId: null,
			outcome: "pending",
			durableSettled: false,
			queuedEmitted: false,
			startedEmitted: false,
			terminalEmitted: false,
		};
		operations.set(input.operationIdWire, state);
		emit(state, "accepted", "pending");
		return state;
	};

	/**
	 * Settle the operation's outcome in the epoch store exactly once.
	 * @param state - The operation state.
	 * @param requested - The observed outcome.
	 * @param detail - The reason recorded with a rollback or unknown outcome.
	 * @returns The outcome the state carries afterwards.
	 */
	const settleDurable: WorkhorseEvents["settleDurable"] = (state, requested, detail) =>
		settleDurableOutcome(options, state, requested, detail);

	/**
	 * Forget a finished operation and its active-turn registration.
	 * @param state - The operation state.
	 */
	const clear = (state: OperationState): void => {
		if (state.terminalEmitted) {
			return;
		}
		state.terminalEmitted = true;
		operations.delete(state.operationIdWire);
		if (state.turnId !== null) {
			activeTurns.delete(threadIdWire(options, state.workhorseThreadId));
		}
	};

	/**
	 * Emit the terminal event once, unless the outcome is unknown and must stay open.
	 * @param state - The operation state.
	 * @param type - The terminal event type.
	 * @param queue - The queue snapshot to publish.
	 * @param detail - Free text detail.
	 */
	const terminal: WorkhorseEvents["terminal"] = (state, type, queue, detail) => {
		if (state.terminalEmitted || state.outcome === "outcome_unknown") {
			return;
		}
		clear(state);
		emit(state, type, state.outcome, queue, detail);
	};

	/**
	 * Find the operations that share a queued submission with the given state; a direct turn
	 * relates only to itself.
	 * @param state - The operation state.
	 * @returns The related states, including the given one.
	 */
	const relatedStates = (state: OperationState): readonly OperationState[] =>
		state.queuedSubmissionId === null
			? [state]
			: [...operations.values()].filter(
					(candidate) =>
						candidate.queuedSubmissionId === state.queuedSubmissionId &&
						candidate.workhorseThreadId === state.workhorseThreadId &&
						sameBinding(candidate.binding, state.binding),
				);

	/**
	 * Bind one operation to the workhorse turn that was observed for it, settling a pending or
	 * unknown outcome as delivered and emitting `started` once.
	 * @param candidate - The operation state.
	 * @param turnId - The observed turn identity.
	 * @param queue - The queue snapshot to publish with `started`.
	 */
	const adoptTurn = (candidate: OperationState, turnId: TurnId, queue: readonly QueueEntry[]) => {
		if (ignoresTurn(candidate, turnId)) {
			return;
		}
		candidate.turnId = turnId;
		activeTurns.set(threadIdWire(options, candidate.workhorseThreadId), turnId);
		if (awaitsSettlement(candidate)) {
			settleDurable(
				candidate,
				"delivered",
				"The exact workhorse turn was observed for the queued submission.",
			);
		}
		if (candidate.outcome === "delivered" && !candidate.startedEmitted) {
			candidate.startedEmitted = true;
			emit(candidate, "started", "delivered", queue);
		}
	};

	/**
	 * Correlate an observed turn with the operation and every operation sharing its submission.
	 * @param state - The operation state.
	 * @param turnId - The observed turn identity.
	 * @param queue - The queue snapshot to publish with `started`.
	 */
	const correlateTurn = (
		state: OperationState,
		turnId: TurnId,
		queue: readonly QueueEntry[] = [],
	): void => {
		for (const candidate of relatedStates(state)) {
			adoptTurn(candidate, turnId, queue);
		}
	};

	/**
	 * Settle one unknown queued add that the authoritative queue confirmed, emitting `queued` once.
	 * @param state - The operation state.
	 * @param match - The confirmed queue entry.
	 * @param queue - The authoritative queue to publish.
	 */
	const confirmQueuedAdd = (
		state: OperationState,
		match: ConfirmedQueueEntry,
		queue: readonly ConfirmedQueueEntry[],
	): void => {
		state.queuedSubmissionId = match.id;
		const settled = settleDurable(
			state,
			"delivered",
			"The queued submission was later confirmed by exact client identity.",
		);
		if (settled === "delivered" && !state.queuedEmitted) {
			state.queuedEmitted = true;
			emit(state, "queued", "delivered", queue);
		}
	};

	/**
	 * Settle unknown queued adds that an authoritative queue read now confirms by exact client
	 * identity, provided the binding they were accepted under is still current.
	 * @param queue - The authoritative queue with client identities.
	 */
	const reconcileUnknownQueue = (queue: readonly ConfirmedQueueEntry[]): void => {
		const current = options.currentBinding();
		if (current === null) {
			return;
		}
		for (const state of operations.values()) {
			if (!isUnconfirmedQueuedAdd(state) || !sameBinding(current, state.binding)) {
				continue;
			}
			const match = uniqueQueueMatch(queue, state.clientUserMessageId);
			if (match !== null) {
				confirmQueuedAdd(state, match, queue);
			}
		}
	};

	/**
	 * Read the queue after a change notification, serialized so reads never interleave.
	 */
	const scheduleQueueReconciliation = (): void => {
		queueReconcileTail = queueReconcileTail.then(
			async () => {
				try {
					const result = await options.queue.list();
					reconcileUnknownQueue(result.queue);
				} catch {
					/* A failed read cannot prove an unknown mutation either way. */
				}
				return undefined;
			},
			() => undefined,
		);
	};

	return {
		operations,
		activeTurns,
		listeners: publisher.listeners,
		correlation: correlationForState,
		emit,
		stage,
		settleDurable,
		terminal,
		clear,
		correlateTurn,
		reconcileUnknownQueue,
		scheduleQueueReconciliation,
		subscribe: publisher.subscribe,
	};
}
