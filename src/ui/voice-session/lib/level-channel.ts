// The level channel: the adapter's own subscription surface over whichever
// output level source the media owner currently holds. Sources come and go
// with realtime sessions; subscribers here never notice the swap.

import type { VoiceOutputLevelSource } from "@/ui/voice-output-level";

/**
 * Does nothing; the release of a source that was never followed.
 */
function noop(): void {
	// Nothing to release.
}

/** The channel. */
interface LevelChannel {
	readonly level: () => number;
	readonly subscribe: (listener: () => void) => () => void;
	/** Re-reads the owner's current source and follows it when it changed. */
	readonly follow: (source: VoiceOutputLevelSource | null) => void;
	readonly dispose: () => void;
}

/**
 * Creates a level channel.
 * @returns The channel.
 */
function createLevelChannel(): LevelChannel {
	const listeners = new Set<() => void>();
	let source: VoiceOutputLevelSource | null = null;
	let release: () => void = noop;
	let disposed = false;

	/**
	 * Tells every subscriber the level moved.
	 */
	const announce = (): void => {
		const notified = [...listeners];
		for (const listener of notified) {
			try {
				listener();
			} catch {
				// A subscriber cannot take ownership of the level channel.
			}
		}
	};

	return Object.freeze({
		/**
		 * The current level.
		 * @returns A number in 0..1, or 0 between sessions.
		 */
		level: () => source?.current() ?? 0,
		/**
		 * Subscribes.
		 * @param listener The listener.
		 * @returns The unsubscribe function.
		 */
		subscribe: (listener: () => void) => {
			if (disposed) {
				return () => undefined;
			}
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		/**
		 * Follows the owner's current source.
		 * @param next The source, or null between sessions.
		 */
		follow: (next: VoiceOutputLevelSource | null) => {
			if (disposed || next === source) {
				return;
			}
			release();
			source = next;
			release = next === null ? noop : next.subscribe(announce);
			announce();
		},
		/**
		 * Releases the source and every subscriber.
		 */
		dispose: () => {
			disposed = true;
			release();
			source = null;
			listeners.clear();
		},
	});
}

export { createLevelChannel, type LevelChannel };
