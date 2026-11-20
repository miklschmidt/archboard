// Archboard conversation routes, narration payloads, what a page asks voice to narrate and what the
// server sends a pane. Safe for the browser.
export { shownConversationPath } from "#shared/protocol/shown-conversation.ts";
export type {
	ShownConversationReply,
	ShownConversationRequest,
} from "#shared/protocol/shown-conversation.ts";
export {
	explanationActionRequestSchema,
	explanationActionResultSchema,
} from "#shared/schemas/architecture-explanation.ts";
export type {
	ExplanationActionRequest,
	ExplanationActionResult,
} from "#shared/schemas/architecture-explanation.ts";
export type { AgentActivityMessage } from "#shared/protocol/pane-messages.ts";
export type { BrowserVoicePresentation } from "#shared/schemas/voice-presentation.ts";
