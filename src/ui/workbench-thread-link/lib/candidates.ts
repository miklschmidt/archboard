// The pane's thread-link selection. Every classification fact comes from the
// host record unchanged: this module runs no second classifier, joins no
// list, infers no thread from recency, and loads nothing. It decides only
// which separate command a row would run and whether that command is offered.

import type { BrowserThreadLink } from "@/shared/codex-browser-model";
import type { ThreadId } from "@/shared/codex-workbench-identity";
import type {
	ThreadLinkInventory,
	ThreadLinkInventoryRecord,
	ThreadLinkListedStatus,
	ThreadLinkRecovery,
	ThreadLinkRow,
	ThreadLinkRowIntent,
	ThreadLinkSelection,
} from "@/ui/workbench-thread-link/contracts";
import type { WorkbenchTransportCapabilities } from "@/ui/workbench-thread-link/transport-port";

/**
 * The reason codes the host classifier publishes on a listed record. Anything
 * outside this vocabulary is shown verbatim rather than translated, so a Codex
 * or classifier change cannot be silently relabelled here.
 */
const REASON_LABELS: ReadonlyMap<string, string> = new Map([
	["stale_child", "Stale: this thread belongs to a child that is no longer the current one."],
	["prior_epoch", "This conversation belongs to an earlier agent session."],
	[
		"thread_start_outcome_unknown",
		"The thread start never settled, so its ownership is unknown. Inspect it rather than retrying.",
	],
	["unknown_provenance", "Current-epoch ownership of this thread is unproven."],
	["thread_list_missing", "No persisted record for this thread was found in the exhausted list."],
	["thread_list_ambiguous", "The exhausted persisted list holds conflicting rows for this thread."],
	[
		"thread_loaded_list_ambiguous",
		"The exhausted loaded list holds a duplicate or conflicting membership for this thread.",
	],
	["thread_source_custom", "This thread was created by a custom source, not the app server."],
	["thread_source_subagent", "This thread belongs to a sub-agent, not the workhorse."],
	["thread_source_unknown", "This thread's source is unknown."],
	[
		"thread_status_not_loaded",
		"This thread is not loaded, and Archboard never loads one implicitly.",
	],
	["thread_status_system_error", "Codex reports a system error on this thread."],
	["thread_loaded_list_missing", "This thread is absent from the exhausted current loaded list."],
	["direct_input_false", "Codex reports that this thread does not accept direct input."],
	["direct_input_unknown", "Codex did not report whether this thread accepts direct input."],
]);

const SOURCE_LABELS = {
	standard: "Standard app-server thread",
	subagent: "Sub-agent thread",
	custom: "Custom-source thread",
	unknown: "Unknown source",
} as const satisfies Record<ThreadLinkInventoryRecord["sourcePresentation"], string>;

const STATUS_LABELS = {
	notLoaded: "Not loaded",
	idle: "Idle",
	active: "Active",
	systemError: "System error",
} as const satisfies Record<ThreadLinkListedStatus, string>;

/** Which command a row would run, and why. */
interface RowIntent {
	readonly intent: ThreadLinkRowIntent;
	readonly command: ThreadLinkRow["command"];
}

/**
 * The words for a classifier reason.
 * @param reason The host's reason code, or none.
 * @param fallback The words when the host named none.
 * @returns The label, or the code verbatim when it is not in the vocabulary.
 */
function threadLinkReasonLabel(reason: string | null | undefined, fallback: string): string {
	if (reason === null || reason === undefined) {
		return fallback;
	}
	return REASON_LABELS.get(reason) ?? reason;
}

/**
 * The recovery that reloads the inventory.
 * @param capabilities The transport capabilities.
 * @returns The recovery.
 */
function refreshInventoryRecovery(
	capabilities: WorkbenchTransportCapabilities,
): ThreadLinkRecovery {
	const available = capabilities.supportsCommand("threadLinkRefresh");
	return Object.freeze({
		intent: "refresh_inventory",
		label: "Refresh conversations",
		description: available
			? "Load the available conversations."
			: "Reconnect and sign in before refreshing conversations.",
		owner: available ? "transport" : "none",
		available,
	});
}

/**
 * Which command a row would run: none for the current link, attach on an
 * unbound pane, relink otherwise.
 * @param currentLink The pane's current link.
 * @param threadId The row's thread.
 * @returns The intent and command.
 */
