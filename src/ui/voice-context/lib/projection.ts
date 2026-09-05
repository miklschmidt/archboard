// The bounded projection of the history: newest session first, one page of
// sessions, one page of entries per session, and one window of each body.
// The canonical brief is carried through byte for byte; the preview is a
// window over those same bytes.

import type { VoiceSessionView } from "@/ui/voice-session";
import type {
	VoiceContextCanonicalBrief,
	VoiceContextHistoryView,
	VoiceContextProjectionInput,
	VoiceContextProjectionLimits,
	VoiceContextSessionRecord,
	VoiceContextSessionView,
	VoiceContextStatusTone,
} from "@/ui/voice-context/contract";
import { voiceContextSessionKey } from "@/ui/voice-context/lib/history-validation";
import {
	baselineFields,
	entryView,
	page,
	visibleText,
} from "@/ui/voice-context/lib/projection-fields";

const DEFAULT_VOICE_CONTEXT_LIMITS = Object.freeze({
	sessionPageSize: 2,
	entryPageSize: 3,
	bodyWindowCharacters: 180,
}) satisfies VoiceContextProjectionLimits;

const WARNING_STATUSES: ReadonlySet<VoiceSessionView["status"]> = new Set([
	"requesting_permission",
	"negotiating",
	"muted",
	"processing",
	"recovering",
	"stopping",
]);

/**
 * A positive limit, or the default.
 * @param candidate The requested limit.
 * @param fallback The default.
 * @returns The limit.
 */
function positive(candidate: number | undefined, fallback: number): number {
	return candidate !== undefined && Number.isSafeInteger(candidate) && candidate > 0
		? candidate
		: fallback;
}

/**
 * The resolved limits for one projection.
 * @param input The projection input.
 * @returns The limits.
 */
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

/**
 * The tone a session's status is shown in.
 * @param view The latest session view.
 * @param replaced Whether the session was replaced.
 * @returns The tone.
 */
function statusTone(view: VoiceSessionView, replaced: boolean): VoiceContextStatusTone {
	if (replaced) {
		return "warning";
	}
	if (view.status === "failed") {
		return "destructive";
	}
	if (view.status === "listening" || view.status === "agent_speaking") {
		return "status";
	}
	return WARNING_STATUSES.has(view.status) ? "warning" : "quiet";
}

/**
 * The words for a brief's freshness at capture.
 * @param brief The brief.
 * @returns The label and detail.
 */
function briefNarration(brief: VoiceContextCanonicalBrief): {
	readonly label: string;
	readonly detail: string;
} {
	const stale = brief.freshness.state === "stale" || brief.staleness.state === "stale";
	if (!stale) {
		return {
			label: "Captured brief",
			detail: "This is the exact semantic context captured for the session.",
		};
	}
	const expired =
		brief.freshness.state === "stale" ? "Its captured freshness window had expired. " : "";
	const reasons = brief.staleness.reasons.join(" ");
	return {
		label: "Stale brief",
		detail: `${expired}${reasons === "" ? "No stale reason was reported." : reasons}`,
	};
}

/** One page of a session's entries, newest page first. */
interface EntryPage {
	readonly entryPage: number;
	readonly start: number;
	readonly end: number;
}

/**
 * The entry page a record shows.
 * @param record The record.
 * @param requested The requested page.
 * @param pageSize Entries per page.
 * @returns The page bounds.
 */
function entryPage(
	record: VoiceContextSessionRecord,
	requested: number,
	pageSize: number,
): EntryPage {
	const count = record.entries.length;
	const pageCount = Math.max(1, Math.ceil(count / pageSize));
	const resolved = Math.min(requested, pageCount);
	const end = Math.max(0, count - (resolved - 1) * pageSize);
	return { entryPage: resolved, start: Math.max(0, end - pageSize), end };
}

/**
 * The status words for a session.
 * @param record The record.
 * @returns The latest view, the label, the detail, and whether replaced.
 */
