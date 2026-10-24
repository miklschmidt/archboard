// What the browser and the server exchange: the snapshot a pane renders, the model that parses it, the ids of a realtime voice session and the route that tells the server which checkout's conversation the dock shows. Safe for the browser.
export {
	parseRealtimeCorrelationId,
	parseRealtimeItemId,
	parseRealtimeSessionId,
} from "@archboard/agent-workbench/realtime";
export type { RealtimeSemanticEvent } from "@archboard/agent-workbench/realtime";
export {
	SHOWN_CONVERSATION_ROUTE,
	ShownConversationRequestSchema,
} from "#shared/protocol/shown-conversation.ts";
export type {
	ShownConversationRefusal,
	ShownConversationReply,
	ShownConversationRequest,
} from "#shared/protocol/shown-conversation.ts";
export { createCodexBrowserModel } from "@archboard/agent-workbench/contract";
export type { BrowserSnapshot, BrowserTimeline } from "@archboard/agent-workbench/contract";
export { ArchboardVoicePresentationSchema } from "#shared/schemas/voice-presentation.ts";
export type { BrowserVoicePresentation } from "#shared/schemas/voice-presentation.ts";
