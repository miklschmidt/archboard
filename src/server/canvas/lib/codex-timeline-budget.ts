import type { ThreadId } from "@/shared/codex-workbench-identity";
import type {
	CodexTimelineProjectionInput,
	CodexTimelineTurnProjectionInput,
} from "@/server/codex-workbench";
import { assertBrowserSnapshotBudget } from "@/server/codex-workbench";
import {
	projectTurn,
	textEncoder,
	TIMELINE_ITEM_LIMIT,
	TIMELINE_MAX_BYTES,
	TIMELINE_PAGE_LIMIT,
	TIMELINE_PAGE_LIMIT_MAX,
	type CanvasBrowserProjectionBudget,
	type TimelineApprovalView,
	type TimelineData,
} from "@/server/canvas/lib/codex-timeline-projection";

/** What a browser projection carries when the caller asks for no less. */
const DEFAULT_BROWSER_PROJECTION_BUDGET: CanvasBrowserProjectionBudget = Object.freeze({
	maxTurns: TIMELINE_PAGE_LIMIT * TIMELINE_PAGE_LIMIT_MAX,
	maxItemsPerTurn: TIMELINE_ITEM_LIMIT,
	maxBytes: TIMELINE_MAX_BYTES,
});

/**
 * How many bytes one projected timeline takes on the wire, which is what every
 * budget decision is measured against.
 * @param threadId The thread.
 * @param turns The turns.
 * @param cursor The paging cursor, when there is one.
 * @returns The byte length.
 */
function timelineBytes(
	threadId: ThreadId,
	turns: readonly CodexTimelineTurnProjectionInput[],
	cursor: string | null,
): number {
	return textEncoder.encode(JSON.stringify({ kind: "codex_timeline", threadId, turns, cursor }))
		.byteLength;
}

/**
 * The same turn, marked as carrying less than the whole of itself.
 * @param turn The turn.
 * @returns The marked turn.
 */
function markTruncated(turn: CodexTimelineTurnProjectionInput): CodexTimelineTurnProjectionInput {
	if (turn.presentation.outputs.truncated) {
		return turn;
	}
	return {
		...turn,
		presentation: {
			...turn.presentation,
			outputs: { ...turn.presentation.outputs, truncated: true },
		},
	};
}

/**
 * One more turn, trimmed item by item until it fits what is left of the
 * budget, or nothing when even its bare form does not.
 * @param threadId The thread.
 * @param turns The turns already kept.
 * @param candidate The turn being fitted.
 * @param cursor The paging cursor.
 * @param maxBytes The byte bound.
 * @returns The fitted turn, or null.
 */
function fitTurn(
	threadId: ThreadId,
	turns: readonly CodexTimelineTurnProjectionInput[],
	candidate: CodexTimelineTurnProjectionInput,
	cursor: string | null,
	maxBytes: number,
): CodexTimelineTurnProjectionInput | null {
	let fitted = markTruncated(candidate);
	while (
		timelineBytes(threadId, turns.concat(fitted), cursor) > maxBytes &&
		fitted.items.length > 0
	) {
		fitted = Object.assign({}, fitted, { items: fitted.items.slice(0, -1) });
	}
	return timelineBytes(threadId, turns.concat(fitted), cursor) <= maxBytes ? fitted : null;
}

/**
 * Projects the retained turns newest-first and publishes them chronologically.
 *
 * The direction matters for correctness, not presentation. A budget cut must
 * remove the *oldest* history, because the newest turn is the one every current
 * decision reads: the browser composer decides idle-versus-running from it
 * (`src/ui/workbench-composer/lib/link.ts`), and this projection is the only
 * place it can see an in-progress turn. Trimming from the tail hid a running
 * turn on any thread long enough to hit `maxTurns` or `maxBytes`, which made a
 * steer look like a fresh start. The oldest retained turn carries the
 * truncation mark, because that is where history was cut.
 * @param data The retained history.
 * @param approvals Every approval the owner is presenting.
 * @param budget What the browser may be shown.
 * @returns The projected timeline.
 */
function projectData(
	data: TimelineData,
	approvals: readonly TimelineApprovalView[],
	budget: CanvasBrowserProjectionBudget,
): CodexTimelineProjectionInput {
	const kept = keepNewestTurns(data, approvals, budget);
	const turns = kept.turns.toReversed();
	if (kept.truncated && turns.length > 0) {
		trimOldest(turns, data, budget);
	}
	return { kind: "codex_timeline", threadId: data.threadId, turns, cursor: data.cursor };
}

