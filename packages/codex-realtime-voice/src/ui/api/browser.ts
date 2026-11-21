// The browser side of the voice agent, safe for the browser. `mountVoice` draws a working panel in
// one line. `createVoiceClient` is the same client without the panel, for a page that draws its
// own. `createSocketConversation` serves a page that carries the voice frames on a socket it owns.
export { mountVoice } from "#ui/voice-panel/clients/mount-voice.ts";
export type { VoicePanelText } from "#ui/voice-panel/clients/mount-voice.ts";
export { createVoiceClient } from "#ui/voice-client/clients/voice-client.ts";
export type {
	VoiceApproval,
	VoiceApprovalResponse,
	VoiceClient,
	VoiceClientOptions,
	VoiceClientSnapshot,
	VoiceSignIn,
} from "#ui/voice-client/state/contract.ts";
export { createSocketConversation } from "#ui/socket-conversation/clients/socket-conversation.ts";
export type {
	HostedConversation,
	SocketConversation,
	SocketConversationOptions,
} from "#ui/socket-conversation/clients/socket-conversation.ts";
export type { ConversationControllers } from "#ui/conversation/state/controllers.ts";
export type { ApprovalChoice } from "#ui/approvals/state/choices.ts";
export type { BrowserWorkbenchState } from "#ui/transport/state/contract.ts";
export type {
	BrowserAudioElementPort,
	BrowserWorkbenchMediaOwner,
} from "#ui/media/clients/media-state.ts";
export type { VoiceOutputLevelSource } from "#ui/output-level/clients/level-source.ts";
