// The labelled fields of a captured brief, the bounded text windows, and the
// words for one later entry. Every value here is derived from the exact
// captured bytes; nothing is re-read from a live source.

import type {
	VoiceContextCanonicalBrief,
	VoiceContextEntryView,
	VoiceContextFieldView,
	VoiceContextLedgerEntry,
	VoiceContextProjectionInput,
	VoiceContextProjectionLimits,
} from "@/ui/voice-context/contract";

const ENTRY_LABELS = {
	semantic: "Semantic",
	focus: "Focus",
	selection: "Selection",
	callback: "Callback",
} as const;

const OUTCOME_LABELS = {
	delivered: "Delivered",
	not_delivered: "Not delivered",
	outcome_unknown: "Outcome unknown",
} as const;

/** One bounded window over a text. */
interface TextWindow {
	readonly preview: string;
	readonly page: number;
	readonly start: number;
	readonly end: number;
	readonly total: number;
	readonly previous: number;
	readonly remaining: number;
	readonly next: number;
}

/**
 * A page number: a positive safe integer, else the first page.
 * @param candidate The requested page.
 * @returns The page.
 */
function page(candidate: number | undefined): number {
	return candidate !== undefined && Number.isSafeInteger(candidate) && candidate > 0
		? candidate
		: 1;
}

/**
 * An ISO timestamp.
 * @param atMs The instant.
 * @returns The timestamp.
 */
function timestamp(atMs: number): string {
	return new Date(atMs).toISOString();
}

/**
 * A snake_case token as words.
 * @param token The token.
 * @returns The words.
 */
function words(token: string): string {
	return token.replaceAll("_", " ");
}

/**
 * A text, or "None" when absent or empty.
 * @param text The text.
 * @returns The text or "None".
 */
function nonEmptyText(text: string | null): string {
	return text === null || text.length === 0 ? "None" : text;
}

/**
 * A list joined, or "None" when empty.
 * @param items The items.
 * @param separator The separator.
 * @returns The joined items or "None".
 */
function listText(items: readonly string[], separator: string): string {
	return items.length === 0 ? "None" : items.join(separator);
}

/**
 * One window of a text, by code point.
 * @param text The text.
 * @param pageNumber The requested page.
 * @param pageSize Characters per page.
 * @returns The window.
 */
function visibleText(text: string, pageNumber: number, pageSize: number): TextWindow {
	const characters = Array.from(text);
	const pageCount = Math.max(1, Math.ceil(characters.length / pageSize));
	const resolvedPage = Math.min(pageNumber, pageCount);
	const start = (resolvedPage - 1) * pageSize;
	const end = Math.min(characters.length, start + pageSize);
	const remaining = characters.length - end;
	return {
		preview: characters.slice(start, end).join(""),
		page: resolvedPage,
		start,
		end,
		total: characters.length,
		previous: Math.min(pageSize, start),
		remaining,
		next: Math.min(pageSize, remaining),
	};
}

/**
 * The key one entry's expansion state is stored under.
 * @param sessionKey The session key.
 * @param entryId The entry id.
 * @returns The expansion key.
 */
function voiceContextEntryExpansionKey(sessionKey: string, entryId: string): string {
	return JSON.stringify([sessionKey, entryId]);
}

/**
 * The identity fields of a brief.
 * @param brief The brief.
 * @returns The fields.
 */
function identityFields(brief: VoiceContextCanonicalBrief): readonly VoiceContextFieldView[] {
	return [
		{ label: "Feed", value: brief.feedId, technical: true },
		{ label: "Repository", value: brief.repository, technical: true },
		{ label: "Child", value: nonEmptyText(brief.child.id), technical: true },
		{ label: "Epoch", value: nonEmptyText(brief.child.epoch), technical: true },
		{ label: "Thread link", value: words(brief.threadLink.state), technical: false },
		{ label: "Thread link reason", value: nonEmptyText(brief.threadLink.reason), technical: false },
		{ label: "Workhorse", value: nonEmptyText(brief.workhorse.threadId), technical: true },
		{ label: "Workhorse turn", value: nonEmptyText(brief.workhorse.turnId), technical: true },
		{ label: "Coordinator", value: nonEmptyText(brief.coordinator.threadId), technical: true },
		{
			label: "Coordinator realtime",
			value: nonEmptyText(brief.coordinator.realtimeSessionId),
			technical: true,
		},
	];
}

/**
 * The board and pane fields of a brief.
 * @param brief The brief.
 * @returns The fields.
 */
