import type { TurnId } from "@archboard/codex-app-server/identity";
import {
	type CodexTimelinePlanInput,
	type CodexTimelineProjectionInput,
	type CodexTimelineTurnProjectionInput,
} from "#server/protocol/projection/projection-contract.ts";
import { assertBrowserSnapshotBudget } from "#server/rules/snapshot/snapshot-bounds.ts";
import {
	projectTurn,
	TIMELINE_ITEM_LIMIT,
	TIMELINE_MAX_BYTES,
	TIMELINE_PAGE_LIMIT,
	TIMELINE_PAGE_LIMIT_MAX,
	type ServerBrowserProjectionBudget,
	type TimelineApprovalView,
	type TimelineData,
} from "#server/projections/timeline/projection.ts";
import { textEncoder } from "#server/rules/timeline/text.ts";

/** What a browser projection carries when the caller asks for no less. */
const DEFAULT_BROWSER_PROJECTION_BUDGET: ServerBrowserProjectionBudget = Object.freeze({
	maxTurns: TIMELINE_PAGE_LIMIT * TIMELINE_PAGE_LIMIT_MAX,
	maxItemsPerTurn: TIMELINE_ITEM_LIMIT,
	maxBytes: TIMELINE_MAX_BYTES,
});

/** Everything a projected timeline carries beside its turns. */
type TimelineFrame = Pick<CodexTimelineProjectionInput, "kind" | "threadId" | "cursor" | "usage">;

/** What the owner holds from notifications rather than from history. */
interface TimelineLiveState {
	readonly usage: CodexTimelineProjectionInput["usage"];
	readonly planFor: (turnId: TurnId) => CodexTimelinePlanInput | null;
}

/**
 * How many bytes one projected timeline takes on the wire, which is what every
 * budget decision is measured against.
 * @param frame Everything the timeline carries beside its turns.
 * @param turns The turns.
 * @returns The byte length.
 */
