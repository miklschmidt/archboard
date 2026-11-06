// The owners under `createVoiceClient`, for a host that owns its sockets and draws its own
// conversation UI: the transport and media owners, the conversation controllers of one chat
// over its transport, and the conversation projected from the server's timelines. A host page
// that opens one socket uses `./browser` instead. Safe for the browser.
export { createBrowserWorkbenchTransport } from "#ui/transport/clients/transport.ts";
export type {
	BrowserWorkbenchTransport,
	BrowserWorkbenchState,
} from "#ui/transport/state/contract.ts";
export { createBrowserWorkbenchMediaOwner } from "#ui/media/clients/media-owner.ts";
export {
	browserAudioElements,
	type BrowserAudioElementPort,
	type BrowserWorkbenchMediaOwner,
} from "#ui/media/clients/media-state.ts";
export {
	VOICE_OUTPUT_SPEAKING_LEVEL,
	type VoiceOutputLevelSource,
} from "#ui/output-level/clients/level-source.ts";
export {
	createConversationControllers,
	type ConversationControllers,
} from "#ui/conversation/state/controllers.ts";
export type { ApprovalChoice } from "#ui/approvals/state/choices.ts";
export { mergeConversation, projectTimelineTurns } from "#ui/timeline/rules/projection.ts";
export type { ConversationTurn } from "#ui/timeline/state/contract.ts";