/**
 * Project the retained turns newest-first, keeping as many as the turn and
 * byte budgets allow and fitting the one that crosses the byte bound.
 * @param data The retained history.
 * @param approvals Every approval the owner is presenting.
 * @param budget What the browser may be shown.
 * @returns The kept turns, newest first, and whether history was cut.
 */
function keepNewestTurns(
	data: TimelineData,
	approvals: readonly TimelineApprovalView[],
	budget: CanvasBrowserProjectionBudget,
): { readonly turns: CodexTimelineTurnProjectionInput[]; readonly truncated: boolean } {
	const newestFirst: CodexTimelineTurnProjectionInput[] = [];
	let truncated = data.truncated || data.turns.length > budget.maxTurns;
	for (const source of data.turns.toReversed()) {
		if (newestFirst.length >= budget.maxTurns) {
			return { turns: newestFirst, truncated: true };
		}
		const candidate = projectTurn(data.threadId, source, approvals, budget.maxItemsPerTurn);
		if (timelineBytes(data.threadId, [...newestFirst, candidate], data.cursor) <= budget.maxBytes) {
			newestFirst.push(candidate);
			continue;
		}
		const fitted = fitTurn(data.threadId, newestFirst, candidate, data.cursor, budget.maxBytes);
		if (fitted !== null) {
			newestFirst.push(fitted);
		}
		return { turns: newestFirst, truncated: true };
	}
	return { turns: newestFirst, truncated };
}

/**
 * Take one item off the oldest turn, or drop that turn entirely once it has
 * none left, marking whichever turn becomes the oldest.
 * @param turns The turns, oldest first; cut in place.
 */
function cutOldestOnce(turns: CodexTimelineTurnProjectionInput[]): void {
	const oldest: CodexTimelineTurnProjectionInput | undefined = turns[0];
	if (oldest === undefined) {
		return;
	}
	if (oldest.items.length > 0) {
		turns[0] = { ...markTruncated(oldest), items: oldest.items.slice(0, -1) };
		return;
	}
	turns.shift();
	const next: CodexTimelineTurnProjectionInput | undefined = turns[0];
	if (next !== undefined) {
		turns[0] = markTruncated(next);
	}
}

/**
 * Cut the oldest end down until the whole projection fits, marking whichever
 * turn is oldest as carrying less than the whole of itself: that is where
 * history was cut.
 * @param turns The turns, oldest first; trimmed in place.
 * @param data The retained history.
 * @param budget What the browser may be shown.
 */
function trimOldest(
	turns: CodexTimelineTurnProjectionInput[],
	data: TimelineData,
	budget: CanvasBrowserProjectionBudget,
): void {
	const first = turns[0];
	if (first === undefined) {
		return;
	}
	turns[0] = markTruncated(first);
	while (turns.length > 0 && timelineBytes(data.threadId, turns, data.cursor) > budget.maxBytes) {
		cutOldestOnce(turns);
	}
}

/**
 * One budget value a caller may lower but not raise.
 * @param value What the caller asked for, if anything.
 * @param fallback The default.
 * @param maximum The ceiling.
 * @returns The value to use.
 */
function boundedBudgetValue(value: number | undefined, fallback: number, maximum: number): number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0
		? Math.min(value, maximum)
		: fallback;
}

/**
 * The budget one browser projection is bounded by, with each part lowered to
 * whatever the caller asked for and none of them raised.
 * @param input What the caller asked for.
 * @returns The budget.
 */
function createCanvasBrowserProjectionBudget(
	input: Partial<CanvasBrowserProjectionBudget> = {},
): CanvasBrowserProjectionBudget {
	const maxBytes = input.maxBytes ?? DEFAULT_BROWSER_PROJECTION_BUDGET.maxBytes;
	assertBrowserSnapshotBudget(maxBytes);
	const budget = Object.freeze({
		maxTurns: boundedBudgetValue(
			input.maxTurns,
			DEFAULT_BROWSER_PROJECTION_BUDGET.maxTurns,
			DEFAULT_BROWSER_PROJECTION_BUDGET.maxTurns,
		),
		maxItemsPerTurn: boundedBudgetValue(
			input.maxItemsPerTurn,
			DEFAULT_BROWSER_PROJECTION_BUDGET.maxItemsPerTurn,
			DEFAULT_BROWSER_PROJECTION_BUDGET.maxItemsPerTurn,
		),
		maxBytes,
	});
	return budget;
}

export { createCanvasBrowserProjectionBudget, projectData, timelineBytes };
