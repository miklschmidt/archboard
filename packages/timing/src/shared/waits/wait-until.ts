// Polling until something is there, written once for every wait.

import { durationOf } from "#shared/durations/names.ts";
import { sleep, SYSTEM_CLOCK, type Clock } from "#shared/waits/clock.ts";
import { WAITS, type WaitName, type WaitPolicy } from "#shared/waits/policies.ts";

/** What a wait may be told beyond its name. */
interface WaitOptions {
	/** The bound in milliseconds, in place of the one the wait names. */
	readonly boundMs?: number;
	/** An outer deadline on the clock that the wait never passes. */
	readonly capAtMs?: number;
	/** Ends the wait: checked before each look, and it wakes a sleep. */
	readonly signal?: AbortSignal;
	/** The clock to tell time and sleep on; the runtime's by default. */
	readonly clock?: Clock;
}

/** How a wait ended. A refusal carries its bound, so the caller can say it in words. */
type WaitOutcome<T> =
	| { readonly ok: true; readonly value: T }
	| {
			readonly ok: false;
			readonly reason: "bound" | "aborted";
			/** How long the wait was allowed, in seconds. */
			readonly boundSeconds: number;
	  };

/** Why a wait refuses. */
type Refusal = "bound" | "aborted";

/** One wait as it runs. */
interface Run {
	readonly policy: WaitPolicy;
	readonly clock: Clock;
	readonly signal: AbortSignal | undefined;
	/** When it ends, on its clock. */
	readonly deadlineAt: number;
	readonly boundSeconds: number;
}

/**
 * Start a wait: fix its clock and when it ends.
 * @param wait Which wait.
 * @param options What the caller told it.
 * @returns The run.
 */
function startRun(wait: WaitName, options: WaitOptions): Run {
	const policy: WaitPolicy = WAITS[wait];
	const clock = options.clock ?? SYSTEM_CLOCK;
	const startedAt = clock.now();
	const named = policy.bound === undefined ? Number.POSITIVE_INFINITY : durationOf(policy.bound);
	const boundMs = options.boundMs ?? named;
	const capAtMs = options.capAtMs ?? Number.POSITIVE_INFINITY;
	return {
		policy,
		clock,
		signal: options.signal,
		deadlineAt: Math.min(capAtMs, startedAt + boundMs),
		boundSeconds: Math.min(boundMs, capAtMs - startedAt) / 1000,
	};
}

/**
 * Whether a wait's bound has passed.
 * @param run The wait.
 * @returns True once it has.
 */
function past(run: Run): boolean {
	const now = run.clock.now();
	return run.policy.strict === true ? now > run.deadlineAt : now >= run.deadlineAt;
}

/**
 * Whether a wait checks its bound before a look.
 * @param policy The wait.
 * @param look How many looks came before this one.
 * @returns True when it does.
 */
function checksBefore(policy: WaitPolicy, look: number): boolean {
	return policy.check === "beforeProbe" && (look > 0 || policy.firstProbeFree !== true);
}

/**
 * Why a wait refuses before a look, if it does.
 * @param run The wait.
 * @param look How many looks came before this one.
 * @returns The refusal, or null to go on.
 */
function refusedBefore(run: Run, look: number): Refusal | null {
	if (run.signal?.aborted === true) return "aborted";
	return checksBefore(run.policy, look) && past(run) ? "bound" : null;
}

/**
 * Why a wait refuses after a look that found nothing, if it does.
 * @param run The wait.
 * @returns The refusal, or null to go on.
 */
function refusedAfter(run: Run): Refusal | null {
	return run.policy.check === "afterProbe" && past(run) ? "bound" : null;
}

/**
 * How long a sleep between two looks lasts.
 * @param run The wait.
 * @returns The sleep in milliseconds, or null to skip it.
 */
function sleepMs(run: Run): number | null {
	const { policy } = run;
	const cadence = policy.cadence === 0 ? 0 : durationOf(policy.cadence);
	if (policy.sleep === "full") return cadence;
	const left = run.deadlineAt - run.clock.now();
	if (policy.sleep === "cutOrSkip" && left <= 0) return null;
	return Math.min(cadence, Math.max(0, left));
}

/**
 * Sleep between two looks, when this side of a look is where the wait sleeps.
 * @param run The wait.
 * @param side Before or after the look.
 * @returns "aborted" when the signal woke the sleep, otherwise null.
 */
async function rest(run: Run, side: "before" | "after"): Promise<Refusal | null> {
	if ((run.policy.sleepFirst === true) !== (side === "before")) return null;
	const ms = sleepMs(run);
	if (ms === null) return null;
	return (await sleep(run.clock, ms, run.signal)) ? "aborted" : null;
}

/**
 * Whether a probe's answer is still to come.
 * @param answer The answer.
 * @returns True for a promise or another thenable.
 */
function isPending<T>(answer: T | PromiseLike<T>): answer is PromiseLike<T> {
	return (
		typeof answer === "object" &&
		answer !== null &&
		"then" in answer &&
		typeof answer.then === "function"
	);
}

/**
 * What one look found.
 * @param probe The look.
 * @returns Its value, or undefined while there is none.
 */
async function answerOf<T>(
	probe: () => T | undefined | PromiseLike<T | undefined>,
): Promise<T | undefined> {
	const answer = probe();
	return isPending(answer) ? await answer : answer;
}

/**
 * A wait's refusal.
 * @param run The wait.
 * @param reason Why it refuses, or null when it does not.
 * @returns The outcome, or undefined to go on.
 */
function refusal(run: Run, reason: Refusal | null): WaitOutcome<never> | undefined {
	return reason === null ? undefined : { ok: false, reason, boundSeconds: run.boundSeconds };
}

/**
 * One pass of a wait: its checks, its sleep and one look.
 * @param run The wait.
 * @param probe The look.
 * @param look How many looks came before this one.
 * @returns How the wait ended, or undefined to look again.
 */
async function pass<T>(
	run: Run,
	probe: () => T | undefined | PromiseLike<T | undefined>,
	look: number,
): Promise<WaitOutcome<T> | undefined> {
	const before = refusal(run, refusedBefore(run, look) ?? (await rest(run, "before")));
	if (before !== undefined) return before;
	const value = await answerOf(probe);
	if (value !== undefined) return { ok: true, value };
	return refusal(run, refusedAfter(run) ?? (await rest(run, "after")));
}

/**
 * Look with a probe until it finds something, on the named wait's cadence, until
 * its bound passes or a signal aborts it. Probes run one after another and never
 * overlap; an error a probe throws ends the wait and reaches the caller. A signal
 * that aborts wins over a bound that passed too.
 * @param wait Which wait, which brings its bound, its cadence and how it meets its bound.
 * @param probe One look: a value once there is one, `undefined` while there is not.
 * @param options A bound in place of the named one, an outer cap, a signal and a clock.
 * @returns The value found, or why there is none.
 */
async function waitUntil<T extends {} | null>(
	wait: WaitName,
	probe: () => T | undefined | PromiseLike<T | undefined>,
	options: WaitOptions = {},
): Promise<WaitOutcome<T>> {
	const run = startRun(wait, options);
	for (let look = 0; ; look += 1) {
		// oxlint-disable-next-line no-await-in-loop -- one look at a time: each decides whether to look again
		const outcome = await pass(run, probe, look);
		if (outcome !== undefined) return outcome;
	}
}

export { waitUntil };
export type { WaitOptions, WaitOutcome };
