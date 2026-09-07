import type { QueuedSubmissionId } from "@/shared/codex-workbench-identity";
import type {
	WorkhorseOperationCorrelation,
	WorkhorseOperationDelivery,
	WorkhorseOperationEvent,
	WorkhorseOperationEventListener,
} from "@/runtime/codex-workhorse-operations/lib/contract";
import {
	boundedDetail,
	freeze,
	queueIds,
	type OperationState,
	type WorkhorseEvents,
} from "@/runtime/codex-workhorse-operations/lib/internal";

type EventBase = Omit<WorkhorseOperationEvent, "type" | "outcome">;

interface Publication {
	readonly event: WorkhorseOperationEvent;
	readonly cohort: readonly WorkhorseOperationEventListener[];
}

interface EventPublisher {
	readonly listeners: Set<WorkhorseOperationEventListener>;
	readonly subscribe: WorkhorseEvents["subscribe"];
	readonly emit: WorkhorseEvents["emit"];
}

/**
 * Project an operation's state to the correlation every event carries, so consumers can tie
 * an event back to the coordinator call and the workhorse turn or submission it produced.
 * @param state - The operation state.
 * @returns The frozen correlation.
 */
function correlationForState(state: OperationState): WorkhorseOperationCorrelation {
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

/**
 * Pair an event type with the outcome the contract fixes for it; only `failed` carries a
 * caller-decided outcome.
 * @param base - The shared event fields.
 * @param type - The event type.
 * @param outcome - The settled outcome, consulted for `failed` events only.
 * @returns The frozen event.
 */
function buildEvent(
	base: EventBase,
	type: WorkhorseOperationEvent["type"],
	outcome: WorkhorseOperationDelivery,
): WorkhorseOperationEvent {
	switch (type) {
		case "accepted":
			return freeze({ ...base, type, outcome: "pending" });
		case "failed":
			return freeze({
				...base,
				type,
				outcome: outcome === "not_delivered" ? "not_delivered" : "delivered",
			});
		case "outcome_unknown":
			return freeze({ ...base, type, outcome: "outcome_unknown" });
		default:
			return freeze({ ...base, type, outcome: "delivered" });
	}
}

/**
 * Deliver one publication to the listeners captured when it was emitted; a listener that
 * throws cannot alter settlement or block the listeners after it.
 * @param publication - The event and its listener cohort.
 */
function deliver(publication: Publication): void {
	for (const listener of publication.cohort) {
		try {
			listener(publication.event);
		} catch {
			/* Consumers cannot alter settlement or later ordered listeners. */
		}
	}
}

/**
 * Create the ordered event publisher. Events emitted while a listener runs are queued and
 * delivered after it returns, so every listener observes the same order.
 * @returns The listener set with subscribe and emit.
 */
function createEventPublisher(): EventPublisher {
	const listeners = new Set<WorkhorseOperationEventListener>();
	const publications: Publication[] = [];
	let draining = false;

	/**
	 * Deliver queued publications in order unless a delivery is already in progress.
	 */
	const drain = (): void => {
		if (draining) {
			return;
		}
		draining = true;
		try {
			for (;;) {
				const publication = publications.shift();
				if (publication === undefined) {
					break;
				}
				deliver(publication);
			}
		} finally {
			draining = false;
		}
	};

	/**
	 * Emit one event for an operation to the listeners subscribed at this moment.
	 * @param state - The operation state.
	 * @param type - The event type.
	 * @param outcome - The settled outcome, consulted for `failed` events.
	 * @param queue - The queue snapshot to publish as identities.
	 * @param detail - Free text detail, bounded before publication.
	 */
	const emit = (
		state: OperationState,
		type: WorkhorseOperationEvent["type"],
		outcome: WorkhorseOperationDelivery,
		queue: readonly { readonly id: QueuedSubmissionId }[] = [],
		detail: string | null = null,
	): void => {
		const base: EventBase = {
			operation: state.operation,
			queueOperation: state.queueOperation,
			rpc: state.rpc,
			correlation: correlationForState(state),
			queuedSubmissionIds: queueIds(queue),
			detail: detail === null ? null : boundedDetail(detail),
		};
		publications.push({ event: buildEvent(base, type, outcome), cohort: Array.from(listeners) });
		drain();
	};

	/**
	 * Register a listener for later events.
	 * @param listener - The consumer.
	 * @returns A function that removes the listener.
	 */
	const subscribe = (listener: WorkhorseOperationEventListener): (() => void) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	};

	return { listeners, subscribe, emit };
}

export { correlationForState, createEventPublisher };
