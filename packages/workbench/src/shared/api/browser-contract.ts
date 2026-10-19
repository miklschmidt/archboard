// What the browser and the server exchange: the snapshot a pane renders, the model that parses it, the ids of a realtime voice session and the route that tells the server which checkout's conversation the dock shows. Safe for the browser.
export {
	parseRealtimeCorrelationId,
	parseRealtimeItemId,
	parseRealtimeSessionId,
} from "#shared/protocol/realtime-contract.ts";
export type { RealtimeSemanticEvent } from "#shared/protocol/realtime-contract.ts";
export {
	SHOWN_CONVERSATION_ROUTE,
	ShownConversationRequestSchema,
} from "#shared/protocol/shown-conversation.ts";
export type {
	ShownConversationRefusal,
	ShownConversationReply,
	ShownConversationRequest,
} from "#shared/protocol/shown-conversation.ts";
export { createCodexBrowserModel } from "#shared/schemas/browser/model.ts";
export type { BrowserSnapshot, BrowserTimeline } from "#shared/schemas/browser/snapshot.ts";
