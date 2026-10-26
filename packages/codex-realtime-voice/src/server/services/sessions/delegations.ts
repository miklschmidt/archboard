// Which voice coordinator turn delegated each workhorse turn, and which conversation each
// coordinator turn shows in.
//
// The workbench shows a delegated workhorse turn with where it came from. The only place that
// knows is the operation that started it, which names both turns, so a tab session keeps what
// those operations said, and the projection reads it back when it shows the workhorse's turns.
//
// A tab shows one workhorse's conversation, and the coordinator's turns are shown beside it. A
// coordinator turn belongs with the workhorses it gave work to, and a turn that gave none with the
// conversation the tab showed when it started, so the session keeps both for each turn.

import type { TransportServerNotification } from "@archboard/codex-app-server/transport";
import type { TrustedIdentityDecoder, TurnId } from "@archboard/codex-app-server/identity";
import type {
	WorkhorseOperationCorrelation,
	WorkhorseOperationEvent,
} from "#runtime/protocol/workhorse-operations/contract.ts";

/** The part of an operation event the record is made from. */
interface DelegationEvent {
	readonly operation: WorkhorseOperationEvent["operation"];
	readonly correlation: Pick<WorkhorseOperationCorrelation, "turnId" | "coordinatorTurnId">;
}

/** How many delegations one tab session remembers; the oldest is forgotten first. */
const MAX_DELEGATIONS = 256;

/**
 * A listener for a tab session's workhorse operations that records each delegate's turn against
 * the coordinator turn that asked for it. A steer is not recorded: it adds to a turn the user or
 * an earlier delegate started, and does not make that turn the coordinator's.
 * @param delegations The session's record, workhorse turn to the coordinator turn; added to.
 * @returns The listener.
 */
function recordDelegations(delegations: Map<TurnId, TurnId>): (event: DelegationEvent) => void {
	return (event) => {
		const { turnId, coordinatorTurnId } = event.correlation;
		if (event.operation !== "delegate_to_workhorse" || turnId === null) {
			return;
		}
		delegations.delete(turnId);
		delegations.set(turnId, coordinatorTurnId);
		const oldest = delegations.keys().next();
		if (delegations.size > MAX_DELEGATIONS && !oldest.done) {
			delegations.delete(oldest.value);
		}
	};
}

/**
 * Where one coordinator turn shows: the conversation the tab showed when it started, and
 * the checkouts whose workhorses it gave work to.
 */
interface CoordinatorTurnHome {
	/** The checkout the tab showed when the turn started, or null when it showed none yet. */
	shownAtStart: string | null;
	/** The checkouts whose workhorses the turn delegated to, steered or queued work for. */
	readonly gaveWorkTo: Set<string>;
}

/** The part of an operation event that says whether it gave a workhorse work. */
interface GivenWorkEvent {
	readonly operation: WorkhorseOperationEvent["operation"];
	readonly queueOperation: WorkhorseOperationEvent["queueOperation"];
	readonly outcome: WorkhorseOperationEvent["outcome"];
	readonly correlation: Pick<WorkhorseOperationCorrelation, "coordinatorTurnId">;
}

/**
 * The record of one coordinator turn, made the first time it is asked for; the oldest record goes
 * once a session holds more than it remembers.
 * @param homes The session's records.
 * @param turnId The coordinator turn.
 * @returns Its record.
 */
function homeOf(homes: Map<TurnId, CoordinatorTurnHome>, turnId: TurnId): CoordinatorTurnHome {
	const known = homes.get(turnId);
	if (known !== undefined) {
		return known;
	}
	const home: CoordinatorTurnHome = { shownAtStart: null, gaveWorkTo: new Set() };
	homes.set(turnId, home);
	const oldest = homes.keys().next();
	if (homes.size > MAX_DELEGATIONS && !oldest.done) {
		homes.delete(oldest.value);
	}
	return home;
}

/**
 * Whether an operation event gave a workhorse work: a delegation, a steer, or a queued prompt added
 * or started, that reached the workhorse or may have. An operation is accepted before it is
 * delivered, and one refused then gave nothing.
 * @param event The event.
 * @returns True when it did.
 */
function givesWork(event: GivenWorkEvent): boolean {
	if (event.outcome === "pending" || event.outcome === "not_delivered") {
		return false;
	}
	// Every operation but the queue's is a delegation or a steer.
	return (
		event.operation !== "manage_workhorse_queue" ||
		event.queueOperation === "add" ||
		event.queueOperation === "start"
	);
}

/**
 * A listener for one workhorse's operations that records each coordinator turn that gave it work.
 * @param homes The session's records; added to.
 * @param checkout The workhorse's checkout.
 * @returns The listener.
 */
function recordGivenWork(
	homes: Map<TurnId, CoordinatorTurnHome>,
	checkout: string,
): (event: GivenWorkEvent) => void {
	return (event) => {
		if (givesWork(event)) {
			homeOf(homes, event.correlation.coordinatorTurnId).gaveWorkTo.add(checkout);
		}
	};
}

/**
 * Record the conversation a tab showed when one of its coordinator's turns started.
 * @param homes The session's records; added to.
 * @param event A notification on a thread of the tab's coordinator.
 * @param decoder Names turns as Codex spells them.
 * @param shown The checkout the tab shows now, or null.
 */
function noteCoordinatorTurnStart(
	homes: Map<TurnId, CoordinatorTurnHome>,
	event: TransportServerNotification,
	decoder: Pick<TrustedIdentityDecoder, "adoptTurnId">,
	shown: () => string | null,
): void {
	const { notification } = event;
	if (notification.method === "turn/started") {
		homeOf(homes, decoder.adoptTurnId(notification.params.turn.id)).shownAtStart = shown();
	}
}

/**
 * Which coordinator turns one conversation shows. A turn that gave work shows in the conversations
 * of the workhorses it gave work to; one that gave none shows in the conversation shown when it
 * started; a turn the session has no record of shows in whatever conversation is shown.
 * @param homes The session's records.
 * @param checkout The checkout of the conversation.
 * @returns Whether the conversation shows a turn.
 */
function coordinatorTurnsShownIn(
	homes: ReadonlyMap<TurnId, CoordinatorTurnHome>,
	checkout: string,
): (turnId: TurnId) => boolean {
	return (turnId) => {
		const home = homes.get(turnId);
		if (home === undefined) {
			return true;
		}
		if (home.gaveWorkTo.size > 0) {
			return home.gaveWorkTo.has(checkout);
		}
		return home.shownAtStart === null || home.shownAtStart === checkout;
	};
}

export {
	coordinatorTurnsShownIn,
	MAX_DELEGATIONS,
	noteCoordinatorTurnStart,
	recordDelegations,
	recordGivenWork,
	type CoordinatorTurnHome,
	type DelegationEvent,
};
