import { BROWSER_SNAPSHOT_DELTA_KEYS } from "#shared/protocol/gateway-envelope.ts";
import type { BrowserSnapshot, BrowserTimeline } from "#shared/schemas/browser/snapshot.ts";
import type { BrowserSnapshotDelta } from "#server/protocol/gateway/contract.ts";

export const BROWSER_SNAPSHOT_MAX_BYTES = 1_048_576;
export const BROWSER_SNAPSHOT_MIN_BYTES = 32_768;
export const BROWSER_DELTA_MAX_BYTES = 262_144;

type BrowserTimelineTurn = BrowserTimeline["turns"][number];

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
	// JSON.stringify answers undefined for a value JSON cannot carry — a bare
	// undefined, a function, a symbol — which the lib typing hides. A gateway
	// value must never be one, so the check reads through an unknown.
	const encoded: unknown = JSON.stringify(value);
	if (typeof encoded !== "string") {
		throw new Error("browser gateway produced a non-JSON value");
	}
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
 * How many bytes values take inside a JSON array, one comma between each two.
 * @param sizes Each value's byte length.
 * @returns The byte length, brackets excluded.
 */
function listBytes(sizes: readonly number[]): number {
	return sizes.reduce((sum, size) => sum + size, Math.max(sizes.length - 1, 0));
}

/**
 * The newest items of one turn that fit the room it has, marked truncated.
 * @param turn The turn.
 * @param room How many bytes the turn may take.
 * @returns The trimmed turn, or null when even its bare form does not fit.
 */
function newestItemsWithin(turn: BrowserTimelineTurn, room: number): BrowserTimelineTurn | null {
	const marked: BrowserTimelineTurn = { ...turn, outputsTruncated: true };
	const bare = wireBytes({ ...marked, items: [] });
	if (bare > room) return null;
	const sizes = marked.items.map(wireBytes);
	let start = 0;
	while (start < sizes.length && bare + listBytes(sizes.slice(start)) > room) start += 1;
	return { ...marked, items: marked.items.slice(start) };
}

/**
 * The snapshot carrying the given timeline turns.
 * @param snapshot The snapshot.
 * @param timeline Its timeline.
 * @param turns The turns to carry.
 * @returns The rebuilt snapshot.
 */
function withTurns(
	snapshot: BrowserSnapshot,
	timeline: BrowserTimeline,
	turns: readonly BrowserTimelineTurn[],
): BrowserSnapshot {
	return { ...snapshot, timeline: { ...timeline, turns: [...turns] } };
}

/**
 * The timeline's turns, fitted from the oldest end: older turns go whole, the
 * turn where the cut lands keeps its newest items, and the newest `keep` turns
 * are never dropped whole. History is cut where it is oldest because the
 * newest turn is the one a person is watching.
 * @param snapshot The snapshot to fit.
 * @param limit The snapshot bound in bytes.
 * @param keep How many of the newest turns may only be trimmed, not dropped.
 * @returns The snapshot with as much timeline as fits.
 */
function cutOldestTurns(snapshot: BrowserSnapshot, limit: number, keep: number): BrowserSnapshot {
	const timeline = snapshot.timeline;
	if (timeline === null) return snapshot;
	const room = limit - wireBytes(withTurns(snapshot, timeline, []));
	const turns = timeline.turns.slice();
	const sizes = turns.map(wireBytes);
	while (turns.length > keep && listBytes(sizes) > room) {
		if (cutOldestOnce(turns, sizes, room)) break;
	}
	return withTurns(snapshot, timeline, turns);
}

/**
 * Cut the oldest turn down to its newest items that fit, or drop it whole and
 * mark the turn that becomes the oldest.
 * @param turns The turns, oldest first; cut in place.
 * @param sizes Each turn's byte length; updated in place.
 * @param room How many bytes the turns may take together.
 * @returns True when the cut landed inside the oldest turn, which now fits.
 */
function cutOldestOnce(turns: BrowserTimelineTurn[], sizes: number[], room: number): boolean {
	const rest = listBytes(sizes.slice(1)) + (sizes.length > 1 ? 1 : 0);
	const trimmed = newestItemsWithin(turns[0]!, room - rest);
	if (trimmed !== null && trimmed.items.length > 0) {
		turns[0] = trimmed;
		return true;
	}
	turns.shift();
	sizes.shift();
	markOldestTruncated(turns, sizes);
	return false;
}

/**
 * Mark the oldest turn as carrying less than the whole history before it.
 * @param turns The turns, oldest first; marked in place.
 * @param sizes Each turn's byte length; updated in place.
 */
function markOldestTruncated(turns: BrowserTimelineTurn[], sizes: number[]): void {
	const oldest = turns[0];
	if (oldest === undefined) return;
	turns[0] = { ...oldest, outputsTruncated: true };
	sizes[0] = wireBytes(turns[0]);
}

/**
 * The newest turn trimmed to its newest items that fit, once every older turn
 * is gone.
 * @param snapshot The snapshot holding at most the newest turn.
 * @param limit The snapshot bound in bytes.
 * @returns The snapshot with as much of the newest turn as fits.
 */
function trimNewestTurn(snapshot: BrowserSnapshot, limit: number): BrowserSnapshot {
	const timeline = snapshot.timeline;
	const newest = timeline?.turns.at(-1);
	if (timeline === null || newest === undefined || wireBytes(snapshot) <= limit) return snapshot;
	const room = limit - wireBytes(withTurns(snapshot, timeline, []));
	return withTurns(snapshot, timeline, newestTurnWithin(newest, room, timeline.nextCursor));
}

/**
 * What of the newest turn fits its room: its newest items, or, when not even
 * its bare form fits, the bare turn unless a cursor proves more history exists.
 * @param newest The newest turn.
 * @param room How many bytes it may take.
 * @param nextCursor The cursor to older history, if any.
 * @returns The turns to carry.
 */
function newestTurnWithin(
	newest: BrowserTimelineTurn,
	room: number,
	nextCursor: BrowserTimeline["nextCursor"],
): BrowserTimelineTurn[] {
	const trimmed = newestItemsWithin(newest, room);
	if (trimmed !== null) return [trimmed];
	return nextCursor === null ? [{ ...newest, items: [], outputsTruncated: true }] : [];
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
 * Fit variable-size histories after every competing snapshot field is present,
 * giving up the oldest first: timeline turns older than the newest, then voice
 * context entries, then the newest turn's older items. The newest turn goes
 * last because it is the one a person is watching.
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
	const historyCut = cutOldestTurns(normalized, limit, 1);
	if (wireBytes(historyCut) <= limit) return deepFreeze(historyCut);
	const voiceFitted = fitVoiceContext(historyCut, limit);
	const fitted = trimNewestTurn(voiceFitted, limit);
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
	for (const key of BROWSER_SNAPSHOT_DELTA_KEYS) {
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
