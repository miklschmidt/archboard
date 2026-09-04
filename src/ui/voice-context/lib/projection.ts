import type { VoiceSessionView } from "../../voice-session/index.js";
import type {
	VoiceContextCanonicalBrief,
	VoiceContextEntryView,
	VoiceContextFieldView,
	VoiceContextHistoryView,
	VoiceContextLedgerEntry,
	VoiceContextProjectionInput,
	VoiceContextProjectionLimits,
	VoiceContextSessionRecord,
	VoiceContextSessionView,
	VoiceContextStatusTone,
} from "../contract.js";
import { voiceContextSessionKey } from "./history.js";

export const DEFAULT_VOICE_CONTEXT_LIMITS = Object.freeze({
	sessionPageSize: 2,
	entryPageSize: 3,
	bodyWindowCharacters: 180,
}) satisfies VoiceContextProjectionLimits;

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

function positive(candidate: number | undefined, fallback: number): number {
	return Number.isSafeInteger(candidate) && candidate !== undefined && candidate > 0
		? candidate
		: fallback;
}

function page(candidate: number | undefined): number {
	return positive(candidate, 1);
}

function limits(input: VoiceContextProjectionInput): VoiceContextProjectionLimits {
	return Object.freeze({
		sessionPageSize: positive(
			input.limits?.sessionPageSize,
			DEFAULT_VOICE_CONTEXT_LIMITS.sessionPageSize,
		),
		entryPageSize: positive(
			input.limits?.entryPageSize,
			DEFAULT_VOICE_CONTEXT_LIMITS.entryPageSize,
		),
		bodyWindowCharacters: positive(
			input.limits?.bodyWindowCharacters,
			DEFAULT_VOICE_CONTEXT_LIMITS.bodyWindowCharacters,
		),
	});
}

function timestamp(atMs: number): string {
	return new Date(atMs).toISOString();
}

function words(token: string): string {
	return token.replaceAll("_", " ");
}

function nonEmptyText(text: string | null): string {
	return text === null || text.length === 0 ? "None" : text;
}

function visibleText(
	text: string,
	pageNumber: number,
	pageSize: number,
): {
	readonly preview: string;
	readonly remaining: number;
	readonly next: number;
} {
	const characters = [...text];
	const visible = Math.min(characters.length, pageNumber * pageSize);
	const remaining = characters.length - visible;
	return {
		preview: remaining === 0 ? text : `${characters.slice(0, visible).join("")}…`,
		remaining,
		next: Math.min(pageSize, remaining),
	};
}

export function voiceContextEntryExpansionKey(sessionKey: string, entryId: string): string {
	return JSON.stringify([sessionKey, entryId]);
}

