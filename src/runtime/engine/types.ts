// What the canvas sends a pane over its socket, and what a caller gets back
// from an HTTP route.
//
// Every board message carries the board it is about. A tab can have two panes
// on two boards, so a pane showing board A has to be able to tell that news
// about board B is not its business.

import type { DoingEntry } from "@/runtime/engine/board-doing";
import type { LockHolder } from "@/runtime/engine/lib/board-lock-contracts";

/** The shape every JSON route answers with. */
interface ApiResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
	message?: string;
}

/** What the canvas says to a pane. */
interface WebSocketMessage {
	type: WebSocketMessageType;
	/** The board it is about; null when the news is that there is no board. */
	board?: string | null;
	[key: string]: unknown;
}

type WebSocketMessageType =
	// Which board this pane is showing: on connect, and whenever a show moves
	// it. It carries no picture — the board is a file the server draws, and the
	// pane asks for the drawing itself (ADR 0023).
	| "pane_board"
	// Who is writing this board, if anybody (ADR 0016). Board-scoped like every
	// other board message, because a pane holding the other board is not
	// affected by this one changing hands. Carries the holder rather than a bare
	// flag: the pane that holds the lock has to know the news is about itself,
	// and a pane that does not needs to be able to say who does.
	| "board_lock"
	// This board has a new version. The panes showing it ask for a new picture;
	// nothing about a pane's own state follows from it, because the pane holds
	// no copy of the content to patch.
	| "board_note"
	// An agent changed this board and said what it was doing (TASK-095). Beside
	// the lock and not part of it: the lock says who has the board, the claim's
	// reason says what the claim is for, and this is the step. Carries the last
	// few lines as well as the new one, so a pane that has just arrived on the
	// board is not blank until the next write.
	| "board_doing"
	// A board could not be read or drawn. The pane shows this through the
	// shell's board-error notice.
	| "board_error"
	// Which boards an agent is working on, across this whole canvas (ADR 0022).
	// Boardless on purpose: it is one thing behind every board, and the
	// navigator marks each one it names.
	| "agent_activity"
	// Layout, addressed to one pane rather than to a board: the shell is asked
	// for another pane, or for this one to go.
	| "pane_open"
	| "pane_close"
	// A pane presenting a walkthrough is asked to go to a step, or to leave
	// (TASK-251). The position stays the pane's: this asks, and the pane's own
	// report says where it got to. Board-scoped, so a pane that has moved to
	// another board does not step through a walkthrough it is not showing.
	| "pane_present";

/** What an agent is doing to one board, as every pane is shown it (ADR 0022). */
interface AgentActivity {
	board: string;
	claim: LockHolder | null;
	doing: DoingEntry | null;
}

/** The whole activity snapshot, sent to every client. */
interface AgentActivityMessage extends WebSocketMessage {
	type: "agent_activity";
	activity: AgentActivity[];
}

export {
	type AgentActivity,
	type AgentActivityMessage,
	type ApiResponse,
	type WebSocketMessage,
	type WebSocketMessageType,
};
