import type {
	CommandOutcome,
	RealtimeTranscriptRecord,
	RecoveryRequest,
} from "@/shared/codex-realtime-host";
import { realtimeErrorMessage } from "@/runtime/codex-realtime/lib/binding";
import type { CodexRealtimeAdapterOptions } from "@/runtime/codex-realtime/lib/contract";
import type { RealtimeSessionOps } from "@/runtime/codex-realtime/lib/session-ops";
import type {
	ActiveRealtimeSession,
	RealtimeTranscriptEntry,
} from "@/runtime/codex-realtime/lib/state";

const TIMELINE_PAGE_LIMIT = 100;

type TimelinePage = Awaited<ReturnType<CodexRealtimeAdapterOptions["session"]["timelineListPage"]>>;

interface RecoveredSegment {
	readonly id: string;
	readonly role: RealtimeTranscriptRecord["role"];
	readonly text: string;
	readonly position: number;
}

type Collection =
	| { readonly kind: "segments"; readonly segments: readonly RecoveredSegment[] }
	| { readonly kind: "outcome"; readonly outcome: CommandOutcome };

/**
 * Refuse a timeline page whose active realtime session is another session's; recovery must
 * never mix transcripts.
 * @param page - The timeline page.
 * @param session - The session being recovered.
 */
function requirePageForSession(page: TimelinePage, session: ActiveRealtimeSession): void {
	if (
		page.activeRealtimeSessionAtPageStart !== null &&
		page.activeRealtimeSessionAtPageStart !== session.wireSessionId
	) {
		throw new Error("Timeline recovery belongs to another realtime session.");
	}
}

/**
 * The transcript segments of this session on one timeline page.
 * @param page - The timeline page.
 * @param session - The session being recovered.
 * @returns The segments in page order.
 */
function segmentsOn(page: TimelinePage, session: ActiveRealtimeSession): RecoveredSegment[] {
	const segments: RecoveredSegment[] = [];
	for (const entry of page.data) {
		if (entry.type !== "realtime" || entry.item.type !== "transcriptSegment") {
			continue;
		}
		if (entry.item.realtimeSessionId !== session.wireSessionId) {
			continue;
		}
		segments.push({
			id: entry.item.id,
			role: entry.item.role,
			text: entry.item.text,
			position: entry.position,
		});
	}
	return segments;
}

/**
 * Remember a cursor, refusing one already followed; a repeating cursor would page forever.
 * @param seen - Cursors already followed.
 * @param cursor - The next cursor.
 */
function rememberCursor(seen: Set<string>, cursor: string): void {
	if (seen.has(cursor)) {
		throw new Error("Timeline recovery cursor loop detected.");
	}
	seen.add(cursor);
}

/**
 * Page through the coordinator thread's timeline collecting this session's segments, stopping
 * with an outcome as soon as the request stops naming the live session.
 * @param ops - The adapter's session operations.
 * @param session - The session being recovered.
 * @param request - The browser's recovery request.
 * @returns The collected segments, or the outcome that ended collection early.
 */
async function collectTimelineSegments(
	ops: RealtimeSessionOps,
	session: ActiveRealtimeSession,
	request: RecoveryRequest,
): Promise<Collection> {
	const seenCursors = new Set<string>();
	const segments: RecoveredSegment[] = [];
	let cursor: string | null = null;
	for (;;) {
		if (!ops.requestIsCurrent(session, request)) {
			return {
				kind: "outcome",
				outcome: { ...request, outcome: "not_delivered", reason: "stale_session" },
			};
		}
		// oxlint-disable-next-line no-await-in-loop -- each page's cursor comes from the previous page; timeline paging is sequential by contract
		const page = await ops.options.session.timelineListPage({
			threadId: session.binding.coordinatorThreadId,
			cursor,
			limit: TIMELINE_PAGE_LIMIT,
		});
		if (!ops.requestIsCurrent(session, request)) {
			return {
				kind: "outcome",
				outcome: { ...request, outcome: "outcome_unknown", reason: "response_lost" },
			};
		}
		requirePageForSession(page, session);
		segments.push(...segmentsOn(page, session));
		if (page.nextCursor === null) {
			return { kind: "segments", segments };
		}
		rememberCursor(seenCursors, page.nextCursor);
		cursor = page.nextCursor;
	}
}

/**
 * Replace the session's transcript with the recovered segments (live entries kept, recovered
 * ones at their timeline positions), publish it, mark the session recovered and retire it.
 * @param ops - The adapter's session operations.
 * @param session - The session being recovered.
 * @param segments - The recovered segments.
 */
function applyRecoveredSegments(
	ops: RealtimeSessionOps,
	session: ActiveRealtimeSession,
	segments: readonly RecoveredSegment[],
): void {
	const itemIds = ops.options.identity.decoder.adoptCodexResponseIdentities({
		itemIds: segments.map((segment) => segment.id),
	}).itemIds;
	const recovered = new Map<RealtimeTranscriptEntry["itemId"], RealtimeTranscriptEntry>(
		session.entries,
	);
	for (const [index, segment] of segments.entries()) {
		const itemId = itemIds[index]!;
		recovered.set(itemId, {
			itemId,
			role: segment.role,
			status: "final",
			text: segment.text,
			order: segment.position,
		});
	}
	session.entries.clear();
	for (const [itemId, entry] of recovered) {
		session.entries.set(itemId, entry);
	}
	ops.publishTranscript(session);
	ops.state(session, { phase: "idle", reason: "recovered" });
	ops.retire(session);
}

/**
 * The outcome of a recovery that threw: a lost response when the request is no longer current,
 * otherwise a diagnosed recovery failure the browser may retry.
 * @param ops - The adapter's session operations.
 * @param session - The session being recovered.
 * @param request - The browser's recovery request.
 * @param error - What recovery threw.
 * @returns The outcome to report.
 */
function recoveryFailure(
	ops: RealtimeSessionOps,
	session: ActiveRealtimeSession,
	request: RecoveryRequest,
	error: unknown,
): CommandOutcome {
	if (!ops.requestIsCurrent(session, request)) {
		return { ...request, outcome: "outcome_unknown", reason: "response_lost" };
	}
	ops.emitDiagnostic(session, "protocol", realtimeErrorMessage(error));
	ops.state(session, {
		phase: "recoverable_error",
		reason: "recovery_failed",
		message: realtimeErrorMessage(error),
	});
	return { ...request, outcome: "outcome_unknown", reason: "transport_failure" };
}

/**
 * Recover a session in a recoverable error by rebuilding its transcript from the coordinator
 * thread's timeline; a session in any other phase is not ready for recovery.
 * @param ops - The adapter's session operations.
 * @param session - The session named by the request.
 * @param request - The browser's recovery request.
 * @returns The outcome to report.
 */
async function recoverRealtimeSession(
	ops: RealtimeSessionOps,
	session: ActiveRealtimeSession,
	request: RecoveryRequest,
): Promise<CommandOutcome> {
	if (session.state.phase !== "recoverable_error") {
		return { ...request, outcome: "not_delivered", reason: "not_ready" };
	}
	try {
		const collected = await collectTimelineSegments(ops, session, request);
		if (collected.kind === "outcome") {
			return collected.outcome;
		}
		applyRecoveredSegments(ops, session, collected.segments);
		return { ...request, outcome: "delivered" };
	} catch (error) {
		return recoveryFailure(ops, session, request, error);
	}
}

export { recoverRealtimeSession };
