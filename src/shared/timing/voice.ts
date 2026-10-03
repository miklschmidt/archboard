// How long the voice in the agent dock takes to move, as a second entrypoint of
// the module. `timing.ts` is at its length limit, and only the dock and the voice
// orb read these, so the group is exported from here and written in
// `lib/voice-motion.ts` with what each duration pulls against.

export {
	VOICE_ATTACK_MS,
	VOICE_BREATH_MS,
	VOICE_COMET_MS,
	VOICE_EXTINGUISH_MS,
	VOICE_HUSH_MS,
	VOICE_IGNITE_MS,
	VOICE_MORPH_MS,
	VOICE_PULSE_MS,
	VOICE_PULSE_REST_MS,
	VOICE_RELEASE_MS,
	VOICE_RING_TURN_MS,
	VOICE_ROW_STEP_MS,
	VOICE_SPARK_MS,
	VOICE_SWELL_MS,
} from "@/shared/timing/lib/voice-motion";
