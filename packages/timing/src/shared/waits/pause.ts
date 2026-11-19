// One sleep between the passes of a loop that keeps its own decisions.

import { durationOf } from "#shared/durations/names.ts";
import { sleep, SYSTEM_CLOCK, type Clock } from "#shared/waits/clock.ts";
import { PAUSES, type CadenceName, type PausePolicy } from "#shared/waits/policies.ts";

/** What a pause may be told beyond its name. */
interface PauseOptions {
	/** A moment on the clock that the pause never passes. */
	readonly untilMs?: number;
	/** Wakes the pause when it aborts. */
	readonly signal?: AbortSignal;
	/** The clock; the runtime's by default. */
	readonly clock?: Clock;
}

/**
 * How long a pause sleeps.
 * @param name Which cadence.
 * @param clock The clock.
 * @param untilMs The moment it never passes, if any.
 * @returns The sleep in milliseconds, or null when no time is left to sleep.
 */
function pauseMs(name: CadenceName, clock: Clock, untilMs: number | undefined): number | null {
	const cadence = durationOf(name);
	if (untilMs === undefined) return cadence;
	const policy: PausePolicy = PAUSES[name];
	const left = untilMs - clock.now();
	const ms = Math.min(cadence, Math.max(policy.floorMs ?? Number.NEGATIVE_INFINITY, left));
	return ms > 0 ? ms : null;
}

/**
 * Sleep for one named cadence, never past a moment, waking when a signal aborts.
 * @param name Which cadence.
 * @param options A moment the pause never passes, a signal and a clock.
 * @returns Whether the time passed or the signal aborted, before or during the pause.
 */
async function pause(
	name: CadenceName,
	options: PauseOptions = {},
): Promise<"elapsed" | "aborted"> {
	const clock = options.clock ?? SYSTEM_CLOCK;
	const ms = pauseMs(name, clock, options.untilMs);
	const aborted =
		ms === null ? options.signal?.aborted === true : await sleep(clock, ms, options.signal);
	return aborted ? "aborted" : "elapsed";
}

export { pause };
export type { PauseOptions };
