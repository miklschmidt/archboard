import {
	type Backoff,
	lengthOf,
	type Readable,
	type Span,
	WAITS,
} from "#shared/constants/waits.ts";

/** The most doublings a backoff takes, past which every cap is reached anyway. */
const MOST_DOUBLINGS = 30;

/**
 * When a span that starts at a stamp ends.
 * @param wait The span.
 * @param from Its stamp, in milliseconds on any clock.
 * @returns Its end, on the same clock.
 */
function expiresAt(wait: Span, from: number): number {
	return from + lengthOf(wait);
}

/**
 * Whether a span that started at a stamp has run out: more than its length has passed.
 * @param wait The span.
 * @param since Its stamp, in milliseconds on any clock.
 * @param now The time now, on the same clock. Defaults to the wall clock.
 * @returns True once more than the span has passed since the stamp.
 */
function lapsed(wait: Span, since: number, now: number = Date.now()): boolean {
	return now - since > lengthOf(wait);
}

/**
 * The delay before the next attempt of something that failed: the first delay doubled once for
 * every attempt already made, up to the cap.
 * @param wait The backoff.
 * @param attempt Attempts already made since the last success.
 * @returns The delay, in milliseconds.
 */
function backoff(wait: Backoff, attempt: number): number {
	const { ms: first, max }: { readonly ms: number; readonly max: number } = WAITS[wait];
	return Math.min(max, first * 2 ** Math.min(attempt, MOST_DOUBLINGS));
}

/**
 * A duration another owner needs as a number, or how long a motion takes. Every other duration
 * is served by the operation of its use and cannot be read.
 * @param wait The duration.
 * @returns It, in milliseconds.
 */
function ms(wait: Readable): number {
	const declared: { readonly ms: number } = WAITS[wait];
	return declared.ms;
}

export { backoff, expiresAt, lapsed, ms };
