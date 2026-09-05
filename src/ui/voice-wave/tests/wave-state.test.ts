import { describe, expect, test } from "bun:test";

import {
	FLAT_WAVE,
	approach,
	clampLevel,
	pulseOpacity,
	settledWave,
	stepWave,
	waveAnimates,
	waveStateText,
	waveTargets,
} from "@/ui/voice-wave/wave-state";

describe("wave targets", () => {
	test("inactive rests flat and never animates", () => {
		expect(waveTargets("inactive", 1)).toMatchObject({ amplitude: 0, frequency: 0, pulse: null });
		expect(waveAnimates("inactive", true, false)).toBe(false);
		expect(settledWave("inactive", 0.7)).toEqual(FLAT_WAVE);
	});

	test("listening and thinking idle without following the level", () => {
		expect(waveTargets("listening", 0.9)).toEqual(waveTargets("listening", 0));
		expect(waveTargets("thinking", 0.9)).toEqual(waveTargets("thinking", 0));
		expect(waveTargets("connecting", 0)).toEqual(waveTargets("thinking", 0));
		expect(waveTargets("listening", 0).pulse?.periodMs).toBeGreaterThan(
			waveTargets("thinking", 0).pulse?.periodMs ?? Number.POSITIVE_INFINITY,
		);
	});

	test("speaking amplitude and frequency follow the measured level immediately", () => {
		const quiet = waveTargets("speaking", 0);
		const loud = waveTargets("speaking", 1);
		expect(quiet.immediate).toBe(true);
		expect(loud.amplitude).toBeGreaterThan(quiet.amplitude);
		expect(loud.frequency).toBeGreaterThan(quiet.frequency);
		expect(waveTargets("speaking", 4)).toEqual(loud);
		expect(waveTargets("speaking", Number.NaN)).toEqual(quiet);
	});

	test("levels clamp to the unit interval", () => {
		expect(clampLevel(-1)).toBe(0);
		expect(clampLevel(0.25)).toBe(0.25);
		expect(clampLevel(Number.POSITIVE_INFINITY)).toBe(0);
	});
});

describe("frame stepping", () => {
	test("a pulse mirrors between one and its low point", () => {
		const pulse = { low: 0.3, periodMs: 400 };
		expect(pulseOpacity(pulse, 0)).toBe(1);
		expect(pulseOpacity(pulse, 400)).toBeCloseTo(0.3);
		expect(pulseOpacity(pulse, 800)).toBeCloseTo(1);
		expect(pulseOpacity(null, 12_345)).toBe(1);
	});

	test("easing settles on the target and snaps when close", () => {
		let value = 0;
		for (let index = 0; index < 60; index += 1) {
			value = approach(value, 1, 16);
		}
		expect(value).toBe(1);
		expect(approach(0, 1, 16)).toBeGreaterThan(0);
		expect(approach(0, 1, 16)).toBeLessThan(1);
	});

	test("speaking steps skip the ease; listening steps ease", () => {
		const speaking = stepWave(FLAT_WAVE, waveTargets("speaking", 1), 16, 0);
		expect(speaking.amplitude).toBe(waveTargets("speaking", 1).amplitude);
		const listening = stepWave(FLAT_WAVE, waveTargets("listening", 0), 16, 0);
		expect(listening.amplitude).toBeGreaterThan(0);
		expect(listening.amplitude).toBeLessThan(waveTargets("listening", 0).amplitude);
	});

	test("reduced motion and inactivity stop the loop", () => {
		expect(waveAnimates("speaking", true, true)).toBe(false);
		expect(waveAnimates("speaking", false, false)).toBe(false);
		expect(waveAnimates("speaking", true, false)).toBe(true);
	});

	test("every state has readable text", () => {
		for (const state of ["inactive", "connecting", "listening", "thinking", "speaking"] as const) {
			expect(waveStateText(state).length).toBeGreaterThan(0);
		}
	});
});
