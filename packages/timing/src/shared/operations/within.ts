import { type Bound, lengthOf } from "#shared/constants/waits.ts";
import { TimedOut } from "#shared/operations/timed-out.ts";

interface WithinOptions {
	/** The caller's own signal: when it aborts, the work is aborted and the wait rejects with its reason. */
	readonly signal?: AbortSignal;
	/** A length the caller read from its own environment, in place of the declared one. */
	readonly ms?: number;
}

/**
 * Run work bounded by a declared wait. The work gets a signal that aborts when the bound runs out
 * or the caller's signal aborts, so an inner wait never outlives an outer one. The bound is one
 * timer that carries the wait's name, and it is cleared once the work settles.
 *
 * Expiry rejects at once with `TimedOut`, without waiting for the work: the caller decides what
 * the work's state is, because a timeout never proves that it stopped.
 * @param wait The bound.
 * @param work The work, given the signal it should stop on.
 * @param options The caller's signal, and an override of the bound's length.
 * @returns The work's value.
 * @throws {TimedOut} When the bound runs out first.
 */
function within<T>(
	wait: Bound,
	work: (signal: AbortSignal) => Promise<T>,
	options: WithinOptions = {},
): Promise<T> {
	const { signal } = options;
	if (signal?.aborted) return Promise.reject(signal.reason);
	const ms = options.ms ?? lengthOf(wait);
	const controller = new AbortController();
	return new Promise<T>((resolve, reject) => {
		/**
		 * End the race once: release the timer and the caller's signal, then settle.
		 * @param settle How the race ends.
		 */
		const end = (settle: () => void): void => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", abandon);
			settle();
		};
		/** Abort the work for the caller's reason. */
		const abandon = (): void => {
			controller.abort(signal?.reason);
			end(() => reject(signal?.reason));
		};
		const timer = setTimeout(
			() => {
				const timedOut = new TimedOut(wait, ms);
				controller.abort(timedOut);
				end(() => reject(timedOut));
			},
			ms,
			wait,
		);
		signal?.addEventListener("abort", abandon, { once: true });
		try {
			work(controller.signal).then(
				(value) => end(() => resolve(value)),
				(error: unknown) => end(() => reject(error)),
			);
		} catch (error) {
			end(() => reject(error));
		}
	});
}

export { within };
