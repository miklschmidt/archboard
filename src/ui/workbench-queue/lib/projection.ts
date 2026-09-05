// Project the authoritative workbench state into everything the queue region
// renders. Nothing here reads a local optimistic order or a guessed outcome:
// the entries are the host's entries, in the host's order.

import type {
	WorkbenchQueueAvailability,
	WorkbenchQueueProjectionInput,
	WorkbenchQueueState,
	WorkbenchQueueView,
} from "@/ui/workbench-queue/contracts";
import { projectCorrelation } from "@/ui/workbench-queue/lib/correlation";
import {
	commandAvailability,
	disabled,
	ENABLED,
	projectEntry,
	type EntryContext,
} from "@/ui/workbench-queue/lib/entry-projection";
import { WORKBENCH_QUEUE_NARRATIVES } from "@/ui/workbench-queue/lib/narratives";
import { isCoordinatorOwned } from "@/ui/workbench-queue/lib/reorder";
import {
	isStaleWorkbenchQueueState,
	resolveWorkbenchQueueState,
} from "@/ui/workbench-queue/lib/state";
import type { WorkbenchTransportCapabilities } from "@/ui/workbench-queue/transport-port";

/**
 * The reason the transport's capabilities cannot carry a queue command, if any.
 * @param capabilities The transport capabilities.
 * @returns The reason, or null.
 */
function capabilityBlock(capabilities: WorkbenchTransportCapabilities): string | null {
	if (!capabilities.connected) {
		return "The workbench socket is not connected.";
	}
	if (capabilities.readiness !== "thread_capable") {
		return "The workbench is not thread-capable yet, so it holds no command lease for this queue.";
	}
	return null;
}

/**
 * The reason the transport cannot carry a queue command right now, if any.
 * @param input The projection input.
 * @returns The reason, or null.
 */
function transportBlock(input: WorkbenchQueueProjectionInput): string | null {
	if (input.targetBlock !== null && input.targetBlock !== undefined) {
		return input.targetBlock;
	}
	const capability = capabilityBlock(input.capabilities);
	if (capability !== null) {
		return capability;
	}
	if (input.pending !== null && input.pending !== undefined) {
		return `A ${input.pending.control} command is in flight; its outcome is not settled yet.`;
	}
	return null;
}

/**
 * The one reason that disables every queue command at once. It is
 * deliberately separate from a per-entry reason: a person reading "the queue
 * is stale" and a person reading "that submission is already running" need
 * different sentences.
 * @param input The projection input.
 * @param state The governing state.
 * @returns The reason, or null.
 */
function regionBlock(
	input: WorkbenchQueueProjectionInput,
	state: WorkbenchQueueState,
): string | null {
	if (isStaleWorkbenchQueueState(state)) {
		return WORKBENCH_QUEUE_NARRATIVES[state].recovery;
	}
	if (state === "unavailable") {
		return WORKBENCH_QUEUE_NARRATIVES.unavailable.recovery;
	}
	return transportBlock(input);
}

/**
 * Whether the whole queue may be reordered.
 * @param context What every entry shares.
 * @returns The availability.
 */
function reorderAvailability(context: EntryContext): WorkbenchQueueAvailability {
	if (context.ownedSlots.length < 2) {
		return disabled("There is no other coordinator-owned submission to move one past.");
	}
	return commandAvailability(context.input, context.block, "queueReorder");
}

/**
 * Whether the authoritative list can be re-read. Refreshing is how every
 * unavailable, stale, reconnecting, restarted and unknown state recovers, so
 * it stays reachable whenever a socket exists.
 * @param input The projection input.
 * @returns The availability.
 */
function listAvailability(input: WorkbenchQueueProjectionInput): WorkbenchQueueAvailability {
	return input.state.connection === "stopped"
		? disabled("The workbench has no socket to read an authoritative queue from.")
		: ENABLED;
}

/**
 * Everything the queue region renders.
 * @param input The projection input.
 * @returns The view.
 */
function projectWorkbenchQueue(input: WorkbenchQueueProjectionInput): WorkbenchQueueView {
	const snapshot = input.state.snapshot;
	const state = resolveWorkbenchQueueState(input);
	const entries = snapshot?.queue.entries ?? [];
	const correlation = projectCorrelation(state, snapshot, input.state.sequence, entries.length);
	const ownedSlots = entries.flatMap((entry, index) => (isCoordinatorOwned(entry) ? [index] : []));
	const context: EntryContext = {
		input,
		block: regionBlock(input, state),
		correlation,
		ownedSlots,
		total: entries.length,
	};
	const narrative = WORKBENCH_QUEUE_NARRATIVES[state];
	return Object.freeze({
		state,
		label: narrative.label,
		detail: narrative.detail,
		recovery: narrative.recovery,
		correlation,
		entries: Object.freeze(entries.map((entry, index) => projectEntry(entry, index, context))),
		coordinatorOwnedCount: ownedSlots.length,
		foreignCount: entries.length - ownedSlots.length,
		add: commandAvailability(input, context.block, "queueAdd"),
		list: listAvailability(input),
		reorder: reorderAvailability(context),
		stale: isStaleWorkbenchQueueState(state),
		pending: input.pending ?? null,
		settlement: input.settlement ?? null,
	});
}

export { projectWorkbenchQueue };
