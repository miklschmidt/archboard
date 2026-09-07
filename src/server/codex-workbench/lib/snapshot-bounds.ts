import type { BrowserSnapshot, BrowserTimeline } from "@/shared/codex-browser-model";
import type { BrowserSnapshotDelta } from "@/server/codex-workbench/lib/contract";

export const BROWSER_SNAPSHOT_MAX_BYTES = 1_048_576;
export const BROWSER_SNAPSHOT_MIN_BYTES = 32_768;
export const BROWSER_DELTA_MAX_BYTES = 262_144;

type BrowserSnapshotKey = Exclude<keyof BrowserSnapshot, "kind" | "version">;
type BrowserTimelineTurn = BrowserTimeline["turns"][number];
const SNAPSHOT_KEYS: readonly BrowserSnapshotKey[] = [
	"readiness",
	"account",
	"login",
	"threadLink",
	"threadCandidates",
	"timeline",
	"queue",
	"settings",
	"approvals",
	"dynamicApprovals",
	"semantic",
	"coordinator",
	"voice",
	"spokenApproval",
	"voiceContext",
	"lease",
	"operation",
];

/**
 * Freeze a value and everything reachable from it, so a published snapshot cannot drift.
 * @param value The value to freeze in place.
 * @returns The same value, frozen.
 */
export function deepFreeze<T>(value: T): T {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value)) deepFreeze(child);
	}
	return value;
}

/**
 * The size of a value as the browser transport will carry it: its UTF-8 JSON encoding.
 * @param value The value to measure.
 * @returns The encoded byte length.
 */
function wireBytes(value: unknown): number {
	// JSON.stringify answers undefined for a value JSON cannot carry; the lib
	// typing hides that, and a gateway value must never be one.
	const encoded: string | undefined = JSON.stringify(value);
	if (encoded === undefined) throw new Error("browser gateway produced a non-JSON value");
	return new TextEncoder().encode(encoded).byteLength;
}

/**
 * Refuse a value larger than its wire-size bound.
 * @param value The value to measure.
 * @param limit The bound in bytes.
 * @param kind The name used in the refusal, `snapshot` or `delta`.
 */
function assertBounded(value: unknown, limit: number, kind: string): void {
	if (wireBytes(value) > limit) throw new Error(`the browser ${kind} exceeds its wire-size bound`);
}

/**
 * Refuse a snapshot budget outside the range the gateway supports.
 * @param limit The proposed snapshot bound in bytes.
 */
export function assertBrowserSnapshotBudget(limit: number): void {
	if (
		!Number.isSafeInteger(limit) ||
		limit < BROWSER_SNAPSHOT_MIN_BYTES ||
		limit > BROWSER_SNAPSHOT_MAX_BYTES
	)
		throw new Error(
			`the browser snapshot budget must be between ${BROWSER_SNAPSHOT_MIN_BYTES} and ${BROWSER_SNAPSHOT_MAX_BYTES} bytes`,
		);
}

/**
 * A copy of a turn holding only the given items and marked as truncated.
 * @param turn The turn to copy.
 * @param items The items to keep.
 * @returns The truncated turn.
 */
function truncateTimelineTurn(
	turn: BrowserTimelineTurn,
	items: BrowserTimelineTurn["items"],
): BrowserTimelineTurn {
	return { ...turn, items, outputsTruncated: true };
}

/**
 * Drop items off the end of one turn until the snapshot built around it fits.
 * @param turn The turn to trim.
 * @param fits Whether a snapshot holding the candidate turn is within budget.
 * @returns The trimmed turn, always marked as truncated.
 */
function trimTurnItems(
	turn: BrowserTimelineTurn,
	fits: (candidate: BrowserTimelineTurn) => boolean,
): BrowserTimelineTurn {
	let items = turn.items;
	let trimmed = truncateTimelineTurn(turn, items);
	while (items.length > 0 && !fits(trimmed)) {
		items = items.slice(0, -1);
		trimmed = truncateTimelineTurn(turn, items);
	}
	return trimmed;
}

/**
 * Shrink the timeline, newest turn first, until the snapshot fits or no turn
 * can be dropped: the oldest turn survives unless a cursor proves more history exists.
 * @param snapshot The snapshot to fit.
 * @param limit The snapshot bound in bytes.
 * @returns The snapshot with as much timeline as fits, or the last shape tried.
 */
