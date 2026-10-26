// Archboard conversation routes and narration payloads. Safe for the browser.
export {
	SHOWN_CONVERSATION_ROUTE,
	ShownConversationRequestSchema,
} from "#shared/protocol/shown-conversation.ts";
export type {
	ShownConversationRefusal,
	ShownConversationReply,
	ShownConversationRequest,
} from "#shared/protocol/shown-conversation.ts";
export { ArchboardVoicePresentationSchema } from "#shared/schemas/voice-presentation.ts";
export type { BrowserVoicePresentation } from "#shared/schemas/voice-presentation.ts";
