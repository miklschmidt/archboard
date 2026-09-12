// One pane's session with the canvas server: its socket, its registration, who
// is writing the board it shows, and what the person is reading in it.
//
// Nothing here draws. The picture of a semantic board is the viewer's, read
// through the query cache; this module owns the pane's identity to the server
// and the two things a person can do that reach it — releasing an agent's claim,
// and opening the code a node is bound to (ADR 0023).

export { usePaneSession } from "@/ui/pane-session/use-pane-session";
export {
	UNKNOWN_HOLDER,
	type PaneSession,
	type PaneSessionOptions,
	type PaneTheme,
	type TakeBackResult,
} from "@/ui/pane-session/lib/session-contracts";
export {
	NOTHING_READ,
	createReadingPublisher,
	type PaneReading,
	type ReadingPublisher,
} from "@/ui/pane-session/lib/pane-reading";
export {
	fetchPaneInventory,
	showBoard,
	type PaneReport,
	type ShowBoardReply,
	type ShowBoardRequest,
} from "@/ui/pane-session/api";
