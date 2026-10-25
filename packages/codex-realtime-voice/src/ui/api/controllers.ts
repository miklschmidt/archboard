// The owners under `createVoiceClient`, for a host that owns its sockets and draws its own
// conversation UI: the transport and media owners, the conversation controllers of one pane
// over its transport, and the conversation projected from the server's timelines. A host page
// that opens one socket uses `./browser` instead. Safe for the browser.
export { createBrowserWorkbenchTransport } from "#ui/clients/transport/transport.ts";
export type {
	BrowserWorkbenchTransport,
	BrowserWorkbenchState,
} from "#ui/state/transport/contract.ts";
export { createBrowserWorkbenchMediaOwner } from "#ui/clients/media/media-owner.ts";
export {
	browserAudioElements,
	type BrowserAudioElementPort,
	type BrowserWorkbenchMediaOwner,
} from "#ui/clients/media/media-state.ts";
export {
	VOICE_OUTPUT_SPEAKING_LEVEL,
	type VoiceOutputLevelSource,
} from "#ui/clients/output-level/level-source.ts";
export {
	createConversationControllers,
	type ConversationControllers,
} from "#ui/state/conversation/controllers.ts";
export type { ApprovalChoice } from "#ui/state/approvals/choices.ts";
export { mergeConversation, projectTimelineTurns } from "#ui/rules/timeline/projection.ts";
export type { ConversationTurn } from "#ui/state/timeline/contract.ts";
