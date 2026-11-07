// Archboard context, panes, and production integration.
export { codexWiring, publishPaneContext } from "#server/workbench-host/services/wiring-hooks.ts";
export {
	prepareCodexWorkbench,
	stopCodexWorkbench,
} from "#server/workbench-host/services/wiring.ts";
export {
	forgetTabSession,
	forgetTabSessions,
	noteTabSession,
	tabSessionOf,
} from "#server/panes/services/tab-sessions.ts";
export { shownConversationRoute as showConversation } from "#server/panes/services/shown-conversation.ts";

export { explainArchitecture } from "#server/explanations/services/dispatch.ts";
