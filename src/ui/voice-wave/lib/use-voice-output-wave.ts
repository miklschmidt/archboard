// The Archboard-owned replacement for LiveKit's `useAgentAudioVisualizerWave`.
// The upstream hook reads a room track and tweens with the motion library;
// this one takes typed inputs, the measured model output level among them, and
// runs one requestAnimationFrame loop while the session is live.

import { useEffect, useRef, useState } from "react";

import {
	FLAT_WAVE,
	sameWave,
	settledWave,
	stepWave,
	waveAnimates,
	waveTargets,
} from "@/ui/voice-wave/wave-state";
import type { VoiceWaveState, WaveValues } from "@/ui/voice-wave/wave-state";

/** What drives the wave. There is no microphone path: `level` is model output. */
interface VoiceOutputWaveInputs {
	state: VoiceWaveState;
	/** Measured model output level, 0..1. */
	level: number;
	reducedMotion: boolean;
	/** False stops the loop and rests the wave, whatever the state says. */
	active: boolean;
}

/** One frame loop's bookkeeping, kept out of React state. */
interface LoopClock {
	frame: number;
	lastMs: number;
	stateSinceMs: number;
	state: VoiceWaveState;
}

/**
 * Whether the loop's state clock should restart.
 * @param clock The loop clock.
 * @param state The state this frame.
 * @param nowMs The frame timestamp.
 * @returns The clock, restarted when the state changed.
 */
function clockFor(clock: LoopClock, state: VoiceWaveState, nowMs: number): LoopClock {
	if (clock.state === state) {
		return clock;
	}
	return { ...clock, state, stateSinceMs: nowMs };
}

/**
 * The shader inputs for the current voice output state.
 * @param inputs The typed voice output inputs.
 * @returns Speed, amplitude, frequency and opacity for the wave shader.
 */
function useVoiceOutputWave(inputs: VoiceOutputWaveInputs): WaveValues {
	const [values, setValues] = useState<WaveValues>(FLAT_WAVE);
	const latest = useRef(inputs);
	useEffect(() => {
		latest.current = inputs;
	}, [inputs]);
	const animating = waveAnimates(inputs.state, inputs.active, inputs.reducedMotion);

	useEffect(() => {
		if (!animating) {
			const current = latest.current;
			const rest = current.active ? settledWave(current.state, current.level) : FLAT_WAVE;
			setValues((previous) => (sameWave(previous, rest) ? previous : rest));
			return undefined;
		}
		let clock: LoopClock = {
			frame: 0,
			lastMs: performance.now(),
			stateSinceMs: performance.now(),
			state: latest.current.state,
		};
		/**
		 * One animation frame: ease toward the current targets and schedule the next.
		 * @param nowMs The frame timestamp.
		 */
		const tick = (nowMs: number): void => {
			const current = latest.current;
			clock = clockFor(clock, current.state, nowMs);
			const targets = waveTargets(current.state, current.level);
			const deltaMs = nowMs - clock.lastMs;
			clock.lastMs = nowMs;
			setValues((previous) => {
				const next = stepWave(previous, targets, deltaMs, nowMs - clock.stateSinceMs);
				return sameWave(previous, next) ? previous : next;
			});
			clock.frame = requestAnimationFrame(tick);
		};
		clock.frame = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(clock.frame);
		};
	}, [animating]);

	return values;
}

export { useVoiceOutputWave, type VoiceOutputWaveInputs, type VoiceWaveState, type WaveValues };
