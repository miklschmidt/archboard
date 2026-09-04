import type { BrowserThreadLink } from "../../../shared/codex-browser-model/index.js";
import type { ThreadId } from "../../../shared/codex-workbench-identity/index.js";

import type {
	BrowserWorkbenchCapabilities,
	ThreadLinkExcludedRow,
	ThreadLinkInventory,
	ThreadLinkInventoryRecord,
	ThreadLinkListedStatus,
	ThreadLinkRecovery,
	ThreadLinkRow,
	ThreadLinkRowIntent,
	ThreadLinkSelection,
} from "./contract.js";

/**
 * The reason codes the host classifier publishes on a listed record. Anything
 * outside this vocabulary is shown verbatim rather than translated, so a Codex
 * or classifier change cannot be silently relabelled here.
 */
const REASON_LABELS: Readonly<Record<string, string>> = {
	stale_child: "Stale: this thread belongs to a child that is no longer the current one.",
	prior_epoch: "Prior epoch: this thread was bound in an epoch before the current one.",
	thread_start_outcome_unknown:
		"The thread start never settled, so its ownership is unknown. Inspect it rather than retrying.",
	unknown_provenance: "Current-epoch ownership of this thread is unproven.",
	thread_list_missing: "No persisted record for this thread was found in the exhausted list.",
	thread_list_ambiguous: "The exhausted persisted list holds conflicting rows for this thread.",
	thread_loaded_list_ambiguous:
		"The exhausted loaded list holds a duplicate or conflicting membership for this thread.",
	thread_source_custom: "This thread was created by a custom source, not the app server.",
	thread_source_subagent: "This thread belongs to a sub-agent, not the workhorse.",
	thread_source_unknown: "This thread's source is unknown.",
	thread_status_not_loaded: "This thread is not loaded, and Archboard never loads one implicitly.",
	thread_status_system_error: "Codex reports a system error on this thread.",
	thread_loaded_list_missing: "This thread is absent from the exhausted current loaded list.",
	direct_input_false: "Codex reports that this thread does not accept direct input.",
	direct_input_unknown: "Codex did not report whether this thread accepts direct input.",
};

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

const DUPLICATE_EXPLANATION =
	"Excluded: the workbench published this thread more than once, so no single row can be bound.";

export function threadLinkReasonLabel(reason: string | null | undefined, fallback: string): string {
	if (reason === null || reason === undefined) return fallback;
	return REASON_LABELS[reason] ?? reason;
}

function refreshInventoryRecovery(capabilities: BrowserWorkbenchCapabilities): ThreadLinkRecovery {
	const available = capabilities.supportsCommand("threadLinkRefresh");
	return Object.freeze({
		intent: "refresh_inventory",
		label: "Refresh the thread list",
		description: available
			? "Ask the workbench to exhaust the persisted and current loaded lists again, then choose a row from the fresh result."
			: "The workbench cannot discover the thread lists until this pane is connected, signed in, thread-capable, and holding an active command lease.",
		owner: available ? "transport" : "none",
		available,
	});
}

function intentOf(
	currentLink: BrowserThreadLink,
	threadId: ThreadId,
): { readonly intent: ThreadLinkRowIntent; readonly command: ThreadLinkRow["command"] } {
	if (currentLink.threadId === threadId) return { intent: "current", command: null };
	if (currentLink.state === "unbound") return { intent: "attach", command: "threadLinkAttach" };
	return { intent: "relink", command: "threadLinkRelink" };
}

function controllabilityLabel(value: boolean | null): string {
	if (value === true) return "Accepts direct input";
	if (value === false) return "Does not accept direct input";
	return "Direct-input capability unknown";
}

function projectRow(
	record: ThreadLinkInventoryRecord,
	currentLink: BrowserThreadLink,
	capabilities: BrowserWorkbenchCapabilities,
): ThreadLinkRow {
	const { intent, command } = intentOf(currentLink, record.threadId);
	const supported = command !== null && capabilities.supportsCommand(command);
	const blockedReason =
		intent === "current"
			? "This pane is already linked to this thread."
			: supported
				? null
				: "This pane cannot run a thread-link command until it is connected, signed in, thread-capable, and holding an active command lease.";
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
		reasonLabel: threadLinkReasonLabel(
			record.reason,
			record.state === "executable"
				? "Classified executable against the current child epoch."
				: "The host did not name a reason for this classification.",
		),
		enabled: supported && blockedReason === null,
		blockedReason,
	});
}

function summarize(rows: readonly ThreadLinkRow[], excluded: number, truncated: boolean): string {
	const executable = rows.filter((row) => row.outcome === "executable").length;
	const parts = [
		`${rows.length} joined ${rows.length === 1 ? "record" : "records"}`,
		`${executable} executable`,
		`${rows.length - executable} inspect-only`,
	];
	if (excluded > 0) parts.push(`${excluded} excluded`);
	if (truncated) parts.push("the workbench published only the first page of a longer list");
	return `${parts.join(", ")}.`;
}

/**
 * Present the pane's thread-link selection. Every classification fact comes
 * from the host record unchanged: this module runs no second classifier, joins
 * no list, infers no thread from recency, and loads nothing. It decides only
 * which separate command a row would run and whether that command is offered.
 */
export function projectThreadLinkSelection(input: {
	readonly inventory: ThreadLinkInventory;
	readonly currentLink: BrowserThreadLink;
	readonly capabilities: BrowserWorkbenchCapabilities;
}): ThreadLinkSelection {
	const recovery = refreshInventoryRecovery(input.capabilities);
	if (input.inventory.state === "unknown")
		return Object.freeze({
			state: "unknown",
			summary:
				"No thread list has been discovered for this pane. Nothing is chosen for you: refresh the list, or create a workhorse thread.",
			rows: Object.freeze([]),
			excluded: Object.freeze([]),
			recovery,
		});
	if (input.inventory.state === "unavailable")
		return Object.freeze({
			state: "unavailable",
			summary: input.inventory.reason,
			rows: Object.freeze([]),
			excluded: Object.freeze([]),
			recovery,
		});
	const counts = new Map<ThreadId, number>();
	for (const record of input.inventory.records)
		counts.set(record.threadId, (counts.get(record.threadId) ?? 0) + 1);
	const rows: ThreadLinkRow[] = [];
	const excluded: ThreadLinkExcludedRow[] = [];
	for (const record of input.inventory.records) {
		// The host dedupes by thread, so this is a refusal rather than a rule: two
		// rows that name one thread are indistinguishable to a person, and the
		// module will not pick one of them on their behalf.
		if ((counts.get(record.threadId) ?? 0) > 1) {
			excluded.push(
				Object.freeze({
					selectionId: record.selectionId,
					threadId: record.threadId,
					exclusion: "duplicate_row",
					explanation: DUPLICATE_EXPLANATION,
				}),
			);
			continue;
		}
		rows.push(projectRow(record, input.currentLink, input.capabilities));
	}
	return Object.freeze({
		state: rows.length === 0 ? "empty" : "listed",
		summary:
			rows.length === 0 && excluded.length === 0
				? "The workbench discovered no joined thread. Create a workhorse thread, or refresh the list."
				: summarize(rows, excluded.length, input.inventory.truncated),
		rows: Object.freeze(rows),
		excluded: Object.freeze(excluded),
		recovery,
	});
}