function fitTimelineTurns(snapshot: BrowserSnapshot, limit: number): BrowserSnapshot {
	const timeline = snapshot.timeline;
	if (timeline === null) return snapshot;
	let turns = timeline.turns.slice();
	/**
	 * The snapshot rebuilt around a candidate turn list.
	 * @param candidate The turns to carry.
	 * @returns The candidate snapshot.
	 */
	const withTurns = (candidate: readonly BrowserTimelineTurn[]): BrowserSnapshot => ({
		...snapshot,
		timeline: { ...timeline, turns: [...candidate] },
	});
	/**
	 * Whether a candidate turn list keeps the snapshot within budget.
	 * @param candidate The turns to measure with.
	 * @returns True when the rebuilt snapshot fits.
	 */
	const fits = (candidate: readonly BrowserTimelineTurn[]): boolean =>
		wireBytes(withTurns(candidate)) <= limit;
	/**
	 * Whether the turn list fits once its last turn is replaced.
	 * @param candidate The replacement for the last turn.
	 * @returns True when the rebuilt snapshot fits.
	 */
	const fitsWithLast = (candidate: BrowserTimelineTurn): boolean => {
		const replaced = turns.slice();
		replaced[replaced.length - 1] = candidate;
		return fits(replaced);
	};
	while (turns.length > 0) {
		const lastIndex = turns.length - 1;
		turns[lastIndex] = trimTurnItems(turns[lastIndex]!, fitsWithLast);
		if (fits(turns)) return withTurns(turns);
		if (turns.length === 1) return timeline.nextCursor === null ? withTurns(turns) : withTurns([]);
		turns = turns.slice(0, -1);
		const preceding = turns.at(-1)!;
		turns[turns.length - 1] = truncateTimelineTurn(preceding, preceding.items);
	}
	return withTurns(turns);
}

/**
 * Drop voice-context entries, oldest first, until the snapshot fits or none remain.
 * @param snapshot The snapshot to fit.
 * @param limit The snapshot bound in bytes.
 * @returns The snapshot with as much voice context as fits, or the last shape tried.
 */
function fitVoiceContext(snapshot: BrowserSnapshot, limit: number): BrowserSnapshot {
	let voiceContext = snapshot.voiceContext ?? null;
	/**
	 * The snapshot rebuilt around the current voice context.
	 * @returns The candidate snapshot.
	 */
	const candidate = (): BrowserSnapshot => ({ ...snapshot, voiceContext });
	while (voiceContext !== null && voiceContext.entries.length > 0) {
		voiceContext = Object.assign({}, voiceContext, {
			entriesTruncated: voiceContext.entriesTruncated + 1,
			entries: voiceContext.entries.slice(1),
		});
		if (wireBytes(candidate()) <= limit) return candidate();
	}
	return candidate();
}

/**
 * Fit variable-size histories after every competing snapshot field is present.
 * @param snapshot The complete snapshot.
 * @param limit The snapshot bound in bytes.
 * @returns The snapshot itself when it already fits, otherwise a frozen fitted copy.
 */
export function fitBrowserSnapshotBounded(
	snapshot: BrowserSnapshot,
	limit = BROWSER_SNAPSHOT_MAX_BYTES,
): BrowserSnapshot {
	assertBrowserSnapshotBudget(limit);
	if (wireBytes(snapshot) <= limit) return snapshot;
	const normalized: BrowserSnapshot = { ...snapshot, voiceContext: snapshot.voiceContext ?? null };
	const timelineFitted = fitTimelineTurns(normalized, limit);
	if (wireBytes(timelineFitted) <= limit) return deepFreeze(timelineFitted);
	const fitted = fitVoiceContext(timelineFitted, limit);
	assertBounded(fitted, limit, "snapshot");
	return deepFreeze(fitted);
}

/**
 * Whether two values encode identically on the wire.
 * @param left One value.
 * @param right The other value.
 * @returns True when their JSON encodings match.
 */
function sameWireValue(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * The fields that changed between two snapshots, as a bounded delta.
 * @param previous The snapshot the browser already holds.
 * @param next The snapshot to bring it to.
 * @returns The frozen delta, or null when nothing changed.
 */
export function diffBrowserSnapshots(
	previous: BrowserSnapshot,
	next: BrowserSnapshot,
): BrowserSnapshotDelta | null {
	const delta: Record<string, unknown> = {};
	for (const key of SNAPSHOT_KEYS) {
		if (!sameWireValue(previous[key], next[key])) delta[key] = next[key];
	}
	if (Object.keys(delta).length === 0) return null;
	assertBounded(delta, BROWSER_DELTA_MAX_BYTES, "delta");
	return deepFreeze(delta);
}

/**
 * Refuse a snapshot larger than the given budget.
 * @param snapshot The snapshot to measure.
 * @param limit The snapshot bound in bytes.
 */
export function assertBrowserSnapshotBounded(
	snapshot: BrowserSnapshot,
	limit = BROWSER_SNAPSHOT_MAX_BYTES,
): void {
	assertBrowserSnapshotBudget(limit);
	assertBounded(snapshot, limit, "snapshot");
}

/**
 * Refuse a delta larger than the delta wire-size bound.
 * @param delta The delta to measure.
 */
export function assertBrowserDeltaBounded(delta: BrowserSnapshotDelta): void {
	assertBounded(delta, BROWSER_DELTA_MAX_BYTES, "delta");
}