function intentOf(currentLink: BrowserThreadLink, threadId: ThreadId): RowIntent {
	if (currentLink.threadId === threadId) {
		return { intent: "current", command: null };
	}
	if (currentLink.state === "unbound") {
		return { intent: "attach", command: "threadLinkAttach" };
	}
	return { intent: "relink", command: "threadLinkRelink" };
}

/**
 * The words for a record's controllability.
 * @param value The host's direct-input fact.
 * @returns The label.
 */
function controllabilityLabel(value: boolean | null): string {
	if (value === true) {
		return "Accepts direct input";
	}
	return value === false ? "Does not accept direct input" : "Direct-input capability unknown";
}

/**
 * Why a row is not offered, if it is not.
 * @param intent The row's intent.
 * @param supported Whether the transport accepts the row's command.
 * @returns The reason, or null.
 */
function rowBlock(intent: ThreadLinkRowIntent, supported: boolean): string | null {
	if (intent === "current") {
		return "This conversation is already connected.";
	}
	return supported ? null : "Reconnect and sign in before connecting this conversation.";
}

/**
 * The reason label of one record.
 * @param record The record.
 * @returns The label.
 */
function recordReason(record: ThreadLinkInventoryRecord): string {
	return threadLinkReasonLabel(
		record.reason,
		record.state === "executable"
			? "Classified executable against the current child epoch."
			: "The host did not name a reason for this classification.",
	);
}

/**
 * One record as a row.
 * @param record The host's record.
 * @param currentLink The pane's current link.
 * @param capabilities The transport capabilities.
 * @returns The row.
 */
function projectRow(
	record: ThreadLinkInventoryRecord,
	currentLink: BrowserThreadLink,
	capabilities: WorkbenchTransportCapabilities,
): ThreadLinkRow {
	const { intent, command } = intentOf(currentLink, record.threadId);
	const supported = command !== null && capabilities.supportsCommand(command);
	const blockedReason = rowBlock(intent, supported);
	return Object.freeze({
		selectionId: record.selectionId,
		threadId: record.threadId,
		intent,
		outcome: record.state,
		command,
		stateLabel: record.state === "executable" ? "Executable" : "Inspect-only",
		sourceLabel: SOURCE_LABELS[record.sourcePresentation],
		statusLabel: STATUS_LABELS[record.status],
		loadedLabel: record.loaded
			? "Loaded in the current child"
			: "Not loaded; binding it never loads it",
		controllabilityLabel: controllabilityLabel(record.canAcceptDirectInput),
		reasonLabel: recordReason(record),
		enabled: supported && blockedReason === null,
		blockedReason,
	});
}

/**
 * The words for a listed inventory.
 * @param count How many rows.
 * @param truncated Whether the host published only the first page.
 * @returns The summary.
 */
function summarize(count: number, truncated: boolean): string {
	if (count === 0) {
		return "No conversations are available. Start an agent to begin a new one.";
	}
	const noun = count === 1 ? "conversation" : "conversations";
	return `${count} ${noun}.${truncated ? " Showing the first page." : ""}`;
}

/** What the selection projection reads. */
interface SelectionInput {
	readonly inventory: ThreadLinkInventory;
	readonly currentLink: BrowserThreadLink;
	readonly capabilities: WorkbenchTransportCapabilities;
}

/**
 * The pane's thread-link selection.
 * @param input The inventory, the current link and the capabilities.
 * @returns The selection.
 */
function projectThreadLinkSelection(input: SelectionInput): ThreadLinkSelection {
	const recovery = refreshInventoryRecovery(input.capabilities);
	const { inventory } = input;
	if (inventory.state === "unknown") {
		return Object.freeze({
			state: "unknown",
			summary: "Refresh to load your conversations.",
			rows: Object.freeze([]),
			recovery,
		});
	}
	if (inventory.state === "unavailable") {
		return Object.freeze({
			state: "unavailable",
			summary: inventory.reason,
			rows: Object.freeze([]),
			recovery,
		});
	}
	// Duplicate rows are impossible on this wire: the host dedupes by thread and
	// the shared schema rejects a repeated selection outright.
	const rows = inventory.records.map((record) =>
		projectRow(record, input.currentLink, input.capabilities),
	);
	return Object.freeze({
		state: rows.length === 0 ? "empty" : "listed",
		summary: summarize(rows.length, inventory.truncated),
		rows: Object.freeze(rows),
		recovery,
	});
}

export { projectThreadLinkSelection, threadLinkReasonLabel, type SelectionInput };
