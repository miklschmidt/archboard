// The pure mapping from the realtime session phase and the measured output
// level to the inputs `VoiceOutputWave` takes. Speaking is decided by the
// measured model output when the session is live and silent otherwise: the
// browser media session never learns the coordinator's turn phases itself.

import type { RealtimePhase } from "@/shared/codex-realtime-host";
import type { VoiceWaveState } from "@/ui/voice-wave/wave-state";

/** What the wave renderer takes. */
interface VoiceOutputWaveView {
	readonly state: VoiceWaveState;
	/** Measured model output level, 0..1. */
	readonly level: number;
	/** False stops the animation loop whatever the state says. */
	readonly active: boolean;
}

/** The RMS level above which the model counts as speaking. */
const VOICE_OUTPUT_SPEAKING_LEVEL = 0.02;

const FLAT: VoiceOutputWaveView = Object.freeze({ state: "inactive", level: 0, active: false });

/** The wave state each live phase rests in when the output is silent. */
const RESTING_STATES: Readonly<Partial<Record<RealtimePhase, VoiceWaveState>>> = Object.freeze({
	requesting_permission: "connecting",
	negotiating: "connecting",
	listening: "listening",
	muted: "listening",
	processing: "thinking",
	speaking: "speaking",
});

/** Phases whose measured output can raise the wave into speaking. */
const AUDIBLE_PHASES: ReadonlySet<RealtimePhase> = new Set([
	"listening",
	"muted",
	"processing",
	"speaking",
]);

/**
 * A measured level clamped to the unit interval; anything unmeasurable is silence.
 * @param level The measured level.
 * @returns A number in 0..1.
 */
function clampOutputLevel(level: number): number {
	if (!Number.isFinite(level)) {
		return 0;
	}
	return Math.min(1, Math.max(0, level));
}

/**
 * The wave inputs for one realtime phase and measured output level.
 * @param phase The realtime session phase, or null with no session.
 * @param level The measured model output level.
 * @returns The wave state, level and activity.
 */
function projectVoiceOutputWave(phase: RealtimePhase | null, level: number): VoiceOutputWaveView {
	if (phase === null) {
		return FLAT;
	}
	const resting = RESTING_STATES[phase];
	if (resting === undefined) {
		return FLAT;
	}
	const clamped = clampOutputLevel(level);
	const speaking = AUDIBLE_PHASES.has(phase) && clamped >= VOICE_OUTPUT_SPEAKING_LEVEL;
	return Object.freeze({
		state: speaking ? "speaking" : resting,
		level: AUDIBLE_PHASES.has(phase) ? clamped : 0,
		active: true,
	});
}

export {
	VOICE_OUTPUT_SPEAKING_LEVEL,
	clampOutputLevel,
	projectVoiceOutputWave,
	type VoiceOutputWaveView,
};
