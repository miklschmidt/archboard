// Archboard conversation routes and narration payloads. Safe for the browser.
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
