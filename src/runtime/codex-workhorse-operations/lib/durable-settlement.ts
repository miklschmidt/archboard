import type { EpochConfirmation } from "@/runtime/codex-epoch";
import type { WorkhorseOperationOptions } from "@/runtime/codex-workhorse-operations/lib/contract";
import type {
	OperationState,
	SettledDelivery,
} from "@/runtime/codex-workhorse-operations/lib/internal";

/**
 * The exact evidence recorded with an outcome: which workhorse thread and turn it concerns.
 * @param state - The operation state.
 * @returns The epoch confirmation.
 */
function confirmationFor(state: OperationState): EpochConfirmation {
	return {
		threadId: state.workhorseThreadId,
		turnId: state.turnId,
		threadSource: state.workhorseThreadSource,
	};
}

/**
 * Upgrade an already-settled unknown outcome to delivered when exact evidence arrives later,
 * for example a turn notification correlated to the operation's client identity.
 * @param options - The operation options holding the epoch store.
 * @param state - The settled operation state.
 * @param requested - The outcome the caller now has evidence for.
 * @returns The outcome the state carries after the attempt.
 */
function confirmSettled(
	options: WorkhorseOperationOptions,
	state: OperationState,
	requested: SettledDelivery,
): SettledDelivery {
	if (state.outcome === "outcome_unknown" && requested === "delivered") {
		try {
			options.epoch.confirmOutcome(state.transaction, confirmationFor(state));
			state.outcome = "delivered";
		} catch {
			/* Exact evidence can be retried on a later notification. */
		}
	}
	/* A settled state always carries a settled outcome; the fallback only keeps the type honest. */
	return state.outcome === "pending" ? "outcome_unknown" : state.outcome;
}

/**
 * Record the requested outcome on the staged transaction.
 * @param options - The operation options holding the epoch store.
 * @param state - The operation state.
 * @param requested - The outcome to record.
 * @param detail - The reason recorded with a rollback or unknown outcome.
 */
function recordSettlement(
	options: WorkhorseOperationOptions,
	state: OperationState,
	requested: SettledDelivery,
	detail: string | null,
): void {
	if (requested === "delivered") {
		options.epoch.commitOperation(state.transaction, confirmationFor(state));
		return;
	}
	if (requested === "not_delivered") {
		options.epoch.rollbackOperation(state.transaction, detail ?? "operation was not delivered");
		return;
	}
	options.epoch.markOutcomeUnknown(
		state.transaction,
		detail ?? "operation outcome is unknown",
		confirmationFor(state),
	);
}

/**
 * Settle an operation's outcome durably exactly once. When the durable write itself fails
 * the outcome becomes unknown, because a second remote attempt is forbidden and the epoch
 * store must not claim more than it recorded.
 * @param options - The operation options holding the epoch store.
 * @param state - The operation state.
 * @param requested - The outcome the caller observed.
 * @param detail - The reason recorded with a rollback or unknown outcome.
 * @returns The outcome the state carries afterwards.
 */
function settleDurable(
	options: WorkhorseOperationOptions,
	state: OperationState,
	requested: SettledDelivery,
	detail: string | null,
): SettledDelivery {
	if (state.durableSettled) {
		return confirmSettled(options, state, requested);
	}
	let outcome = requested;
	try {
		recordSettlement(options, state, requested, detail);
	} catch {
		outcome = "outcome_unknown";
		try {
			options.epoch.markOutcomeUnknown(
				state.transaction,
				"The remote operation settled but durable outcome confirmation failed.",
				confirmationFor(state),
			);
		} catch {
			/* A second remote attempt remains forbidden. */
		}
	}
	state.outcome = outcome;
	state.durableSettled = true;
	return outcome;
}

export { settleDurable };
