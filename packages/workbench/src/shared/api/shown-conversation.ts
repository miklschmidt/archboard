// Which checkout's conversation the dock shows: the route the browser calls, what it says, what the server answers and why a call is refused. Safe for the browser.
export {
	SHOWN_CONVERSATION_ROUTE,
	ShownConversationRequestSchema,
} from "#shared/protocol/shown-conversation.ts";
export type {
	ShownConversationRefusal,
	ShownConversationReply,
	ShownConversationRequest,
} from "#shared/protocol/shown-conversation.ts";
