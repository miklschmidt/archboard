import type { BrowserSnapshot } from "../../../shared/codex-browser-model/index.js";

import type {
	WorkbenchQueueAvailability,
	WorkbenchQueueCorrelation,
	WorkbenchQueueEntry,
	WorkbenchQueueEntryView,
	WorkbenchQueueProjectionInput,
	WorkbenchQueueState,
	WorkbenchQueueView,
} from "./contract.js";
import { isCoordinatorOwned } from "./reorder.js";
import {
	childIdentityOf,
	isSettledEntryStatus,
	isStaleWorkbenchQueueState,
	resolveWorkbenchQueueState,
	WORKBENCH_QUEUE_ENTRY_STATUS_LABELS,
	WORKBENCH_QUEUE_NARRATIVES,
} from "./state.js";

const ENABLED = Object.freeze({ enabled: true, reason: null }) satisfies WorkbenchQueueAvailability;

function disabled(reason: string): WorkbenchQueueAvailability {
	return Object.freeze({ enabled: false, reason });
}

function summarize(prompt: string): string {
	const collapsed = prompt.replaceAll(/\s+/gu, " ").trim();
	return collapsed.length > 72 ? `${collapsed.slice(0, 71)}…` : collapsed;
}

function activeTurn(
	snapshot: BrowserSnapshot | null,
): NonNullable<BrowserSnapshot["timeline"]>["turns"][number] | null {
	const turns = snapshot?.timeline?.turns ?? [];
	return turns.findLast((turn) => turn.status === "inProgress") ?? turns.at(-1) ?? null;
}

function pendingApprovals(snapshot: BrowserSnapshot | null): number {
	if (snapshot === null) return 0;
	const threadId = snapshot.threadLink.threadId;
	return snapshot.approvals.filter(
		(approval) => approval.threadId === threadId && approval.lifecycle.state === "pending",
	).length;
}

function correlationSummary(
	state: WorkbenchQueueState,
	correlation: Omit<WorkbenchQueueCorrelation, "summary">,
	entryCount: number,
): string {
	const workhorse =
		correlation.workhorseThreadId === null
			? "no linked workhorse"
			: `workhorse thread ${correlation.workhorseThreadId}`;
	const turn =
		correlation.activeTurnId === null
			? "no workhorse turn on record"
			: `turn ${correlation.activeTurnId} (${correlation.activeTurnStatus ?? "unknown"})`;
	const coordinator =
		correlation.coordinatorThreadId === null
			? "no coordinator thread"
			: `coordinator thread ${correlation.coordinatorThreadId}`;
	const submissions = entryCount === 1 ? "1 submission" : `${entryCount} submissions`;
	return `${WORKBENCH_QUEUE_NARRATIVES[state].label}: ${submissions} on ${workhorse}, ${turn}, queued through ${coordinator}.`;
}

function projectCorrelation(
	state: WorkbenchQueueState,
	snapshot: BrowserSnapshot | null,
	sequence: number | null,
	entryCount: number,
): WorkbenchQueueCorrelation {
	const turn = activeTurn(snapshot);
	const base = {
		linkState: snapshot?.threadLink.state ?? null,
		workhorseThreadId: snapshot?.threadLink.threadId ?? null,
		workhorseThreadStatus: snapshot?.threadLink.status ?? null,
		child: childIdentityOf(snapshot?.threadLink ?? null),
		activeTurnId: turn?.turnId ?? null,
		activeTurnStatus: turn?.status ?? null,
		coordinatorThreadId: snapshot?.coordinator.threadId ?? null,
		coordinatorState: snapshot?.coordinator.state ?? null,
		blockingApprovals: pendingApprovals(snapshot),
		sequence,
	} satisfies Omit<WorkbenchQueueCorrelation, "summary">;
	return Object.freeze({ ...base, summary: correlationSummary(state, base, entryCount) });
}

/**
 * The one reason that disables every queue command at once. It is deliberately
 * separate from a per-entry reason: a person reading "the queue is stale" and a
 * person reading "that submission is already running" need different sentences.
 */
function regionBlock(
	input: WorkbenchQueueProjectionInput,
	state: WorkbenchQueueState,
): string | null {
	if (isStaleWorkbenchQueueState(state)) return WORKBENCH_QUEUE_NARRATIVES[state].recovery;
	if (state === "unavailable") return WORKBENCH_QUEUE_NARRATIVES.unavailable.recovery;
	if (input.targetBlock != null) return input.targetBlock;
	if (!input.capabilities.connected) return "The workbench socket is not connected.";
	if (input.capabilities.readiness !== "thread_capable")
		return "The workbench is not thread-capable yet, so it holds no command lease for this queue.";
	if (input.pending != null)
		return `A ${input.pending.control} command is in flight; its outcome is not settled yet.`;
	return null;
}

