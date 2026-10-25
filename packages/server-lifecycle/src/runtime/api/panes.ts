// The panes on screen: how a pane is addressed, ordered and reported, and what the server sends one.
export {
	addressablePanes,
	MAX_PANES,
	paneWords,
	resolvePane,
} from "#runtime/rules/panes-addressing.ts";
export { panesInOrder } from "#runtime/rules/panes-layout.ts";
export type { PaneRegistration } from "#runtime/rules/panes-layout.ts";
export { buildPanesReport } from "#runtime/rules/panes.ts";
export type { AgentActivityMessage, WebSocketMessage } from "#runtime/protocol/pane-messages.ts";
