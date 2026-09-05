import { describe, expect, test } from "bun:test";

import { createVoiceOutputLevelSource, rootMeanSquareLevel } from "@/ui/voice-output-level";
import type {
	VoiceOutputFrameScheduler,
	VoiceOutputMeter,
	VoiceOutputPlaybackState,
} from "@/ui/voice-output-level";

/** A scheduler stepped by hand. */
interface SteppedScheduler extends VoiceOutputFrameScheduler {
	readonly pending: () => number;
	readonly step: () => void;
}

/**
 * A frame scheduler that runs frames only when told to.
 * @returns The scheduler.
 */
function steppedScheduler(): SteppedScheduler {
	const frames = new Map<number, () => void>();
	let next = 0;
	return {
		/**
		 * Schedules a frame.
		 * @param callback The frame.
		 * @returns The handle.
		 */
		requestFrame: (callback) => {
			next += 1;
			frames.set(next, callback);
			return next;
		},
		/**
		 * Cancels a frame.
		 * @param handle The handle.
		 */
		cancelFrame: (handle) => {
			frames.delete(handle);
		},
		/**
		 * How many frames are waiting.
		 * @returns The count.
		 */
		pending: () => frames.size,
		/**
		 * Runs the earliest frame.
		 */
		step: () => {
			const entry = frames.entries().next().value;
			if (entry === undefined) {
				return;
			}
			frames.delete(entry[0]);
			entry[1]();
		},
	};
}

/** A meter whose samples and playback state the test sets. */
interface ScriptedMeter extends VoiceOutputMeter {
	samples: number[];
	state: VoiceOutputPlaybackState;
	readonly closes: () => number;
	readonly reads: () => number;
}

/**
 * A meter reading scripted samples.
 * @param samples The initial samples.
 * @returns The meter.
 */
function scriptedMeter(samples: number[] = [128, 192, 128, 64]): ScriptedMeter {
	let closes = 0;
	let reads = 0;
	const meter: ScriptedMeter = {
		samples,
		state: "running",
		/**
		 * The playback state.
		 * @returns The scripted state.
		 */
		playback: () => meter.state,
		/**
		 * Resumes.
		 * @returns Resolved.
		 */
		resume: () => {
			meter.state = "running";
			return Promise.resolve();
		},
		/**
		 * Reads the scripted samples.
		 * @returns Their RMS.
		 */
		read: () => {
			reads += 1;
			return rootMeanSquareLevel(Uint8Array.from(meter.samples));
		},
		/**
		 * Closes.
		 */
		close: () => {
			closes += 1;
			meter.state = "closed";
		},
		/**
		 * How often close ran.
		 * @returns The count.
		 */
		closes: () => closes,
		/**
		 * How often read ran.
		 * @returns The count.
		 */
		reads: () => reads,
	};
	return meter;
}

describe("voice output level source", () => {
	test("publishes the followed meter's level once per frame and only when it moves", () => {
		const frames = steppedScheduler();
		const source = createVoiceOutputLevelSource(frames);
		const meter = scriptedMeter();
		const published: number[] = [];
		source.subscribe((level) => published.push(level));

		expect(source.current()).toBe(0);
		source.follow(meter);
		expect(frames.pending()).toBe(1);
		frames.step();
		expect(source.current()).toBe(0.3535533905932738);
		frames.step();
		expect(published).toEqual([0.3535533905932738]);
		meter.samples = [128, 128, 128, 128];
		frames.step();
		expect(published).toEqual([0.3535533905932738, 0]);
		expect(meter.reads()).toBe(3);
		expect(frames.pending()).toBe(1);
		source.settle();
	});

	test("reads nothing from a suspended or closed meter and settles to silence", () => {
		const frames = steppedScheduler();
		const source = createVoiceOutputLevelSource(frames);
		const meter = scriptedMeter();
		source.follow(meter);
		frames.step();
		expect(source.current()).toBeGreaterThan(0);

		meter.state = "suspended";
		frames.step();
		expect(source.current()).toBe(0);
		expect(meter.reads()).toBe(1);

		meter.state = "running";
		frames.step();
		expect(source.current()).toBeGreaterThan(0);

		source.settle();
		expect(source.current()).toBe(0);
		expect(meter.closes()).toBe(1);
		expect(frames.pending()).toBe(0);
		// A settled source stays silent and schedules nothing.
		source.settle();
		expect(meter.closes()).toBe(1);
		expect(frames.pending()).toBe(0);
	});

	test("following a second meter releases the first before any frame of the second", () => {
		const frames = steppedScheduler();
		const source = createVoiceOutputLevelSource(frames);
		const first = scriptedMeter();
		const second = scriptedMeter([128, 128, 128, 128]);
		source.follow(first);
		frames.step();
		source.follow(second);
		expect(first.closes()).toBe(1);
		expect(frames.pending()).toBe(1);
		frames.step();
		expect(source.current()).toBe(0);
		expect(first.reads()).toBe(1);
		expect(second.reads()).toBe(1);
		source.dispose();
		expect(second.closes()).toBe(1);
	});

	test("a throwing subscriber cannot stop later subscribers or the loop", () => {
		const frames = steppedScheduler();
		const source = createVoiceOutputLevelSource(frames);
		const later: number[] = [];
		source.subscribe(() => {
			throw new Error("consumer");
		});
		source.subscribe((level) => later.push(level));
		source.follow(scriptedMeter());
		frames.step();
		expect(later).toHaveLength(1);
		expect(frames.pending()).toBe(1);
		source.dispose();
	});

	test("a disposed source closes any meter it is handed and admits no subscriber", () => {
		const frames = steppedScheduler();
		const source = createVoiceOutputLevelSource(frames);
		let notified = 0;
		source.dispose();
		const meter = scriptedMeter();
		source.follow(meter);
		expect(meter.closes()).toBe(1);
		expect(frames.pending()).toBe(0);
		source.subscribe(() => {
			notified += 1;
		});
		source.settle();
		expect(notified).toBe(0);
		expect(source.current()).toBe(0);
	});
});
