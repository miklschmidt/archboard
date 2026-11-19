// When a duration that starts at a moment ends.

import { durationOf, type DurationName } from "#shared/durations/names.ts";

/**
 * When a duration that starts at a moment ends, never later than an outer cap.
 * An age check is a deadline too: something is older than a duration once the
 * time now is past the deadline of that duration from when it began. The caller
 * keeps its own comparison, because whether the moment itself counts differs.
 * @param name Which duration.
 * @param fromMs When it starts, on the caller's clock.
 * @param capAtMs An outer deadline on the same clock that this one never passes.
 * @returns When it ends, on the same clock.
 */
function deadline(name: DurationName, fromMs: number, capAtMs?: number): number {
	const end = fromMs + durationOf(name);
	return capAtMs === undefined ? end : Math.min(capAtMs, end);
}

export { deadline };