function baselineFields(brief: VoiceContextCanonicalBrief): readonly VoiceContextFieldView[] {
	const cursor = brief.cursor;
	return Object.freeze([
		{ label: "Feed", value: brief.feedId, technical: true },
		{ label: "Repository", value: brief.repository, technical: true },
		{ label: "Child", value: nonEmptyText(brief.child.id), technical: true },
		{ label: "Epoch", value: nonEmptyText(brief.child.epoch), technical: true },
		{ label: "Thread link", value: words(brief.threadLink.state), technical: false },
		{
			label: "Thread link reason",
			value: nonEmptyText(brief.threadLink.reason),
			technical: false,
		},
		{ label: "Workhorse", value: nonEmptyText(brief.workhorse.threadId), technical: true },
		{ label: "Workhorse turn", value: nonEmptyText(brief.workhorse.turnId), technical: true },
		{ label: "Coordinator", value: nonEmptyText(brief.coordinator.threadId), technical: true },
		{
			label: "Coordinator realtime",
			value: nonEmptyText(brief.coordinator.realtimeSessionId),
			technical: true,
		},
		{ label: "Board", value: brief.board.key, technical: true },
		{ label: "Board note", value: brief.board.note, technical: true },
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
		{
			label: "Selection",
			value: brief.selection.length === 0 ? "None" : brief.selection.join(", "),
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
		{ label: "Description", value: brief.description || "None", technical: false },
		{
			label: "Freshness",
			value: brief.freshness.state === "fresh" ? "Fresh at capture" : "Stale at capture",
			technical: false,
		},
		{ label: "Captured", value: timestamp(brief.freshness.capturedAtMs), technical: true },
		{ label: "Fresh until", value: timestamp(brief.freshness.freshUntilMs), technical: true },
		{
			label: "Ambiguity",
			value: brief.ambiguity.length === 0 ? "None" : brief.ambiguity.join("; "),
			technical: false,
		},
		{
			label: "Truncation",
			value: brief.truncated ? "Truncated" : "Not truncated",
			technical: false,
		},
		{ label: "Staleness", value: words(brief.staleness.state), technical: false },
		{
			label: "Stale reasons",
			value: brief.staleness.reasons.length === 0 ? "None" : brief.staleness.reasons.join("; "),
			technical: false,
		},
	]);
}

function sourceOrderLabel(entry: VoiceContextLedgerEntry): string {
	const order = entry.sourceOrder;
	return order.kind === "semantic_sequence"
		? `${order.feedId}:${order.sequence}`
		: `${order.ledgerId}:${order.position}`;
}

function attemptFreshness(entry: VoiceContextLedgerEntry): string {
	if (!entry.attempted) return "Not attempted";
	return entry.attemptedAtMs >= entry.freshness.capturedAtMs &&
		entry.attemptedAtMs < entry.freshness.freshUntilMs
		? "Fresh at attempt"
		: "Stale at attempt";
}

function entryView(
	sessionKey: string,
	entry: VoiceContextLedgerEntry,
	input: VoiceContextProjectionInput,
	resolved: VoiceContextProjectionLimits,
): VoiceContextEntryView {
	const expansionKey = voiceContextEntryExpansionKey(sessionKey, entry.id);
	const bodyPage = page(input.entryBodyPages.get(expansionKey));
	const body = visibleText(entry.body, bodyPage, resolved.bodyWindowCharacters);
	return Object.freeze({
		id: entry.id,
		expansionKey,
		kind: entry.kind,
		kindLabel: ENTRY_LABELS[entry.kind],
		sourceOrderLabel: sourceOrderLabel(entry),
		capturedAt: timestamp(entry.freshness.capturedAtMs),
		freshUntil: timestamp(entry.freshness.freshUntilMs),
		attemptedAt: timestamp(entry.attemptedAtMs),
		attemptLabel: entry.attempted ? "Attempted" : "Not attempted",
		freshnessLabel: attemptFreshness(entry),
		outcome: entry.outcome,
		outcomeLabel: OUTCOME_LABELS[entry.outcome],
		reason: entry.reason ?? "No reason reported",
		body: entry.body,
		bodyLabel: entry.outcome === "delivered" ? "Exact delivered body" : "Exact attempted body",
		bodyPreview: body.preview,
		bodyPage,
		bodyRemainingCharacters: body.remaining,
		nextBodyCharacters: body.next,
		provenanceLabel: entry.provenance === "recovered" ? "Recovered history" : "Live record",
		disconnected: entry.connection === "disconnected",
		connectionLabel:
			entry.connection === "disconnected"
				? "Recorded while disconnected"
				: "Recorded while connected",
	});
}

function statusTone(view: VoiceSessionView, replaced: boolean): VoiceContextStatusTone {
	if (replaced) return "warning";
	if (view.status === "failed") return "destructive";
	if (view.status === "listening" || view.status === "agent_speaking") return "status";
	if (
		[
			"requesting_permission",
			"negotiating",
			"muted",
			"processing",
			"recovering",
			"stopping",
		].includes(view.status)
	)
		return "warning";
	return "quiet";
}

function briefNarration(brief: VoiceContextCanonicalBrief): { label: string; detail: string } {
	const stale = brief.freshness.state === "stale" || brief.staleness.state === "stale";
	const reasons = brief.staleness.reasons.join(" ");
	return stale
		? {
				label: "Stale brief",
				detail: `${brief.freshness.state === "stale" ? "Its captured freshness window had expired. " : ""}${reasons || "No stale reason was reported."}`,
			}
		: {
				label: "Captured brief",
				detail: "This is the exact semantic context captured for the session.",
			};
}

function sessionView(
	record: VoiceContextSessionRecord,
	input: VoiceContextProjectionInput,
	resolved: VoiceContextProjectionLimits,
): VoiceContextSessionView {
	const capturedSession = record.captured.session;
	if (capturedSession.binding === null || capturedSession.sessionId === null)
		throw new TypeError("Voice context history contains unbound captured evidence.");
	const key = voiceContextSessionKey(capturedSession);
	const latest = record.observations.at(-1)?.session ?? capturedSession;
	const replaced = latest.failure?.code === "replaced";
	const statusLabel = replaced ? "Replaced" : latest.label;
	const statusDetail =
		latest.status === "stopped"
			? `${latest.detail} Its captured baseline and ledger remain available.`
			: latest.detail;
	const briefNarrated = briefNarration(record.captured.brief);
	const briefPage = page(input.briefPages.get(key));
	const canonical = visibleText(
		record.captured.canonicalBrief,
		briefPage,
		resolved.bodyWindowCharacters,
	);
	const entryPage = page(input.entryPages.get(key));
	const visibleEntries = Math.min(record.entries.length, entryPage * resolved.entryPageSize);
	const entries = record.entries.slice(record.entries.length - visibleEntries);
	return Object.freeze({
		key,
		binding: capturedSession.binding,
		sessionId: capturedSession.sessionId,
		heading: `Voice session ${capturedSession.sessionId}`,
		status: latest.status,
		statusLabel,
		statusDetail,
		statusTone: statusTone(latest, replaced),
		replaced,
		briefLabel: briefNarrated.label,
		briefDetail: briefNarrated.detail,
		provenanceLabel:
			record.captured.provenance === "recovered" ? "Recovered history" : "Live session",
		fields: baselineFields(record.captured.brief),
		canonicalBrief: record.captured.canonicalBrief,
		canonicalBriefPreview: canonical.preview,
		canonicalBriefPage: briefPage,
		canonicalBriefRemainingCharacters: canonical.remaining,
		nextCanonicalBriefCharacters: canonical.next,
		entries: Object.freeze(entries.map((entry) => entryView(key, entry, input, resolved))),
		entryCount: record.entries.length,
		entryPage,
		hiddenEntryCount: record.entries.length - visibleEntries,
		nextEntryCount: Math.min(resolved.entryPageSize, record.entries.length - visibleEntries),
	});
}

export function projectVoiceContext(input: VoiceContextProjectionInput): VoiceContextHistoryView {
	const resolved = limits(input);
	const sessionPage = page(input.sessionPage);
	const newestFirst = input.snapshot.sessions.toReversed();
	const visibleSessions = Math.min(newestFirst.length, sessionPage * resolved.sessionPageSize);
	const sessions = newestFirst.slice(0, visibleSessions);
	return Object.freeze({
		sessions: Object.freeze(sessions.map((session) => sessionView(session, input, resolved))),
		sessionCount: newestFirst.length,
		sessionPage,
		hiddenSessionCount: newestFirst.length - visibleSessions,
		nextSessionCount: Math.min(resolved.sessionPageSize, newestFirst.length - visibleSessions),
	});
}
