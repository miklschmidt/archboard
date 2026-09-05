// The pure mapping from Archboard's voice output state to the wave renderer's
// shader inputs. This replaces the LiveKit hook's `AgentState` switch and its
// motion-library tweens with plain numbers a frame loop can ease toward.

/** What the model's audio output is doing, as the voice session reports it. */
type VoiceWaveState = "inactive" | "connecting" | "listening" | "thinking" | "speaking";

/** The values the official wave shader is fed each frame. */
interface WaveValues {
	speed: number;
	amplitude: number;
	frequency: number;
	opacity: number;
}

/** An opacity pulse: mirrored between 1 and `low` every `periodMs`. */
interface OpacityPulse {
	low: number;
	periodMs: number;
}

/** Where the wave should settle for one state and output level. */
interface WaveTargets {
	speed: number;
	amplitude: number;
	frequency: number;
	/** Null when opacity rests at 1. */
	pulse: OpacityPulse | null;
	/** True when amplitude and frequency follow the level without easing. */
	immediate: boolean;
}

/** The upstream defaults: `DEFAULT_SPEED`, `DEFAULT_AMPLITUDE`, `DEFAULT_FREQUENCY`. */
const BASE_SPEED = 5;
const BASE_AMPLITUDE = 0.025;
const BASE_FREQUENCY = 10;
/** Upstream eases state transitions over 200 ms. */
const EASE_MS = 200;
/** The lime status accent, as `--status` is defined in both themes. */
const FALLBACK_STATUS_COLOR: `#${string}` = "#a3e635";

const IDLE_PULSE: OpacityPulse = { low: 0.3, periodMs: 750 };
const BUSY_PULSE: OpacityPulse = { low: 0.3, periodMs: 400 };

const BUSY_TARGETS: WaveTargets = {
	speed: BASE_SPEED * 4,
	amplitude: BASE_AMPLITUDE / 4,
	frequency: BASE_FREQUENCY * 4,
	pulse: BUSY_PULSE,
	immediate: false,
};

/** The resting targets of every state that does not follow the output level. */
const RESTING_TARGETS: Record<Exclude<VoiceWaveState, "speaking">, WaveTargets> = {
	inactive: { speed: BASE_SPEED, amplitude: 0, frequency: 0, pulse: null, immediate: false },
	listening: {
		speed: BASE_SPEED,
		amplitude: BASE_AMPLITUDE,
		frequency: BASE_FREQUENCY,
		pulse: IDLE_PULSE,
		immediate: false,
	},
	thinking: BUSY_TARGETS,
	connecting: BUSY_TARGETS,
};

const STATE_TEXT: Record<VoiceWaveState, string> = {
	inactive: "Voice inactive",
	connecting: "Connecting voice",
	listening: "Listening",
	thinking: "Thinking",
	speaking: "Speaking",
};

/** The flat line: what the wave shows before a session and after it ends. */
const FLAT_WAVE: WaveValues = { speed: BASE_SPEED, amplitude: 0, frequency: 0, opacity: 1 };

/**
 * A measured output level clamped to the unit interval; anything unmeasurable
 * counts as silence.
 * @param level The level as measured, possibly out of range or NaN.
 * @returns A number in 0..1.
 */
function clampLevel(level: number): number {
	if (!Number.isFinite(level)) {
		return 0;
	}
	return Math.min(1, Math.max(0, level));
}

/**
 * The wave's resting values for one state, following the LiveKit hook's
 * per-state switch: listening idles slowly, thinking and connecting buzz fast
 * and small, speaking follows the measured output level.
 * @param state The voice output state.
 * @param level The measured model output level, 0..1.
 * @returns The targets the frame loop eases toward.
 */
function waveTargets(state: VoiceWaveState, level: number): WaveTargets {
	if (state === "speaking") {
		const clamped = clampLevel(level);
		return {
			speed: BASE_SPEED * 2,
			amplitude: 0.015 + 0.4 * clamped,
			frequency: 20 + 60 * clamped,
			pulse: null,
			immediate: true,
		};
	}
	return RESTING_TARGETS[state];
}

