// The measured model output level: the signal the voice orb follows.
// It is fed only from the realtime session's remote playback stream; the
// microphone has no path into it.

export {
	VOICE_OUTPUT_SPEAKING_LEVEL,
	browserFrameScheduler,
	createVoiceOutputLevelSource,
	type VoiceOutputFrameScheduler,
	type VoiceOutputLevelListener,
	type VoiceOutputLevelSource,
} from "@/ui/voice-output-level/lib/level-source";
export {
	createWebAudioOutputMeter,
	rootMeanSquareLevel,
	webAudioSupported,
	type VoiceOutputMeter,
	type VoiceOutputMeterFactory,
	type VoiceOutputPlayback,
	type VoiceOutputPlaybackState,
} from "@/ui/voice-output-level/lib/meter";
