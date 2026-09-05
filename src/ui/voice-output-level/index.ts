// The measured model output level: the signal behind the voice output wave.
// It is fed only from the realtime session's remote playback stream; the
// microphone has no path into it.

export {
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
export {
	VOICE_OUTPUT_SPEAKING_LEVEL,
	clampOutputLevel,
	projectVoiceOutputWave,
	type VoiceOutputWaveView,
} from "@/ui/voice-output-level/lib/wave-projection";
