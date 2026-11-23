import { type Polled, lengthOf } from "#shared/constants/waits.ts";
import { TimedOut } from "#shared/operations/timed-out.ts";

/**
 * The first pause between two looks. Most conditions a caller polls hold within milliseconds, such
 * as a killed process group leaving, so the first looks come close together.
 */
const FIRST_PAUSE_MS = 10;

/**
 * The longest pause between two looks. Each pause doubles up to it, so a condition that takes
 * seconds is looked at four times a second and never hammered: a health probe, a page's state, a
 * thread status read. It is also the most a caller learns late that its condition held.
 */
const LONGEST_PAUSE_MS = 250;

interface PollOptions {
	/** The caller's own signal: when it aborts, the wait rejects with its reason. */
	readonly signal?: AbortSignal | undefined;
}

/** The end of the wait, as one timer that carries the wait's name. */
interface Expiry {
	readonly expired: () => boolean;
	/** Resolve after a pause, or as soon as the wait ends. */
	readonly pause: (ms: number) => Promise<void>;
	readonly release: () => void;
}

/**
 * Start the timer that ends a wait.
 * @param wait The wait.
 * @param signal The caller's signal.
 * @returns The expiry and its pause.
 */
function startExpiry(wait: Polled, signal: AbortSignal | undefined): Expiry {
	let expired = false;
	let wake: (() => void) | undefined;
	const timer = setTimeout(
		() => {
			expired = true;
			wake?.();
		},
		lengthOf(wait),
		wait,
	);
	/**
	 * Pause between two looks.
	 * @param ms The pause.
	 * @returns Resolves after it, or as soon as the wait runs out.
	 */
	const pause = (ms: number): Promise<void> => {
		signal?.throwIfAborted();
		return new Promise<void>((resolve) => {
			/** End the pause and drop its timer. */
			const done = (): void => {
				clearTimeout(rest);
				wake = undefined;
				resolve();
			};
			const rest = setTimeout(done, ms);
			wake = done;
		});
	};
	/**
	 * Whether the wait has run out.
	 * @returns True once its timer fired.
	 */
	const expiredYet = (): boolean => expired;
	/** Drop the wait's timer and any pending pause. */
	const release = (): void => {
		clearTimeout(timer);
		wake?.();
	};
	return { expired: expiredYet, pause, release };
}

/**
 * Look at a condition until it holds, within a declared wait. The first look is at once, the
 * pauses between looks grow from a few milliseconds to a quarter second, and one last look is
 * taken when the wait runs out, so a condition that holds at the end is never reported as a
 * timeout. If a look is already in flight and finds nothing, the last look follows it without
 * a pause.
 * @param wait The wait.
 * @param look Returns what the caller waits for, or undefined while it does not hold yet.
 * @param options The caller's signal, which ends the wait even if a look is still in flight.
 * @returns What the look returned once the condition held.
 * @throws {TimedOut} When the last look found that it still does not hold.
 */
async function pollUntil<T>(
	wait: Polled,
	look: () => T | undefined | Promise<T | undefined>,
	options: PollOptions = {},
): Promise<T> {
	const { signal } = options;
	signal?.throwIfAborted();
	const expiry = startExpiry(wait, signal);
	const cancelled = Promise.withResolvers<never>();
	/** Reject the wait for the caller's reason. */
	const abandon = (): void => {
		cancelled.reject(signal?.reason);
	};
	/**
	 * Look in series until the condition holds, the wait ends, or the caller cancels.
	 * @returns The first value found.
	 */
	const observe = async (): Promise<T> => {
		for (let pause = FIRST_PAUSE_MS; ; pause = Math.min(2 * pause, LONGEST_PAUSE_MS)) {
			signal?.throwIfAborted();
			const finalLook = expiry.expired();
			// oxlint-disable-next-line no-await-in-loop -- one look after another until the condition holds
			const seen = await look();
			if (seen !== undefined) return seen;
			if (finalLook) throw new TimedOut(wait);
			if (expiry.expired()) continue;
			// oxlint-disable-next-line no-await-in-loop -- the pause between two looks
			await expiry.pause(pause);
		}
	};
	signal?.addEventListener("abort", abandon, { once: true });
	try {
		return await (signal === undefined ? observe() : Promise.race([cancelled.promise, observe()]));
	} finally {
		expiry.release();
		signal?.removeEventListener("abort", abandon);
	}
}

export { pollUntil };