/**
 * The opacity of a mirrored pulse at one moment: 1 at the start of a period,
 * `low` halfway through, back to 1 at the end.
 * @param pulse The pulse, or null for a steady wave.
 * @param elapsedMs Milliseconds since the pulse began.
 * @returns An opacity in `low`..1.
 */
function pulseOpacity(pulse: OpacityPulse | null, elapsedMs: number): number {
	if (pulse === null) {
		return 1;
	}
	const phase = (elapsedMs % (pulse.periodMs * 2)) / pulse.periodMs;
	const towardsLow = phase <= 1 ? phase : 2 - phase;
	return 1 - (1 - pulse.low) * towardsLow;
}

/**
 * One easing step: an exponential approach that covers most of the remaining
 * distance within `EASE_MS`, frame-rate independent.
 * @param current The value now.
 * @param target The value to approach.
 * @param deltaMs Milliseconds since the previous step.
 * @returns The next value.
 */
function approach(current: number, target: number, deltaMs: number): number {
	const remaining = Math.exp(-deltaMs / (EASE_MS / 3));
	const next = target + (current - target) * remaining;
	return Math.abs(next - target) < 1e-4 ? target : next;
}

/**
 * The next frame's values.
 * @param previous The values shown on the previous frame.
 * @param targets Where this state wants to be.
 * @param deltaMs Milliseconds since the previous frame.
 * @param elapsedMs Milliseconds since the current state began.
 * @returns The values for this frame.
 */
function stepWave(
	previous: WaveValues,
	targets: WaveTargets,
	deltaMs: number,
	elapsedMs: number,
): WaveValues {
	return {
		speed: targets.speed,
		amplitude: targets.immediate
			? targets.amplitude
			: approach(previous.amplitude, targets.amplitude, deltaMs),
		frequency: targets.immediate
			? targets.frequency
			: approach(previous.frequency, targets.frequency, deltaMs),
		opacity: pulseOpacity(targets.pulse, elapsedMs),
	};
}

/**
 * The values a state settles on when nothing animates: reduced motion, or an
 * inactive session.
 * @param state The voice output state.
 * @param level The measured model output level, 0..1.
 * @returns Static values with a steady opacity.
 */
function settledWave(state: VoiceWaveState, level: number): WaveValues {
	const targets = waveTargets(state, level);
	return {
		speed: targets.speed,
		amplitude: targets.amplitude,
		frequency: targets.frequency,
		opacity: 1,
	};
}

/**
 * Whether two frames differ enough to be worth a render.
 * @param left One frame's values.
 * @param right Another frame's values.
 * @returns True when any value moved.
 */
function sameWave(left: WaveValues, right: WaveValues): boolean {
	return (
		left.speed === right.speed &&
		left.amplitude === right.amplitude &&
		left.frequency === right.frequency &&
		left.opacity === right.opacity
	);
}

/**
 * The state text a person reads or hears beside the wave.
 * @param state The voice output state.
 * @returns A short phrase.
 */
function waveStateText(state: VoiceWaveState): string {
	return STATE_TEXT[state];
}

/**
 * Whether the animation loop should run at all.
 * @param state The voice output state.
 * @param active Whether the session is live.
 * @param reducedMotion Whether motion is reduced by preference or prop.
 * @returns True when frames should be produced.
 */
function waveAnimates(state: VoiceWaveState, active: boolean, reducedMotion: boolean): boolean {
	return active && !reducedMotion && state !== "inactive";
}

export {
	FALLBACK_STATUS_COLOR,
	FLAT_WAVE,
	approach,
	clampLevel,
	pulseOpacity,
	sameWave,
	settledWave,
	stepWave,
	waveAnimates,
	waveStateText,
	waveTargets,
	type OpacityPulse,
	type VoiceWaveState,
	type WaveTargets,
	type WaveValues,
};
