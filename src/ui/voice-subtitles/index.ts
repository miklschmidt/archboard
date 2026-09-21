export { progressMark, subtitleShowing } from "@/ui/voice-subtitles/lib/recency";
export type { SubtitleProgress, SubtitleWatch } from "@/ui/voice-subtitles/lib/recency";
export { cuesOf, wordsOf, type SubtitleCue } from "@/ui/voice-subtitles/lib/cues";
export {
	createSubtitlePreference,
	subtitlePreference,
	type SubtitlePreference,
} from "@/ui/voice-subtitles/lib/preference";
export { useSubtitlesWanted } from "@/ui/voice-subtitles/hooks/use-subtitle-preference";
export {
	SubtitlesToggle,
	type SubtitlesToggleProps,
} from "@/ui/voice-subtitles/components/SubtitlesToggle";
export {
	VoiceSubtitles,
	type VoiceSubtitlesProps,
} from "@/ui/voice-subtitles/components/VoiceSubtitles";
export type { SubtitleSource } from "@/ui/voice-subtitles/hooks/use-voice-subtitles";
