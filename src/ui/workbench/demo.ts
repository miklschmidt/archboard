// DEMONSTRATION, as a second entrypoint of the module: what the application needs to
// put the voice box over a pane when the page is opened with `?voiceDemo`, without
// Codex, a microphone or a turn.

export { DemoVoiceSurface } from "@/ui/workbench/components/DemoVoiceSurface";
export { useDemoTranscript } from "@/ui/workbench/hooks/use-voice-demo";
export { VOICE_DEMONSTRATING } from "@/ui/workbench/lib/voice-demo";
