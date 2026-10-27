// The panes that are open on this server: their sockets, the boards they show and what is sent to them, the broadcast that every write announces through, and what the panes say as the workbench reads it. Bun only.
export { aggregateOf } from "#server/rules/pane/board-key.ts";
export { settledChangeFields } from "#server/services/panes/change-feed.ts";
export {
	forgetSemanticPaneContext,
	forgetSemanticPaneContexts,
	mountSemanticPaneContextRoutes,
	semanticPaneContextFor,
} from "#server/services/panes/context.ts";
export { panePresentations } from "#server/services/panes/presentation.ts";
export {
	acceptedSockets,
	boardForNewPane,
	boardForPane,
	boardsOnScreen,
	broadcast,
	clientIds,
	clients,
	codexSocketInstances,
	currentSocketsByClient,
	forgetDisplay,
	latestSocketAcceptanceByClient,
	notePaneClosed,
	notePaneOpened,
	onBoardBroadcast,
	paneBoardOf,
	paneBoards,
	paneFromRequest,
	paneResponse,
	panes,
	paneVaults,
	pendingPaneCloses,
	pendingPaneOpens,
	primaryPane,
	rejectPendingLayouts,
	sendBoardlessToPane,
	sendToPane,
	settleAfterLayout,
	socketVaults,
} from "#server/services/panes/registry.ts";
export type { PendingPaneClose, PendingPaneOpen } from "#server/services/panes/registry.ts";
