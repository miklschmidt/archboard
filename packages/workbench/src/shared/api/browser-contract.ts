// Archboard conversation routes, narration payloads and what the server sends a pane. Safe for the
// browser.
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
export type { AgentActivityMessage, WebSocketMessage } from "#shared/protocol/pane-messages.ts";
