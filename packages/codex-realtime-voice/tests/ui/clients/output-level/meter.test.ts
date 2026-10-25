import { describe, expect, test } from "bun:test";

import {
	createWebAudioOutputMeter,
	rootMeanSquareLevel,
	webAudioSupported,
} from "#ui/clients/output-level/meter.ts";
import type { VoiceOutputPlayback } from "#ui/clients/output-level/meter.ts";

/** A playback stream with nothing on it. */
const SILENT_PLAYBACK: VoiceOutputPlayback = {
	/**
	 * No tracks.
	 * @returns An empty list.
	 */
	getAudioTracks: () => [],
};

describe("voice output meter", () => {
	test("measures root-mean-square level around the byte midpoint", () => {
		expect(rootMeanSquareLevel(Uint8Array.from([128, 128, 128, 128]))).toBe(0);
		expect(rootMeanSquareLevel(Uint8Array.from([128, 192, 128, 64]))).toBe(0.3535533905932738);
		expect(rootMeanSquareLevel(Uint8Array.from([0, 255]))).toBeCloseTo(1, 1);
		expect(rootMeanSquareLevel(Uint8Array.from([]))).toBe(0);
	});

	test("builds no Web Audio meter where the browser has no Web Audio", () => {
		expect(webAudioSupported()).toBe(false);
		expect(createWebAudioOutputMeter(SILENT_PLAYBACK)).toBeNull();
	});
});
