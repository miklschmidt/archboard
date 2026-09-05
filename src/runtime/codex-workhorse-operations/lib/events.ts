import type { EpochTransaction } from "../../codex-epoch/index.js";
import type { QueuedSubmissionId, TurnId } from "../../../shared/codex-workbench-identity/index.js";
import {
	type WorkhorseOperationEvent,
	type WorkhorseOperationEventListener,
	type WorkhorseOperationOptions,
} from "./contract.js";
import {
	boundedDetail,
	freeze,
	operationError,
	operationRpc,
	queueIds,
	sameBinding,
	threadIdWire,
	type OperationState,
	type StageInput,
	type WorkhorseEvents,
	snapshotCall,
} from "./internal.js";

function correlationForState(state: OperationState) {
	return freeze({
		operationId: state.operationId,
		childId: state.binding.childId,
		epoch: state.binding.epoch,
		coordinatorThreadId: state.coordinatorThreadId,
		coordinatorTurnId: state.call.turnId,
		workhorseThreadId: state.workhorseThreadId,
		coordinatorCall: state.call,
		clientUserMessageId: state.clientUserMessageId,
		queuedSubmissionId: state.queuedSubmissionId,
		turnId: state.turnId,
	});
}

export function createWorkhorseEvents(options: WorkhorseOperationOptions): WorkhorseEvents {
	const listeners = new Set<WorkhorseOperationEventListener>();
	const operations = new Map<string, OperationState>();
	const activeTurns = new Map<string, TurnId>();
	const publications: Array<{
		readonly event: WorkhorseOperationEvent;
		readonly cohort: readonly WorkhorseOperationEventListener[];
	}> = [];
	let drainingPublications = false;
	let queueReconcileTail: Promise<void> = Promise.resolve();

	const correlation = correlationForState;

	const emit = (
		state: OperationState,
		type: WorkhorseOperationEvent["type"],
		outcome: OperationState["outcome"],
		queue: readonly { readonly id: QueuedSubmissionId }[] = [],
		detail: string | null = null,
	): void => {
		const base = {
			operation: state.operation,
			queueOperation: state.queueOperation,
			rpc: state.rpc,
			correlation: correlation(state),
			queuedSubmissionIds: queueIds(queue),
			detail: detail === null ? null : boundedDetail(detail),
		};
		let event: WorkhorseOperationEvent;
		switch (type) {
			case "accepted":
				event = freeze({ ...base, type, outcome: "pending" });
				break;
			case "queued":
			case "started":
			case "progress":
			case "attention":
			case "completed":
				event = freeze({ ...base, type, outcome: "delivered" });
				break;
			case "failed":
				event = freeze({
					...base,
					type,
					outcome: outcome === "not_delivered" ? "not_delivered" : "delivered",
				});
				break;
			case "outcome_unknown":
				event = freeze({ ...base, type, outcome: "outcome_unknown" });
				break;
			default:
				return;
		}
		publications.push({ event, cohort: Array.from(listeners) });
		if (drainingPublications) {
			return;
		}
		drainingPublications = true;
		try {
			for (;;) {
				const publication = publications.shift();
				if (publication === undefined) {
					break;
				}
				for (const listener of publication.cohort) {
					try {
						listener(publication.event);
					} catch {
						/* Consumers cannot alter settlement or later ordered listeners. */
					}
				}
			}
		} finally {
			drainingPublications = false;
		}
	};

	const stage = (input: StageInput): OperationState => {
		if (input.workhorse.proof === null) {
			throw operationError("unknown_provenance", "Workhorse proof is missing.");
		}
		if (input.workhorse.proof.record.provenance.threadSource === null) {
			throw operationError("unknown_provenance", "Workhorse source provenance is missing.");
		}
		if (operations.has(input.operationIdWire)) {
			throw operationError(
				"transaction_failed",
				"The operation identity was already used in this session.",
				{
					operation: input.operation,
					operationId: input.operationId,
				},
			);
		}
		const rpc = operationRpc(input.operation, input.queueOperation ?? undefined, input.rpc);
		let transaction: EpochTransaction;
		try {
			const facts = input.workhorse.proof.record.provenance;
			transaction = options.epoch.stageOperation({
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
		const record = transaction.record;
		if (
			record.status !== "staged" ||
			record.outcome !== "pending" ||
			record.correlation.operationId !== input.operationIdWire ||
			record.operation.id !== input.operationIdWire ||
			record.operation.kind !== input.operation ||
			record.operation.rpc !== rpc
		) {
			throw operationError(
				"transaction_failed",
				"The epoch store returned a non-canonical staged record.",
				{
					operation: input.operation,
					operationId: input.operationId,
				},
			);
		}
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
			workhorseThreadSource: input.workhorse.proof.record.provenance.threadSource,
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

	const settleDurable = (
		state: OperationState,
		requested: Exclude<OperationState["outcome"], "pending">,
		detail: string | null,
	): Exclude<OperationState["outcome"], "pending"> => {
		if (state.durableSettled) {
			if (state.outcome === "outcome_unknown" && requested === "delivered") {
				try {
					options.epoch.confirmOutcome(state.transaction, {
						threadId: state.workhorseThreadId,
						turnId: state.turnId,
						threadSource: state.workhorseThreadSource,
					});
					state.outcome = "delivered";
				} catch {
					/* Exact evidence can be retried on a later notification. */
				}
			}
			return state.outcome as Exclude<OperationState["outcome"], "pending">;
		}
		let outcome = requested;
		try {
			const confirmation = {
				threadId: state.workhorseThreadId,
				turnId: state.turnId,
				threadSource: state.workhorseThreadSource,
			};
			if (requested === "delivered") {
				options.epoch.commitOperation(state.transaction, confirmation);
			} else if (requested === "not_delivered") {
				options.epoch.rollbackOperation(state.transaction, detail ?? "operation was not delivered");
			} else {
				options.epoch.markOutcomeUnknown(
					state.transaction,
					detail ?? "operation outcome is unknown",
					confirmation,
				);
			}
		} catch (error) {
			outcome = "outcome_unknown";
			try {
				options.epoch.markOutcomeUnknown(
					state.transaction,
					"The remote operation settled but durable outcome confirmation failed.",
					{
						threadId: state.workhorseThreadId,
						turnId: state.turnId,
						threadSource: state.workhorseThreadSource,
					},
				);
			} catch {
				/* A second remote attempt remains forbidden. */
			}
			void error;
		}
		state.outcome = outcome;
		state.durableSettled = true;
		return outcome;
	};

	const terminal = (
		state: OperationState,
		type: "completed" | "failed",
		queue: readonly { readonly id: QueuedSubmissionId }[],
		detail: string | null,
	): void => {
		if (state.terminalEmitted) {
			return;
		}
		if (state.outcome === "outcome_unknown") {
			return;
		}
		clear(state);
		emit(state, type, state.outcome, queue, detail);
	};

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

	const correlateTurn = (
		state: OperationState,
		turnId: TurnId,
		queue: readonly { readonly id: QueuedSubmissionId }[] = [],
	): void => {
		const related =
			state.queuedSubmissionId === null
				? [state]
				: [...operations.values()].filter(
						(candidate) =>
							candidate.queuedSubmissionId === state.queuedSubmissionId &&
							candidate.workhorseThreadId === state.workhorseThreadId &&
							sameBinding(candidate.binding, state.binding),
					);
		for (const candidate of related) {
			if (candidate.terminalEmitted) {
				continue;
			}
			if (candidate.turnId !== null && candidate.turnId !== turnId) {
				continue;
			}
			candidate.turnId = turnId;
			activeTurns.set(threadIdWire(options, candidate.workhorseThreadId), turnId);
			if (candidate.outcome === "pending" || candidate.outcome === "outcome_unknown") {
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
		}
	};

	const reconcileUnknownQueue = (
		queue: readonly { readonly id: QueuedSubmissionId; readonly clientUserMessageId: string }[],
	): void => {
		for (const state of operations.values()) {
			if (
				state.queueOperation !== "add" ||
				state.outcome !== "outcome_unknown" ||
				state.clientUserMessageId === null ||
				state.terminalEmitted
			) {
				continue;
			}
			const current = options.currentBinding();
			if (current === null || !sameBinding(current, state.binding)) {
				continue;
			}
			const matches = queue.filter(
				(submission) => submission.clientUserMessageId === state.clientUserMessageId,
			);
			if (matches.length !== 1) {
				continue;
			}
			state.queuedSubmissionId = matches[0]!.id;
			if (
				settleDurable(
					state,
					"delivered",
					"The queued submission was later confirmed by exact client identity.",
				) === "delivered"
			) {
				if (!state.queuedEmitted) {
					state.queuedEmitted = true;
					emit(state, "queued", "delivered", queue);
				}
			}
		}
	};

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

	const subscribe = (listener: WorkhorseOperationEventListener): (() => void) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	};

	return {
		operations,
		activeTurns,
		listeners,
		correlation,
		emit,
		stage,
		settleDurable,
		terminal,
		clear,
		correlateTurn,
		reconcileUnknownQueue,
		scheduleQueueReconciliation,
		subscribe,
	};
}
