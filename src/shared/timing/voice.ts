// How long the voice takes to move, as a second entrypoint of the module: in the
// agent dock, between the dock and the voice box, and in the words of a subtitle.
// `timing.ts` is at its length limit, and only the voice surfaces read these, so
// the group is exported from here and written in `lib/voice-motion.ts` with what
// each duration pulls against.

export {
	SUBTITLE_BACK_MS,
	SUBTITLE_OUT_MS,
	SUBTITLE_SWAP_MS,
	SUBTITLE_WORD_MS,
	VOICE_ATTACK_MS,
	VOICE_BOX_IN_MS,
	VOICE_BOX_OUT_MS,
	VOICE_BREATH_MS,
	VOICE_COMET_MS,
	VOICE_DEMO_TICK_MS,
	VOICE_EXTINGUISH_MS,
	VOICE_FLIGHT_MS,
	VOICE_HUSH_MS,
	VOICE_IGNITE_MS,
	VOICE_MORPH_MS,
	VOICE_PULSE_MS,
	VOICE_PULSE_REST_MS,
	VOICE_RELEASE_MS,
	VOICE_RING_TURN_MS,
	VOICE_ROW_STEP_MS,
	VOICE_SEAT_OUT_MS,
	VOICE_SPARK_MS,
	VOICE_SWELL_MS,
	VOICE_SYLLABLE_MS,
	VOICE_TRACE_MS,
	VOICE_TRACE_STEP_MS,
	VOICE_WORD_IN_MS,
} from "@/shared/timing/lib/voice-motion";
