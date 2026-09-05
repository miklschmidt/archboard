// One entry as the host holds it, with what this pane may do to it and why
// each unavailable control is unavailable.

import type {
	WorkbenchQueueAvailability,
	WorkbenchQueueCorrelation,
	WorkbenchQueueEntry,
	WorkbenchQueueEntryView,
	WorkbenchQueueProjectionInput,
} from "@/ui/workbench-queue/contracts";
import { WORKBENCH_QUEUE_ENTRY_STATUS_LABELS } from "@/ui/workbench-queue/lib/narratives";
import { isCoordinatorOwned } from "@/ui/workbench-queue/lib/reorder";
import { isSettledEntryStatus } from "@/ui/workbench-queue/lib/state";
import type { QueueCommandName } from "@/ui/workbench-queue/transport-port";

const ENABLED: WorkbenchQueueAvailability = Object.freeze({ enabled: true, reason: null });

const UNSUPPORTED = {
	queueAdd: "The host is not accepting queue add commands for this link.",
	queueUpdate: "The host is not accepting queue update commands for this link.",
	queueDelete: "The host is not accepting queue delete commands for this link.",
	queueReorder: "The host is not accepting queue reorder commands for this link.",
	queueStart: "The host is not accepting queue start commands for this link.",
} as const satisfies Record<QueueCommandName, string>;

const FOREIGN = "Only a submission this coordinator queued can be reordered.";
const ALONE = "There is no other coordinator-owned submission to move this one past.";
const FIRST = "This submission is already the first coordinator-owned entry.";
const LAST = "This submission is already the last coordinator-owned entry.";

/** What every entry projection shares. */
interface EntryContext {
	readonly input: WorkbenchQueueProjectionInput;
	/** The one reason that disables every command at once, or null. */
	readonly block: string | null;
	readonly correlation: WorkbenchQueueCorrelation;
	readonly ownedSlots: readonly number[];
	readonly total: number;
}

/**
 * A disabled control with its reason.
 * @param reason Why the control is unavailable.
 * @returns The availability.
 */
function disabled(reason: string): WorkbenchQueueAvailability {
	return Object.freeze({ enabled: false, reason });
}

/**
 * Whether a command is offered: not while the region is blocked, and only
 * when the host accepts it for this link.
 * @param input The projection input.
 * @param block The region or entry block, or null.
 * @param command The gateway command.
 * @returns The availability.
 */
function commandAvailability(
	input: WorkbenchQueueProjectionInput,
	block: string | null,
	command: QueueCommandName,
): WorkbenchQueueAvailability {
	if (block !== null) {
		return disabled(block);
	}
	return input.capabilities.supportsCommand(command) ? ENABLED : disabled(UNSUPPORTED[command]);
}

/**
 * The prompt's first words, on one line.
 * @param prompt The queued prompt.
 * @returns At most 72 characters.
 */
function summarize(prompt: string): string {
	const collapsed = prompt.replaceAll(/\s+/gu, " ").trim();
	return collapsed.length > 72 ? `${collapsed.slice(0, 71)}…` : collapsed;
}

/**
 * How this entry relates to the linked workhorse right now.
 * @param entry The entry.
 * @param correlation The queue's correlation.
 * @returns A sentence.
 */
function entryCorrelation(
	entry: WorkbenchQueueEntry,
	correlation: WorkbenchQueueCorrelation,
): string {
	const workhorse =
		correlation.workhorseThreadId === null
			? "no linked workhorse"
			: `workhorse ${correlation.workhorseThreadId}`;
	if (entry.status === "running") {
		return `Running on ${workhorse} as ${correlation.activeTurnId ?? "an unnamed turn"}.`;
	}
	if (entry.status === "approval_blocked") {
		return `Held on ${workhorse} behind ${correlation.blockingApprovals} pending approval request(s).`;
	}
	if (entry.operationId === null) {
		return `Queued on ${workhorse} outside this coordinator. This pane can still edit, cancel or start it; only submissions this coordinator queued can be reordered.`;
	}
	return `Queued on ${workhorse} by coordinator operation ${entry.operationId}. This pane can edit, cancel, start and reorder it.`;
}

/**
 * The reason an entry's own status disables its commands, if it does.
 * @param entry The entry.
 * @returns The reason, or null.
 */
function entryBlock(entry: WorkbenchQueueEntry): string | null {
	if (entry.status === "running") {
		return "This submission is already running on the linked workhorse.";
	}
	if (isSettledEntryStatus(entry.status)) {
		return "This submission already settled; it is history, not queued work.";
	}
	return null;
}

/** What one move needs to know. */
interface MoveFacts {
	readonly block: string | null;
	readonly owned: boolean;
	readonly ownedCount: number;
	readonly edge: string | null;
	readonly supported: boolean;
}

/**
 * Whether a move in one direction is offered.
 * @param facts The move facts.
 * @returns The availability.
 */
function moveAvailability(facts: MoveFacts): WorkbenchQueueAvailability {
	if (facts.block !== null) {
		return disabled(facts.block);
	}
	if (!facts.owned) {
		return disabled(FOREIGN);
	}
	if (facts.ownedCount < 2) {
		return disabled(ALONE);
	}
	if (facts.edge !== null) {
		return disabled(facts.edge);
	}
	return facts.supported ? ENABLED : disabled(UNSUPPORTED.queueReorder);
}

/**
 * One entry as the region renders it.
 * @param entry The entry.
 * @param index Its 0-based position.
 * @param context What every entry shares.
 * @returns The entry view.
 */
function projectEntry(
	entry: WorkbenchQueueEntry,
	index: number,
	context: EntryContext,
): WorkbenchQueueEntryView {
	const owned = isCoordinatorOwned(entry);
	const block = context.block ?? entryBlock(entry);
	const ownershipLabel = owned ? "Coordinator" : "Foreign";
	const position = index + 1;
	const ownedIndex = context.ownedSlots.indexOf(index);
	const move = {
		block,
		owned,
		ownedCount: context.ownedSlots.length,
		supported: context.input.capabilities.supportsCommand("queueReorder"),
	};
	return Object.freeze({
		submissionId: entry.submissionId,
		prompt: entry.prompt,
		status: entry.status,
		statusLabel: WORKBENCH_QUEUE_ENTRY_STATUS_LABELS[entry.status],
		position,
		total: context.total,
		ownership: owned ? "coordinator" : "foreign",
		ownershipLabel,
		coordinatorOperationId: entry.operationId,
		label: `${ownershipLabel} submission ${position} of ${context.total}: ${summarize(entry.prompt)}`,
		correlation: entryCorrelation(entry, context.correlation),
		edit: commandAvailability(context.input, block, "queueUpdate"),
		cancel: commandAvailability(context.input, block, "queueDelete"),
		start: commandAvailability(context.input, block, "queueStart"),
		moveEarlier: moveAvailability({ ...move, edge: ownedIndex === 0 ? FIRST : null }),
		moveLater: moveAvailability({
			...move,
			edge: ownedIndex === context.ownedSlots.length - 1 ? LAST : null,
		}),
	});
}

export { commandAvailability, disabled, ENABLED, projectEntry, type EntryContext };
