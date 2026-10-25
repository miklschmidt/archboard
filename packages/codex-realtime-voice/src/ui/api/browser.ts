// The browser side of the voice agent. A host page uses `createVoiceClient`; the
// transport and media owners below stay for a host that multiplexes its own socket. Safe for the browser.
export { createVoiceClient } from "#ui/clients/voice-client/voice-client.ts";
export type {
	VoiceApproval,
	VoiceApprovalResponse,
	VoiceClient,
	VoiceClientFailure,
	VoiceClientOptions,
	VoiceClientSnapshot,
	VoiceClientVoice,
	VoiceCommandIntent,
	VoiceSignIn,
} from "#ui/state/voice-client/contract.ts";

export { type RealtimeMediaSnapshot } from "#ui/clients/realtime/media-session.ts";

export {
	VOICE_OUTPUT_SPEAKING_LEVEL,
	type VoiceOutputLevelSource,
} from "#ui/clients/output-level/level-source.ts";

export {
	type BrowserWorkbenchTransport,
	type BrowserWorkbenchState,
	type BrowserWorkbenchCommandResult,
	BrowserWorkbenchTransportError,
	type BrowserCommandDraft,
	type BrowserWorkbenchCapabilities,
	type BrowserWorkbenchCommandIntent,
	type BrowserWorkbenchCommandTarget,
} from "#ui/state/transport/contract.ts";
export { createBrowserWorkbenchTransport } from "#ui/clients/transport/transport.ts";
export {
	type BrowserWorkbenchMediaState,
	browserAudioElements,
	type BrowserAudioElementPort,
	type BrowserWorkbenchMediaOwnerOptions,
	type BrowserWorkbenchMediaOwner,
} from "#ui/clients/media/media-state.ts";
export { createBrowserWorkbenchMediaOwner } from "#ui/clients/media/media-owner.ts";
