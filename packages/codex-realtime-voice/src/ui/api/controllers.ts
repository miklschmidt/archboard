// The owners under `createVoiceClient`, for a host that owns its sockets and draws its own
// conversation UI: the transport and media owners, and the conversation controllers over a
// transport. A host page that opens one socket uses `./browser` instead. Safe for the browser.
export { createBrowserWorkbenchTransport } from "#ui/clients/transport/transport.ts";
export type {
	BrowserWorkbenchCapabilities,
	BrowserWorkbenchTransport,
	BrowserWorkbenchState,
} from "#ui/state/transport/contract.ts";
export { createBrowserWorkbenchMediaOwner } from "#ui/clients/media/media-owner.ts";
export {
	browserAudioElements,
	type BrowserAudioElementPort,
	type BrowserWorkbenchMediaOwner,
	type BrowserWorkbenchMediaOwnerOptions,
	type BrowserWorkbenchMediaState,
} from "#ui/clients/media/media-state.ts";
export type { RealtimeMediaSnapshot } from "#ui/clients/realtime/media-session.ts";
export {
	VOICE_OUTPUT_SPEAKING_LEVEL,
	type VoiceOutputLevelSource,
} from "#ui/clients/output-level/level-source.ts";
export {
	createWorkbenchApprovalsController,
	type WorkbenchApprovalsController,
} from "#ui/state/approvals/controller.ts";
export type {
	ApprovalChoice,
	DynamicApprovalVerdict,
} from "#ui/state/approvals/choices.ts";
export {
	createWorkbenchComposerController,
} from "#ui/state/composer/controller.ts";
export type {
	WorkbenchComposerController,
	WorkbenchComposerSubmissionResult,
} from "#ui/state/composer/contract.ts";
export {
	createWorkbenchQueueController,
	type WorkbenchQueueController,
} from "#ui/state/queue/controller.ts";
export type { WorkbenchQueueActions } from "#ui/state/queue/contracts.ts";
export { createThreadLinkController } from "#ui/state/thread-link/controller.ts";
export type {
	ThreadLinkActionCompletion,
	ThreadLinkController,
} from "#ui/state/thread-link/contracts.ts";
export { mergeConversation, projectTimelineTurns } from "#ui/rules/timeline/projection.ts";
export type {
	ConversationItem,
	ConversationOwner,
	ConversationTurn,
} from "#ui/state/timeline/contract.ts";