function timelineBytes(
	frame: TimelineFrame,
	turns: readonly CodexTimelineTurnProjectionInput[],
): number {
	return textEncoder.encode(JSON.stringify({ ...frame, turns })).byteLength;
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

type TimelineItem = CodexTimelineTurnProjectionInput["items"][number];

/**
 * How many bytes one item takes inside a projected timeline.
 * @param item The item.
 * @returns The byte length.
 */
function itemBytes(item: TimelineItem): number {
	return textEncoder.encode(JSON.stringify(item)).byteLength;
}

/**
 * The same item without its command output, which it says was cut; any other
 * item is returned as it is.
 * @param item The item.
 * @returns The lighter item.
 */
function withoutOutput(item: TimelineItem): TimelineItem {
	if (item.kind !== "command_execution" || item.output.tail === null) {
		return item;
	}
	return { ...item, output: { tail: null, truncated: true } };
}

/**
 * One more turn, fitted into what is left of the budget from its oldest end,
 * or nothing when even its bare form does not fit. Its older items give up
 * their command output first, so as many items as possible stay; then whole
 * items go, oldest first, so the item the agent is on now is the last to go.
 * @param frame Everything the timeline carries beside its turns.
 * @param turns The turns already kept.
 * @param candidate The turn being fitted.
 * @param maxBytes The byte bound.
 * @returns The fitted turn, or null.
 */
function fitTurn(
	frame: TimelineFrame,
	turns: readonly CodexTimelineTurnProjectionInput[],
	candidate: CodexTimelineTurnProjectionInput,
	maxBytes: number,
): CodexTimelineTurnProjectionInput | null {
	const marked = markTruncated(candidate);
	const room = maxBytes - timelineBytes(frame, turns.concat({ ...marked, items: [] }));
	const items = marked.items.map((item) => ({ item, bytes: itemBytes(item) }));
	shedOlderOutputs(items, room);
	const fitted = { ...marked, items: dropOldest(items, room).map(({ item }) => item) };
	return timelineBytes(frame, turns.concat(fitted)) <= maxBytes ? fitted : null;
}

/** One item with the bytes it takes. */
interface SizedItem {
	readonly item: TimelineItem;
	readonly bytes: number;
}

/**
 * How many bytes items take inside a JSON array, one comma between each two.
 * @param items The items.
 * @returns The byte length, brackets excluded.
 */
function itemsBytes(items: readonly SizedItem[]): number {
	return items.reduce((sum, { bytes }) => sum + bytes, Math.max(items.length - 1, 0));
}

/**
 * Take the command output off items, oldest first and never the newest, until
 * they fit.
 * @param items The items, oldest first; lightened in place.
 * @param room How many bytes they may take.
 */
function shedOlderOutputs(items: SizedItem[], room: number): void {
	let total = itemsBytes(items);
	for (const [index, entry] of items.entries()) {
		if (total <= room || index === items.length - 1) {
			return;
		}
		const item = withoutOutput(entry.item);
		const bytes = itemBytes(item);
		total += bytes - entry.bytes;
		items[index] = { item, bytes };
	}
}

/**
 * The newest items that fit, dropping whole items from the oldest end.
 * @param items The items, oldest first.
 * @param room How many bytes they may take.
 * @returns The items kept.
 */
function dropOldest(items: readonly SizedItem[], room: number): readonly SizedItem[] {
	let kept = items;
	while (kept.length > 0 && itemsBytes(kept) > room) {
		kept = kept.slice(1);
	}
	return kept;
}

/**
 * Projects the retained turns newest-first and publishes them chronologically.
 *
 * The direction matters for correctness, not presentation. A budget cut must
 * remove the *oldest* history, because the newest turn is the one every current
 * decision reads: the browser composer decides idle-versus-running from it
 * (`ui/rules/composer/link.ts`), and this projection is the only
 * place it can see an in-progress turn. Trimming from the tail hid a running
 * turn on any thread long enough to hit `maxTurns` or `maxBytes`, which made a
 * steer look like a fresh start. The oldest retained turn carries the
 * truncation mark, because that is where history was cut.
 * @param data The retained history.
 * @param approvals Every approval the owner is presenting.
 * @param live What the owner holds from notifications: usage, and each turn's plan.
 * @param budget What the browser may be shown.
 * @param keepTurn Which turns the reader keeps, when only some are its own; the others are left
 * out before the budget is spent, so they take none of it.
 * @returns The projected timeline.
 */
function projectData(
	data: TimelineData,
	approvals: readonly TimelineApprovalView[],
	live: TimelineLiveState,
	budget: ServerBrowserProjectionBudget,
	keepTurn?: (turnId: TurnId) => boolean,
): CodexTimelineProjectionInput {
	const frame: TimelineFrame = {
		kind: "codex_timeline",
		threadId: data.threadId,
		cursor: data.cursor,
		usage: live.usage,
	};
	const kept = keepNewestTurns(keptTurns(data, keepTurn), frame, approvals, live, budget);
	const turns = kept.turns.toReversed();
	if (kept.truncated && turns.length > 0) {
		trimOldest(turns, frame, budget);
	}
	return { ...frame, turns };
}

/**
 * A history with only the turns a reader keeps.
 * @param data The retained history.
 * @param keepTurn Which turns to keep, or undefined to keep every one.
 * @returns The history to project.
 */
function keptTurns(
	data: TimelineData,
	keepTurn: ((turnId: TurnId) => boolean) | undefined,
): TimelineData {
	return keepTurn === undefined
		? data
		: { ...data, turns: data.turns.filter(({ turn }) => keepTurn(turn.id)) };
}

/**
 * Project the retained turns newest-first, keeping as many as the turn and
 * byte budgets allow and fitting the one that crosses the byte bound.
 * @param data The retained history.
 * @param frame Everything the timeline carries beside its turns.
 * @param approvals Every approval the owner is presenting.
 * @param live What the owner holds from notifications.
 * @param budget What the browser may be shown.
 * @returns The kept turns, newest first, and whether history was cut.
 */
function keepNewestTurns(
	data: TimelineData,
	frame: TimelineFrame,
	approvals: readonly TimelineApprovalView[],
	live: TimelineLiveState,
	budget: ServerBrowserProjectionBudget,
): { readonly turns: CodexTimelineTurnProjectionInput[]; readonly truncated: boolean } {
	const newestFirst: CodexTimelineTurnProjectionInput[] = [];
	let truncated = data.truncated || data.turns.length > budget.maxTurns;
	for (const source of data.turns.toReversed()) {
		if (newestFirst.length >= budget.maxTurns) {
			return { turns: newestFirst, truncated: true };
		}
		const candidate = projectTurn(
			data.threadId,
			source,
			approvals,
			budget.maxItemsPerTurn,
			live.planFor(source.turn.id),
		);
		if (timelineBytes(frame, [...newestFirst, candidate]) <= budget.maxBytes) {
			newestFirst.push(candidate);
			continue;
		}
		const fitted = fitTurn(frame, newestFirst, candidate, budget.maxBytes);
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
		turns[0] = { ...markTruncated(oldest), items: oldest.items.slice(1) };
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
 * @param frame Everything the timeline carries beside its turns.
 * @param budget What the browser may be shown.
 */
function trimOldest(
	turns: CodexTimelineTurnProjectionInput[],
	frame: TimelineFrame,
	budget: ServerBrowserProjectionBudget,
): void {
	const first = turns[0];
	if (first === undefined) {
		return;
	}
	turns[0] = markTruncated(first);
	while (turns.length > 0 && timelineBytes(frame, turns) > budget.maxBytes) {
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
function createServerBrowserProjectionBudget(
	input: Partial<ServerBrowserProjectionBudget> = {},
): ServerBrowserProjectionBudget {
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

export { createServerBrowserProjectionBudget, projectData, timelineBytes };
export type { TimelineLiveState };
