// The browser side of the voice agent: one client per page view. React hosts read it
// through `./react`; a host that owns its sockets builds on `./controllers`. Safe for the browser.
export { createVoiceClient } from "#ui/voice-client/clients/voice-client.ts";
export type {
	VoiceApproval,
	VoiceApprovalResponse,
	VoiceClient,
	VoiceClientSnapshot,
	VoiceSignIn,
} from "#ui/voice-client/state/contract.ts";
