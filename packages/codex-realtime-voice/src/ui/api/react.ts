// The React reading of the voice client: a provider and two hooks. No styled components. Safe for the browser.
export {
	VoiceClientProvider,
	type VoiceClientProviderProps,
} from "#ui/components/voice-client/VoiceClientProvider.tsx";
export { useVoiceClient, useVoiceState } from "#ui/hooks/voice-client/use-voice-client.ts";
