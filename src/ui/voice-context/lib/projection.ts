import type {
	VoiceContextBriefCondition,
	VoiceContextEntryView,
	VoiceContextFieldView,
	VoiceContextHistoryView,
	VoiceContextLedgerEntry,
	VoiceContextProjectionInput,
	VoiceContextProjectionLimits,
	VoiceContextSessionRecord,
	VoiceContextSessionStatus,
	VoiceContextSessionView,
} from "../contract.js";
import { voiceContextIdentityKey } from "./history.js";

export const DEFAULT_VOICE_CONTEXT_LIMITS = Object.freeze({
	collapsedSessions: 2,
	collapsedEntries: 3,
	collapsedBodyCharacters: 180,
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

function safeLimit(candidate: number | undefined, fallback: number): number {
	return Number.isSafeInteger(candidate) && candidate !== undefined && candidate > 0
		? candidate
		: fallback;
}

function limits(input: VoiceContextProjectionInput): VoiceContextProjectionLimits {
	return Object.freeze({
		collapsedSessions: safeLimit(
			input.limits?.collapsedSessions,
			DEFAULT_VOICE_CONTEXT_LIMITS.collapsedSessions,
		),
		collapsedEntries: safeLimit(
			input.limits?.collapsedEntries,
			DEFAULT_VOICE_CONTEXT_LIMITS.collapsedEntries,
		),
		collapsedBodyCharacters: safeLimit(
			input.limits?.collapsedBodyCharacters,
			DEFAULT_VOICE_CONTEXT_LIMITS.collapsedBodyCharacters,
		),
	});
}

function timestamp(atMs: number): string {
	return new Date(atMs).toISOString();
}

function words(token: string): string {
	return token.replaceAll("_", " ");
}

function preview(
	text: string,
	maximum: number,
): { readonly text: string; readonly truncated: boolean } {
	const characters = [...text];
	if (characters.length <= maximum) return { text, truncated: false };
	return { text: `${characters.slice(0, maximum).join("")}…`, truncated: true };
}

export function voiceContextEntryExpansionKey(sessionKey: string, entryId: string): string {
	return JSON.stringify([sessionKey, entryId]);
}

function statusView(status: VoiceContextSessionStatus): {
	readonly label: string;
	readonly detail: string;
} {
	switch (status.state) {
		case "active":
			return { label: "Active", detail: `Started ${timestamp(status.startedAtMs)}.` };
		case "stopped":
			return {
				label: "Stopped",
				detail: `Stopped ${timestamp(status.stoppedAtMs)}. Its captured baseline and ledger remain available.`,
			};
		case "replaced":
			return {
				label: "Replaced",
				detail: `Replaced ${timestamp(status.replacedAtMs)} by realtime session ${status.replacedBy.realtimeSessionId}.`,
			};
	}
}

function briefView(condition: VoiceContextBriefCondition): {
	readonly label: string;
	readonly detail: string;
} {
	if (condition.state === "current")
		return {
			label: "Captured brief",
			detail: "This is the exact context captured when this session started.",
		};
	return {
		label: "Stale brief",
		detail: `Marked stale ${timestamp(condition.markedAtMs)}. ${condition.reasons.join(" ") || "No reason was reported."}`,
	};
}

function nonEmptyText(text: string | null): string {
	return text === null || text.length === 0 ? "None" : text;
}

function fields(session: VoiceContextSessionRecord): readonly VoiceContextFieldView[] {
	const { brief, identity } = session;
	const cursor = brief.cursor;
	return Object.freeze([
		{ label: "Repository", value: brief.repository, technical: true },
		{ label: "Child", value: identity.childId, technical: true },
		{ label: "Epoch", value: identity.epoch, technical: true },
		{ label: "Workhorse", value: identity.workhorseThreadId, technical: true },
		{ label: "Coordinator", value: identity.coordinatorThreadId, technical: true },
		{ label: "Realtime session", value: identity.realtimeSessionId, technical: true },
		{ label: "Board", value: brief.board.key, technical: true },
		{ label: "Board note", value: brief.board.note, technical: true },
		{ label: "Pane", value: identity.paneId, technical: true },
		{
			label: "Version",
			value: brief.version === null ? "None" : String(brief.version),
			technical: true,
		},
		{
			label: "Focused at capture",
			value: brief.focused ? "Focused" : "Not focused",
			technical: false,
		},
		{ label: "Focus captured", value: timestamp(brief.focusCapturedAtMs), technical: true },
		{
			label: "Focus freshness",
			value: brief.focusFreshness === "fresh" ? "Fresh at capture" : "Stale at capture",
			technical: false,
		},
		{ label: "Focus fresh until", value: timestamp(brief.focusFreshUntilMs), technical: true },
		{
			label: "Selection freshness",
			value: brief.selection.freshness === "fresh" ? "Fresh at capture" : "Stale at capture",
			technical: false,
		},
		{
			label: "Selection",
			value:
				brief.selection.elementIds.length === 0 ? "None" : brief.selection.elementIds.join(", "),
			technical: true,
		},
		{
			label: "Selection captured",
			value: timestamp(brief.selection.capturedAtMs),
			technical: true,
		},
		{
			label: "Selection fresh until",
			value: timestamp(brief.selection.freshUntilMs),
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
		{ label: "Brief captured", value: timestamp(brief.capturedAtMs), technical: true },
	]);
}

function entryView(
	sessionKey: string,
	entry: VoiceContextLedgerEntry,
	expanded: ReadonlySet<string>,
	maximum: number,
): VoiceContextEntryView {
	const expansionKey = voiceContextEntryExpansionKey(sessionKey, entry.id);
	const bodyPreview = preview(entry.body, maximum);
	const bodyExpanded = expanded.has(expansionKey);
	return Object.freeze({
		id: entry.id,
		expansionKey,
		kind: entry.kind,
		kindLabel: ENTRY_LABELS[entry.kind],
		capturedAt: timestamp(entry.capturedAtMs),
		attemptedAt: timestamp(entry.attemptedAtMs),
		attemptLabel: entry.attempted ? "Attempted" : "Not attempted",
		outcome: entry.outcome,
		outcomeLabel: OUTCOME_LABELS[entry.outcome],
		reason: entry.reason ?? "No reason reported",
		body: entry.body,
		bodyLabel: entry.outcome === "delivered" ? "Exact delivered body" : "Exact attempted body",
		bodyPreview: bodyExpanded ? entry.body : bodyPreview.text,
		bodyExpanded,
		bodyTruncated: bodyPreview.truncated,
		provenanceLabel: entry.provenance === "recovered" ? "Recovered history" : "Live record",
		disconnected: entry.connection === "disconnected",
		connectionLabel:
			entry.connection === "disconnected"
				? "Recorded while disconnected"
				: "Recorded while connected",
	});
}

function sessionView(
	session: VoiceContextSessionRecord,
	input: VoiceContextProjectionInput,
	resolved: VoiceContextProjectionLimits,
): VoiceContextSessionView {
	const key = voiceContextIdentityKey(session.identity);
	const allEntries = input.expandedSessions.has(key);
	const selectedEntries = allEntries
		? session.entries
		: session.entries.slice(-resolved.collapsedEntries);
	const status = statusView(session.status);
	const brief = briefView(session.briefCondition);
	const canonicalPreview = preview(session.brief.canonicalBrief, resolved.collapsedBodyCharacters);
	const canonicalBriefExpanded = input.expandedBriefs.has(key);
	return Object.freeze({
		key,
		identity: session.identity,
		heading: `Voice session ${session.identity.realtimeSessionId}`,
		status: session.status.state,
		statusLabel: status.label,
		statusDetail: status.detail,
		briefState: session.briefCondition.state,
		briefLabel: brief.label,
		briefDetail: brief.detail,
		provenanceLabel: session.provenance === "recovered" ? "Recovered history" : "Live session",
		fields: fields(session),
		canonicalBrief: session.brief.canonicalBrief,
		canonicalBriefPreview: canonicalBriefExpanded
			? session.brief.canonicalBrief
			: canonicalPreview.text,
		canonicalBriefExpanded,
		canonicalBriefTruncated: canonicalPreview.truncated,
		entries: Object.freeze(
			selectedEntries.map((entry) =>
				entryView(key, entry, input.expandedEntries, resolved.collapsedBodyCharacters),
			),
		),
		entryCount: session.entries.length,
		entriesExpanded: allEntries,
		hiddenEntryCount: session.entries.length - selectedEntries.length,
	});
}

export function projectVoiceContext(input: VoiceContextProjectionInput): VoiceContextHistoryView {
	const resolved = limits(input);
	const newestFirst = input.snapshot.sessions.toReversed();
	const selectedSessions = input.showAllSessions
		? newestFirst
		: newestFirst.slice(0, resolved.collapsedSessions);
	return Object.freeze({
		sessions: Object.freeze(
			selectedSessions.map((session) => sessionView(session, input, resolved)),
		),
		sessionCount: input.snapshot.sessions.length,
		hiddenSessionCount: input.snapshot.sessions.length - selectedSessions.length,
		sessionsExpanded: input.showAllSessions,
	});
}
