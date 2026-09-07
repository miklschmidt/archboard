// Reading a child process's output without letting it grow without bound.
//
// A Git command that prints megabytes is a Git command that has gone wrong,
// and holding all of it would make this process the casualty. So the read
// keeps at most a fixed budget and says the moment it is passed, leaving the
// caller to decide that the command is over.

import { asError } from "@/runtime/engine/lib/thrown-error";

const GIT_OUTPUT_LIMIT_BYTES = 64 * 1024;

interface DrainOutcome {
	bytes: Uint8Array;
	exceeded: boolean;
	error?: Error;
}

interface BoundedDrain {
	readonly result: Promise<DrainOutcome>;
	cancel(reason: Error): Promise<void>;
}

/**
 * Read a stream to its end, keeping at most the output limit and reporting
 * the moment it is exceeded.
 * @param stream The child's stdout or stderr.
 * @param onExcess Called once when the limit is passed.
 * @param onFailure Called when the read itself fails.
 * @returns The kept bytes as a promise, and a way to cut the read short.
 */
function drainBounded(
	stream: ReadableStream<Uint8Array>,
	onExcess: () => void,
	onFailure: (error: Error) => void,
): BoundedDrain {
	const reader = stream.getReader();
	let chunks: Uint8Array[] = [];
	let kept = 0;
	let seen = 0;
	let exceeded = false;
	let finished = false;
	let finish!: (value: DrainOutcome) => void;
	const result = new Promise<DrainOutcome>((resolve) => {
		finish = resolve;
	});
	/**
	 * Assemble what was kept so far.
	 * @param error The read failure, if any.
	 * @returns The kept bytes, whether the limit was passed, and the failure.
	 */
	const outcome = (error?: Error): DrainOutcome => {
		const bytes = new Uint8Array(kept);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return { bytes, exceeded, ...(error ? { error } : {}) };
	};
	/**
	 * Resolve the result once and drop the chunks.
	 * @param value The final outcome.
	 */
	const settle = (value: DrainOutcome): void => {
		if (finished) {
			return;
		}
		finished = true;
		finish(value);
		chunks = [];
	};
	/**
	 * Keep one chunk up to the limit and notice when the total passes it.
	 * @param value The chunk read.
	 */
	const take = (value: Uint8Array): void => {
		seen += value.byteLength;
		if (kept < GIT_OUTPUT_LIMIT_BYTES) {
			const room = GIT_OUTPUT_LIMIT_BYTES - kept;
			const chunk = value.byteLength <= room ? value : value.slice(0, room);
			chunks.push(chunk);
			kept += chunk.byteLength;
		}
		if (!exceeded && seen > GIT_OUTPUT_LIMIT_BYTES) {
			exceeded = true;
			onExcess();
		}
	};
	/**
	 * Read until the stream ends or fails.
	 * @returns The outcome to settle with.
	 */
	const drain = async (): Promise<DrainOutcome> => {
		let error: Error | undefined;
		try {
			for (;;) {
				// oxlint-disable-next-line no-await-in-loop -- a stream is read one chunk after another
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				take(value);
			}
		} catch (cause) {
			error = asError(cause);
			onFailure(error);
		} finally {
			reader.releaseLock();
		}
		return outcome(error);
	};
	void drain().then(settle);
	return {
		result,
		/**
		 * Settle with what was read so far and stop reading.
		 * @param reason Why the read is being abandoned.
		 */
		cancel: async (reason: Error): Promise<void> => {
			settle(outcome(reason));
			try {
				void reader.cancel(reason).catch(() => undefined);
			} catch {
				// The result was already terminalized; the stream may also have settled.
			}
		},
	};
}

export { type BoundedDrain, type DrainOutcome, drainBounded };
