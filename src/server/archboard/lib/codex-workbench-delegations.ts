// Which voice coordinator turn delegated each workhorse turn (TASK-319).
//
// The workbench shows a delegated workhorse turn with where it came from. The only place that
// knows is the operation that started it, which names both turns, so a tab session keeps what
// those operations said, and the projection reads it back when it shows the workhorse's turns.

import type { TurnId } from "@/shared/codex-workbench-identity";
import type {
	WorkhorseOperationCorrelation,
	WorkhorseOperationEvent,
} from "@/runtime/codex-workhorse-operations";

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

export { MAX_DELEGATIONS, recordDelegations, type DelegationEvent };
