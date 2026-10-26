// Archboard context, panes, and production integration.
export { codexWiring, publishPaneContext } from "#server/services/owner/wiring-hooks.ts";
export { prepareCodexWorkbench, stopCodexWorkbench } from "#server/services/owner/wiring.ts";
export {
	forgetTabSession,
	forgetTabSessions,
	noteTabSession,
	tabSessionOf,
} from "#server/services/panes/tab-sessions.ts";
export { shownConversationRoute as showConversation } from "#server/services/panes/shown-conversation.ts";

export { explainArchitecture } from "#server/services/explanations/dispatch.ts";