function boardFields(brief: VoiceContextCanonicalBrief): readonly VoiceContextFieldView[] {
	const { cursor } = brief;
	return [
		{ label: "Board", value: brief.board.name, technical: false },
		{ label: "Board key", value: brief.board.key, technical: true },
		{ label: "Board document", value: brief.board.file, technical: true },
		{ label: "Pane", value: brief.pane.paneId, technical: true },
		{
			label: "Focused at capture",
			value: brief.pane.focused ? "Focused" : "Not focused",
			technical: false,
		},
		{
			label: "Version",
			value: brief.version === null ? "None" : String(brief.version),
			technical: true,
		},
		{ label: "Claim", value: words(brief.claim.holder), technical: false },
		{ label: "Claim doing", value: nonEmptyText(brief.claim.doing), technical: false },
		{ label: "Doing", value: nonEmptyText(brief.doing), technical: false },
		{
			label: "Cursor",
			value: cursor === null ? "None" : `${cursor.feedId}:${cursor.sequence}`,
			technical: true,
		},
	];
}

/** One selected subject, as the brief carries it. */
type BriefSubject = VoiceContextCanonicalBrief["architecture"]["selection"]["subjects"][number];

/**
 * One subject as a person reads it: what it is called, or its identity when it
 * has no name of its own.
 * @param subject The subject.
 * @returns The text.
 */
function subjectText(subject: BriefSubject): string {
	return `${words(subject.kind)} ${subject.name ?? subject.id}`;
}

/** What the brief says was picked out. */
type BriefSelection = VoiceContextCanonicalBrief["architecture"]["selection"];

/**
 * What was picked out, as a person reads it.
 *
 * The count decides, never the length of the list. A brief under byte pressure
 * drops subjects, and a panel reading "None" off an emptied list would say
 * nobody had selected anything at the moment somebody had selected too much to
 * carry.
 * @param selection What the brief says was picked out.
 * @returns The text.
 */
function pickedText(selection: BriefSelection): string {
	const { count, subjects } = selection;
	if (count === 0) {
		return "None";
	}
	if (subjects.length === 0) {
		return `${count} selected, not listed here`;
	}
	const listed = subjects.map(subjectText).join(", ");
	return count > subjects.length ? `${listed}, and ${count - subjects.length} more` : listed;
}

/**
 * What the pane was reading when the brief was captured: which architectural
 * state, through which view, with what picked out, what it differs from and
 * what it is waiting on.
 *
 * This is the half of a brief that says what an agent was actually talking
 * about, so none of it is marked technical except the identities: a person
 * reading their own voice history wants "Queued ingest, draft" and not an id.
 * @param brief The brief.
 * @returns The fields.
 */
function architectureFields(brief: VoiceContextCanonicalBrief): readonly VoiceContextFieldView[] {
	const { variant, view, differences, reconciliation, selection } = brief.architecture;
	return [
		{
			label: "Variant",
			value: variant === null ? "None" : `${variant.name} (${words(variant.lifecycle)})`,
			technical: false,
		},
		{ label: "Variant id", value: variant === null ? "None" : variant.id, technical: true },
		{
			label: "View",
			value: view === null ? "Whole variant" : `${view.name} (${words(view.grammar)})`,
			technical: false,
		},
		{ label: "Selection", value: pickedText(selection), technical: false },
		{
			label: "Selected ids",
			value: listText(
				selection.subjects.map((subject) => subject.id),
				", ",
			),
			technical: true,
		},
		{
			label: "Differences",
			value:
				differences === null
					? "No predecessor"
					: `${differences.added} added, ${differences.removed} removed, ${differences.changed} changed`,
			technical: false,
		},
		{ label: "Reconciliation", value: settlingText(reconciliation), technical: false },
	];
}

/** What the brief says a variant is waiting on. */
type BriefReconciliation = VoiceContextCanonicalBrief["architecture"]["reconciliation"];

/**
 * What a variant is waiting on, as a person reads it.
 *
 * The count decides what this says, never the length of the list: a brief under
 * byte pressure drops its issues first, and a panel that read "Nothing to
 * settle" off an emptied list would be telling somebody the opposite of the
 * truth at exactly the moment the truth was too long to fit. So a dropped list
 * says how many there were and that they did not fit.
 * @param reconciliation What the brief says the variant is waiting on.
 * @returns The text.
 */
function settlingText(reconciliation: BriefReconciliation): string {
	const { required, count, blockedBy, issues } = reconciliation;
	const waiting = blockedBy === null ? "" : `; waiting on ${blockedBy}`;
	if (!required && count === 0) {
		return "Nothing to settle";
	}
	if (issues.length === 0) {
		return `${count} to settle, not listed here${waiting}`;
	}
	const listed = issues.map((issue) => `${issue.what}: ${words(issue.kind)}`).join("; ");
	const more = count > issues.length ? `, and ${count - issues.length} more not listed` : "";
	return `${listed}${more}${waiting}`;
}

/**
 * The description and freshness fields of a brief.
 * @param brief The brief.
 * @returns The fields.
 */
