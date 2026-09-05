// The output level source: one animation-frame loop over the meter it is
// following, publishing a number in 0..1 on its own channel. It measures the
// model's playback only; nothing here ever sees a microphone.

import type { VoiceOutputMeter } from "@/ui/voice-output-level/lib/meter";

/** Frame scheduling, injectable so a test can step frames by hand. */
interface VoiceOutputFrameScheduler {
	readonly requestFrame: (callback: () => void) => number;
	readonly cancelFrame: (handle: number) => void;
}

/** Receives every published level. */
type VoiceOutputLevelListener = (level: number) => void;

/** The measured model output level as an external store. */
interface VoiceOutputLevelSource {
	/** The latest published level, 0..1. */
	readonly current: () => number;
	readonly subscribe: (listener: VoiceOutputLevelListener) => () => void;
	/** Follows one playback meter, releasing any previous one. */
	readonly follow: (meter: VoiceOutputMeter) => void;
	/** Stops following, closes the meter, and settles the level to 0. */
	readonly settle: () => void;
	/** Settles and refuses further followers and subscribers. */
	readonly dispose: () => void;
}

/**
 * The browser's own animation frames.
 * @returns A scheduler over requestAnimationFrame.
 */
function browserFrameScheduler(): VoiceOutputFrameScheduler {
	return Object.freeze({
		/**
		 * Schedules one frame.
		 * @param callback The frame.
		 * @returns The frame handle.
		 */
		requestFrame: (callback: () => void) => globalThis.requestAnimationFrame(callback),
		/**
		 * Cancels one frame.
		 * @param handle The frame handle.
		 */
		cancelFrame: (handle: number) => {
			globalThis.cancelAnimationFrame(handle);
		},
	});
}

/** The loop's bookkeeping for one followed meter. */
interface Following {
	readonly meter: VoiceOutputMeter;
	frame: number | null;
}

/**
 * Whether a level differs enough from the last published one to publish.
 * @param previous The published level.
 * @param next The measured level.
 * @returns True when they differ.
 */
function levelMoved(previous: number, next: number): boolean {
	return previous !== next;
}

/**
 * Creates an output level source.
 * @param frames The frame scheduler.
 * @returns The source.
 */
function createVoiceOutputLevelSource(frames: VoiceOutputFrameScheduler): VoiceOutputLevelSource {
	let level = 0;
	let following: Following | null = null;
	let disposed = false;
	const listeners = new Set<VoiceOutputLevelListener>();

	/**
	 * Publishes a level to every listener when it moved.
	 * @param next The measured level.
	 */
	const publish = (next: number): void => {
		if (!levelMoved(level, next)) {
			return;
		}
		level = next;
		const cohort = [...listeners];
		for (const listener of cohort) {
			try {
				listener(level);
			} catch {
				// A subscriber cannot take ownership of the level loop.
			}
		}
	};

	/**
	 * Stops the loop and closes the meter it followed.
	 */
	const release = (): void => {
		const active = following;
		following = null;
		if (active === null) {
			return;
		}
		if (active.frame !== null) {
			frames.cancelFrame(active.frame);
		}
		active.meter.close();
	};

	/**
	 * One frame: read the meter while it is still the followed one and running.
	 * @param active The followed meter.
	 */
	const tick = (active: Following): void => {
		active.frame = null;
		if (following !== active) {
			return;
		}
		publish(active.meter.playback() === "running" ? active.meter.read() : 0);
		if (following === active) {
			active.frame = frames.requestFrame(() => tick(active));
		}
	};

	return Object.freeze({
		/**
		 * The latest level.
		 * @returns A number in 0..1.
		 */
		current: () => level,
		/**
		 * Subscribes to level publications.
		 * @param listener The listener.
		 * @returns The unsubscribe function.
		 */
		subscribe: (listener: VoiceOutputLevelListener) => {
			if (disposed) {
				return () => undefined;
			}
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		/**
		 * Follows one meter.
		 * @param meter The playback meter.
		 */
		follow: (meter: VoiceOutputMeter) => {
			release();
			if (disposed) {
				meter.close();
				return;
			}
			const active: Following = { meter, frame: null };
			following = active;
			active.frame = frames.requestFrame(() => tick(active));
		},
		/**
		 * Stops following and settles to silence.
		 */
		settle: () => {
			release();
			publish(0);
		},
		/**
		 * Settles and closes the channel.
		 */
		dispose: () => {
			release();
			publish(0);
			disposed = true;
			listeners.clear();
		},
	});
}

export {
	browserFrameScheduler,
	createVoiceOutputLevelSource,
	type VoiceOutputFrameScheduler,
	type VoiceOutputLevelListener,
	type VoiceOutputLevelSource,
};