function sessionStatus(record: VoiceContextSessionRecord): {
	readonly latest: VoiceSessionView;
	readonly statusLabel: string;
	readonly statusDetail: string;
	readonly replaced: boolean;
} {
	const latest = record.observations.at(-1)?.session ?? record.captured.session;
	const replaced = latest.failure?.code === "replaced";
	const statusDetail =
		latest.status === "stopped"
			? `${latest.detail} Its captured baseline and ledger remain available.`
			: latest.detail;
	return { latest, statusLabel: replaced ? "Replaced" : latest.label, statusDetail, replaced };
}

/**
 * One session as projected.
 * @param record The record.
 * @param input The projection input.
 * @param resolved The resolved limits.
 * @returns The session view.
 */
function sessionView(
	record: VoiceContextSessionRecord,
	input: VoiceContextProjectionInput,
	resolved: VoiceContextProjectionLimits,
): VoiceContextSessionView {
	const captured = record.captured.session;
	if (captured.binding === null || captured.sessionId === null) {
		throw new TypeError("Voice context history contains unbound captured evidence.");
	}
	const key = voiceContextSessionKey(captured);
	const { latest, statusLabel, statusDetail, replaced } = sessionStatus(record);
	const narrated = briefNarration(record.captured.brief);
	const canonical = visibleText(
		record.captured.canonicalBrief,
		page(input.briefPages.get(key)),
		resolved.bodyWindowCharacters,
	);
	const entries = entryPage(record, page(input.entryPages.get(key)), resolved.entryPageSize);
	return Object.freeze({
		key,
		binding: captured.binding,
		sessionId: captured.sessionId,
		heading: `Voice session ${captured.sessionId}`,
		status: latest.status,
		statusLabel,
		statusDetail,
		statusTone: statusTone(latest, replaced),
		replaced,
		briefLabel: narrated.label,
		briefDetail: narrated.detail,
		provenanceLabel:
			record.captured.provenance === "recovered" ? "Recovered history" : "Live session",
		fields: baselineFields(record.captured.brief),
		canonicalBrief: record.captured.canonicalBrief,
		canonicalBriefPreview: canonical.preview,
		canonicalBriefPage: canonical.page,
		canonicalBriefWindowStart: canonical.start,
		canonicalBriefWindowEnd: canonical.end,
		canonicalBriefTotalCharacters: canonical.total,
		previousCanonicalBriefCharacters: canonical.previous,
		canonicalBriefRemainingCharacters: canonical.remaining,
		nextCanonicalBriefCharacters: canonical.next,
		entries: Object.freeze(
			record.entries
				.slice(entries.start, entries.end)
				.map((entry) => entryView(key, entry, input, resolved)),
		),
		entryCount: record.entries.length,
		entryPage: entries.entryPage,
		hiddenEntryCount: entries.start,
		nextEntryCount: Math.min(resolved.entryPageSize, entries.start),
		newerEntryCount: Math.min(resolved.entryPageSize, record.entries.length - entries.end),
		omittedPrefixCount: Math.max(0, record.sourceEntryCount - record.entries.length),
	});
}

/**
 * Projects the history.
 * @param input The projection input.
 * @returns The history view.
 */
function projectVoiceContext(input: VoiceContextProjectionInput): VoiceContextHistoryView {
	const resolved = limits(input);
	const newestFirst = input.snapshot.sessions.toReversed();
	const pageCount = Math.max(1, Math.ceil(newestFirst.length / resolved.sessionPageSize));
	const sessionPage = Math.min(page(input.sessionPage), pageCount);
	const start = (sessionPage - 1) * resolved.sessionPageSize;
	const end = Math.min(newestFirst.length, start + resolved.sessionPageSize);
	return Object.freeze({
		sessions: Object.freeze(
			newestFirst.slice(start, end).map((record) => sessionView(record, input, resolved)),
		),
		sessionCount: newestFirst.length,
		sessionPage,
		hiddenSessionCount: newestFirst.length - end,
		nextSessionCount: Math.min(resolved.sessionPageSize, newestFirst.length - end),
		newerSessionCount: Math.min(resolved.sessionPageSize, start),
	});
}

export { DEFAULT_VOICE_CONTEXT_LIMITS, projectVoiceContext };
