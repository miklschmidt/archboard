// Which hold request still belongs to this pane. A board switch invalidates an
// attempt by generation, so an away-and-back board name cannot let an old
// answer clear the current attempt.

/** One in-flight request for the board's mutex. */
interface HoldAttempt {
	board: string;
	generation: number;
	promise: Promise<unknown> | null;
}

/**
 * Whether an attempt is the exact hold request still owned by this pane generation.
 * @param current The attempt the pane holds now, or null.
 * @param attempt The attempt that is settling.
 * @param promise The promise that attempt was made with.
 * @param generation The pane's current hold generation.
 * @returns True only for the current attempt, its own promise, in the current generation.
 */
function ownsHoldAttempt(
	current: HoldAttempt | null,
	attempt: HoldAttempt,
	promise: Promise<unknown>,
	generation: number,
): boolean {
	return current === attempt && attempt.promise === promise && attempt.generation === generation;
}

/**
 * Turn an attempt's settlement into a renewal, but only for the current pane generation.
 * @param current The attempt the pane holds now, or null.
 * @param attempt The attempt that settled.
 * @param promise The promise that attempt was made with.
 * @param generation The pane's current hold generation.
 * @param scheduleRenewal Schedules the renewal when the attempt is still owned.
 * @returns Whether a renewal was scheduled.
 */
function scheduleRenewalForOwnedHoldAttempt(
	current: HoldAttempt | null,
	attempt: HoldAttempt,
	promise: Promise<unknown>,
	generation: number,
	scheduleRenewal: () => void,
): boolean {
	if (!ownsHoldAttempt(current, attempt, promise, generation)) {
		return false;
	}
	scheduleRenewal();
	return true;
}

export { type HoldAttempt, ownsHoldAttempt, scheduleRenewalForOwnedHoldAttempt };
