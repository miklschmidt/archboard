import type { BrowserThreadLink } from "../../../shared/codex-browser-model/index.js";
import type { ThreadId } from "../../../shared/codex-workbench-identity/index.js";

import type {
	BrowserWorkbenchCapabilities,
	ThreadLinkExcludedRow,
	ThreadLinkExclusion,
	ThreadLinkInventory,
	ThreadLinkInventoryRecord,
	ThreadLinkListedStatus,
	ThreadLinkRecovery,
	ThreadLinkRow,
	ThreadLinkRowIntent,
	ThreadLinkRowOutcome,
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
} as const satisfies Record<ThreadLinkInventoryRecord["source"], string>;

const STATUS_LABELS = {
	notLoaded: "Not loaded",
	idle: "Idle",
	active: "Active",
	systemError: "System error",
} as const satisfies Record<ThreadLinkListedStatus, string>;

const EXCLUSION_EXPLANATIONS = {
	not_persisted:
		"Excluded: no row for this thread survived the exhausted persisted list, so it is not a joined record.",
	persisted_ambiguous:
		"Excluded: the exhausted persisted list holds more than one row for this thread, so the join is ambiguous.",
	loaded_ambiguous:
		"Excluded: this record's loaded membership contradicts the exhausted current loaded list.",
	duplicate_row:
		"Excluded: the inventory offered this thread more than once, so no single row can be bound.",
} as const satisfies Record<ThreadLinkExclusion, string>;

export function threadLinkReasonLabel(reason: string | null, fallback: string): string {
	if (reason === null) return fallback;
	return REASON_LABELS[reason] ?? reason;
}

function refreshInventoryRecovery(hostCanRefresh: boolean): ThreadLinkRecovery {
	return Object.freeze({
		intent: "refresh_inventory",
		label: "Refresh the thread list",
		description: hostCanRefresh
			? "Discover the persisted and current loaded lists again, then choose a row from the fresh result."
			: "This pane has no thread-list owner attached, so the list cannot be discovered again from here.",
		owner: hostCanRefresh ? "host" : "none",
		available: hostCanRefresh,
	});
}

/**
 * A record joins only when exactly one exhausted persisted row produced it and
 * its loaded membership agrees with the exhausted current loaded list.
 */
function exclusionOf(
	record: ThreadLinkInventoryRecord,
	duplicated: boolean,
): ThreadLinkExclusion | null {
	if (duplicated) return "duplicate_row";
	if (record.persistedRows === 0) return "not_persisted";
	if (record.persistedRows > 1) return "persisted_ambiguous";
	if (record.loadedOccurrences > 1) return "loaded_ambiguous";
	if (record.loaded !== (record.loadedOccurrences === 1)) return "loaded_ambiguous";
	return null;
}

/** Executable is a claim about six facts; a record that contradicts one is not one. */
function outcomeOf(record: ThreadLinkInventoryRecord): {
	readonly outcome: ThreadLinkRowOutcome;
	readonly contradiction: string | null;
} {
	if (record.state !== "executable") return { outcome: "inspect_only", contradiction: null };
	if (record.source !== "standard")
		return {
			outcome: "inspect_only",
			contradiction: "The record claims executable from a non-standard source.",
		};
	if (record.status === "notLoaded" || record.status === "systemError")
		return {
			outcome: "inspect_only",
			contradiction: `The record claims executable while its status is ${STATUS_LABELS[record.status].toLowerCase()}.`,
		};
	if (!record.loaded)
		return {
			outcome: "inspect_only",
			contradiction: "The record claims executable while it is not loaded.",
		};
	if (record.canAcceptDirectInput !== true)
		return {
			outcome: "inspect_only",
			contradiction: "The record claims executable without a confirmed direct-input capability.",
		};
	return { outcome: "executable", contradiction: null };
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
	const { outcome, contradiction } = outcomeOf(record);
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
		outcome,
		command,
		stateLabel: outcome === "executable" ? "Executable" : "Inspect-only",
		sourceLabel: SOURCE_LABELS[record.source],
		statusLabel: STATUS_LABELS[record.status],
		loadedLabel: record.loaded
			? "Loaded in the current child"
			: "Not loaded; binding it never loads it",
		controllabilityLabel: controllabilityLabel(record.canAcceptDirectInput),
		reasonLabel:
			contradiction ??
			threadLinkReasonLabel(
				record.reason,
				outcome === "executable"
					? "Classified executable against the current child epoch."
					: "The host did not name a reason for this classification.",
			),
		enabled: supported && blockedReason === null,
		blockedReason,
		persistedRows: record.persistedRows,
		loadedOccurrences: record.loadedOccurrences,
	});
}

function summarize(rows: readonly ThreadLinkRow[], excluded: number, exhausted: boolean): string {
	const executable = rows.filter((row) => row.outcome === "executable").length;
	const parts = [
		`${rows.length} joined ${rows.length === 1 ? "record" : "records"}`,
		`${executable} executable`,
		`${rows.length - executable} inspect-only`,
	];
	if (excluded > 0) parts.push(`${excluded} excluded`);
	if (!exhausted)
		parts.push("the host did not exhaust both lists in one generation, so this list is partial");
	return `${parts.join(", ")}.`;
}

/**
 * Project the pane's thread-link selection. Nothing here infers a thread from
 * recency, loads a thread, or binds one: it discloses what each joined record
 * is and which separate command that record would run.
 */
export function projectThreadLinkSelection(input: {
	readonly inventory: ThreadLinkInventory;
	readonly currentLink: BrowserThreadLink;
	readonly capabilities: BrowserWorkbenchCapabilities;
	readonly hostCanRefresh: boolean;
}): ThreadLinkSelection {
	const recovery = refreshInventoryRecovery(input.hostCanRefresh);
	if (input.inventory.state === "loading")
		return Object.freeze({
			state: "loading",
			summary: "Discovering the persisted and current loaded thread lists.",
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
		const exclusion = exclusionOf(record, (counts.get(record.threadId) ?? 0) > 1);
		if (exclusion === null) {
			rows.push(projectRow(record, input.currentLink, input.capabilities));
			continue;
		}
		excluded.push(
			Object.freeze({
				selectionId: record.selectionId,
				threadId: record.threadId,
				exclusion,
				explanation: EXCLUSION_EXPLANATIONS[exclusion],
			}),
		);
	}
	return Object.freeze({
		state: rows.length === 0 ? "empty" : "listed",
		summary:
			rows.length === 0 && excluded.length === 0
				? "No persisted thread joined the current loaded list. Create a workhorse thread, or refresh the list."
				: summarize(rows, excluded.length, input.inventory.exhausted),
		rows: Object.freeze(rows),
		excluded: Object.freeze(excluded),
		recovery,
	});
}