function commandAvailability(
	input: WorkbenchQueueProjectionInput,
	block: string | null,
	command: "queueAdd" | "queueUpdate" | "queueDelete" | "queueReorder" | "queueStart",
	unsupported: string,
): WorkbenchQueueAvailability {
	if (block !== null) return disabled(block);
	if (!input.capabilities.supportsCommand(command)) return disabled(unsupported);
	return ENABLED;
}

function entryCorrelation(
	entry: WorkbenchQueueEntry,
	correlation: WorkbenchQueueCorrelation,
): string {
	const workhorse =
		correlation.workhorseThreadId === null
			? "no linked workhorse"
			: `workhorse ${correlation.workhorseThreadId}`;
	if (entry.status === "running")
		return `Running on ${workhorse} as ${correlation.activeTurnId ?? "an unnamed turn"}.`;
	if (entry.status === "approval_blocked")
		return `Held on ${workhorse} behind ${correlation.blockingApprovals} pending approval request(s).`;
	if (entry.operationId === null)
		return `Queued on ${workhorse} outside this coordinator; Archboard did not queue it.`;
	return `Queued on ${workhorse} by coordinator operation ${entry.operationId}.`;
}

function entryBlock(entry: WorkbenchQueueEntry): string | null {
	if (entry.status === "running")
		return "This submission is already running on the linked workhorse.";
	if (isSettledEntryStatus(entry.status))
		return "This submission already settled; it is history, not queued work.";
	return null;
}

interface EntryContext {
	readonly input: WorkbenchQueueProjectionInput;
	readonly block: string | null;
	readonly correlation: WorkbenchQueueCorrelation;
	readonly ownedSlots: readonly number[];
	readonly total: number;
}

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
	const foreign = "Only a submission this coordinator queued can be reordered.";
	const alone = "There is no other coordinator-owned submission to move this one past.";
	const move = (edge: boolean, reason: string): WorkbenchQueueAvailability => {
		if (block !== null) return disabled(block);
		if (!owned) return disabled(foreign);
		if (context.ownedSlots.length < 2) return disabled(alone);
		if (edge) return disabled(reason);
		if (!context.input.capabilities.supportsCommand("queueReorder"))
			return disabled("The host is not accepting queue reorder commands for this link.");
		return ENABLED;
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
		edit: commandAvailability(
			context.input,
			block,
			"queueUpdate",
			"The host is not accepting queue update commands for this link.",
		),
		cancel: commandAvailability(
			context.input,
			block,
			"queueDelete",
			"The host is not accepting queue delete commands for this link.",
		),
		start: commandAvailability(
			context.input,
			block,
			"queueStart",
			"The host is not accepting queue start commands for this link.",
		),
		moveEarlier: move(
			ownedIndex === 0,
			"This submission is already the first coordinator-owned entry.",
		),
		moveLater: move(
			ownedIndex === context.ownedSlots.length - 1,
			"This submission is already the last coordinator-owned entry.",
		),
	});
}

/**
 * Project the authoritative workbench state into everything the queue region
 * renders. Nothing here reads a local optimistic order or a guessed outcome:
 * the entries are the host's entries, in the host's order.
 */
export function projectWorkbenchQueue(input: WorkbenchQueueProjectionInput): WorkbenchQueueView {
	const snapshot = input.state.snapshot;
	const state = resolveWorkbenchQueueState(input);
	const entries = snapshot?.queue.entries ?? [];
	const correlation = projectCorrelation(state, snapshot, input.state.sequence, entries.length);
	const block = regionBlock(input, state);
	const ownedSlots: number[] = [];
	for (const [index, entry] of entries.entries())
		if (isCoordinatorOwned(entry)) ownedSlots.push(index);
	const context: EntryContext = {
		input,
		block,
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
		add: commandAvailability(
			input,
			block,
			"queueAdd",
			"The host is not accepting queue add commands for this link.",
		),
		// Refreshing is how every unavailable, stale, reconnecting, restarted, and
		// unknown state recovers, so it stays reachable whenever a socket exists.
		list:
			input.state.connection === "stopped"
				? disabled("The workbench has no socket to read an authoritative queue from.")
				: ENABLED,
		reorder:
			ownedSlots.length < 2
				? disabled("There is no other coordinator-owned submission to move one past.")
				: commandAvailability(
						input,
						block,
						"queueReorder",
						"The host is not accepting queue reorder commands for this link.",
					),
		stale: isStaleWorkbenchQueueState(state),
		pending: input.pending ?? null,
		settlement: input.settlement ?? null,
	});
}
