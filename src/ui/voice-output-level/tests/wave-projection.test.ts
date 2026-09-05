import { describe, expect, test } from "bun:test";

import { REALTIME_PHASES } from "@/ui/codex-realtime";
import {
	VOICE_OUTPUT_SPEAKING_LEVEL,
	clampOutputLevel,
	createWebAudioOutputMeter,
	projectVoiceOutputWave,
	rootMeanSquareLevel,
	webAudioSupported,
} from "@/ui/voice-output-level";
import type { VoiceOutputPlayback } from "@/ui/voice-output-level";

/** A playback stream with nothing on it. */
const SILENT_PLAYBACK: VoiceOutputPlayback = {
	/**
	 * No tracks.
	 * @returns An empty list.
	 */
	getAudioTracks: () => [],
};

describe("voice output wave projection", () => {
	test("rests flat with no session and after it ends or fails", () => {
		for (const phase of [
			null,
			"idle",
			"stopping",
			"closed",
			"recoverable_error",
			"terminal_error",
		] as const) {
			expect(projectVoiceOutputWave(phase, 0.9), String(phase)).toEqual({
				state: "inactive",
				level: 0,
				active: false,
			});
		}
	});

	test("connects while the session is being negotiated, whatever is measured", () => {
		for (const phase of ["requesting_permission", "negotiating"] as const) {
			expect(projectVoiceOutputWave(phase, 0.9)).toEqual({
				state: "connecting",
				level: 0,
				active: true,
			});
		}
	});

	test("listens, thinks, and speaks by phase when the model is silent", () => {
		expect(projectVoiceOutputWave("listening", 0)).toEqual({
			state: "listening",
			level: 0,
			active: true,
		});
		expect(projectVoiceOutputWave("muted", 0).state).toBe("listening");
		expect(projectVoiceOutputWave("processing", 0).state).toBe("thinking");
		expect(projectVoiceOutputWave("speaking", 0).state).toBe("speaking");
	});

	test("measured model output raises a live session into speaking, muted or not", () => {
		const level = VOICE_OUTPUT_SPEAKING_LEVEL;
		expect(projectVoiceOutputWave("listening", level)).toEqual({
			state: "speaking",
			level,
			active: true,
		});
		expect(projectVoiceOutputWave("muted", 0.5).state).toBe("speaking");
		expect(projectVoiceOutputWave("processing", 0.5).state).toBe("speaking");
		expect(projectVoiceOutputWave("listening", level / 2).state).toBe("listening");
	});

	test("covers every realtime phase", () => {
		for (const phase of REALTIME_PHASES) {
			const view = projectVoiceOutputWave(phase, 0.5);
			expect(["inactive", "connecting", "listening", "thinking", "speaking"], phase).toContain(
				view.state,
			);
			expect(view.active, phase).toBe(view.state !== "inactive");
		}
	});

	test("clamps unmeasurable and out-of-range levels", () => {
		expect(clampOutputLevel(Number.NaN)).toBe(0);
		expect(clampOutputLevel(-1)).toBe(0);
		expect(clampOutputLevel(4)).toBe(1);
		expect(projectVoiceOutputWave("speaking", 4).level).toBe(1);
		expect(projectVoiceOutputWave("speaking", Number.NaN).level).toBe(0);
	});
});

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