function freshnessFields(brief: VoiceContextCanonicalBrief): readonly VoiceContextFieldView[] {
	return [
		{ label: "Description", value: nonEmptyText(brief.description), technical: false },
		{
			label: "Freshness",
			value: brief.freshness.state === "fresh" ? "Fresh at capture" : "Stale at capture",
			technical: false,
		},
		{ label: "Captured", value: timestamp(brief.freshness.capturedAtMs), technical: true },
		{ label: "Fresh until", value: timestamp(brief.freshness.freshUntilMs), technical: true },
		{ label: "Ambiguity", value: listText(brief.ambiguity, "; "), technical: false },
		{
			label: "Truncation",
			value: brief.truncated ? "Truncated" : "Not truncated",
			technical: false,
		},
		{ label: "Staleness", value: words(brief.staleness.state), technical: false },
		{ label: "Stale reasons", value: listText(brief.staleness.reasons, "; "), technical: false },
	];
}

/**
 * Every labelled field of a brief, derived from the exact captured bytes.
 * @param brief The brief.
 * @returns The fields.
 */
function baselineFields(brief: VoiceContextCanonicalBrief): readonly VoiceContextFieldView[] {
	return Object.freeze([
		...identityFields(brief),
		...boardFields(brief),
		...architectureFields(brief),
		...freshnessFields(brief),
	]);
}

/**
 * The source order of an entry as a label.
 * @param entry The entry.
 * @returns The label.
 */
function sourceOrderLabel(entry: VoiceContextLedgerEntry): string {
	const order = entry.sourceOrder;
	return order.kind === "semantic_sequence"
		? `${order.feedId}:${order.sequence}`
		: `${order.ledgerId}:${order.position}`;
}

/**
 * Whether the delivery was attempted inside the entry's freshness window.
 * @param entry The entry.
 * @returns The freshness words.
 */
function attemptFreshness(entry: VoiceContextLedgerEntry): string {
	if (!entry.attempted) {
		return "Not attempted";
	}
	const fresh =
		entry.attemptedAtMs >= entry.freshness.capturedAtMs &&
		entry.attemptedAtMs < entry.freshness.freshUntilMs;
	return fresh ? "Fresh at attempt" : "Stale at attempt";
}

/**
 * The label for an entry's body.
 * @param entry The entry.
 * @returns The label.
 */
function bodyLabel(entry: VoiceContextLedgerEntry): string {
	if (entry.outcome === "delivered") {
		return "Exact delivered body";
	}
	return entry.attempted ? "Exact attempted body" : "Exact prepared body";
}

/**
 * One entry as projected.
 * @param sessionKey The session key.
 * @param entry The entry.
 * @param input The projection input.
 * @param limits The resolved limits.
 * @returns The entry view.
 */
function entryView(
	sessionKey: string,
	entry: VoiceContextLedgerEntry,
	input: VoiceContextProjectionInput,
	limits: VoiceContextProjectionLimits,
): VoiceContextEntryView {
	const expansionKey = voiceContextEntryExpansionKey(sessionKey, entry.id);
	const body = visibleText(
		entry.body,
		page(input.entryBodyPages.get(expansionKey)),
		limits.bodyWindowCharacters,
	);
	const disconnected = entry.connection === "disconnected";
	return Object.freeze({
		id: entry.id,
		expansionKey,
		kind: entry.kind,
		kindLabel: ENTRY_LABELS[entry.kind],
		sourceOrderLabel: sourceOrderLabel(entry),
		capturedAt: timestamp(entry.freshness.capturedAtMs),
		freshUntil: timestamp(entry.freshness.freshUntilMs),
		attemptedAt: entry.attemptedAtMs === null ? null : timestamp(entry.attemptedAtMs),
		attemptLabel: entry.attempted ? "Attempted" : "Not attempted",
		freshnessLabel: attemptFreshness(entry),
		outcome: entry.outcome,
		outcomeLabel: OUTCOME_LABELS[entry.outcome],
		reason: entry.reason ?? "No reason reported",
		body: entry.body,
		bodyLabel: bodyLabel(entry),
		bodyPreview: body.preview,
		bodyPage: body.page,
		bodyWindowStart: body.start,
		bodyWindowEnd: body.end,
		bodyTotalCharacters: body.total,
		previousBodyCharacters: body.previous,
		bodyRemainingCharacters: body.remaining,
		nextBodyCharacters: body.next,
		provenanceLabel: entry.provenance === "recovered" ? "Recovered history" : "Live record",
		disconnected,
		connectionLabel: disconnected ? "Recorded while disconnected" : "Recorded while connected",
	});
}

export {
	baselineFields,
	entryView,
	page,
	visibleText,
	voiceContextEntryExpansionKey,
	type TextWindow,
};
