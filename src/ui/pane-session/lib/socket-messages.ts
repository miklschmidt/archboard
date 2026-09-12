// What a pane does with each message on its socket.
//
// A semantic pane hears about its board rather than receiving it. The board is
// a file the server reads and draws; the pane holds no copy, so nothing here
// applies content, merges anything or decides what the board becomes (ADR
// 0023). Six kinds of news: which board this pane is on, who is writing it,
// what they said they were doing, that it has a new version, what an agent is
// doing elsewhere, and what the shell should do about the layout.

import { announceSemanticBoardChange, boardAddressOf } from "@/ui/semantic-board-canvas";
import type {
	AgentActivityEntry,
	BoardIdentity,
	DoingEntry,
	LockHolder,
	WebSocketMessage,
} from "@/ui/types";

/** Everything a message handler may read or do. */
interface MessageContext {
	readonly clientId: string;
	readonly boardKey: () => string | null;
	/**
	 * This pane is on a board: the one the server addressed to it.
	 * @param key The board key, or null when the server named none.
	 * @param identity Its identity, when the server sent one.
	 */
	readonly adoptBoard: (
		key: string | null | undefined,
		identity: BoardIdentity | null | undefined,
	) => void;
	/** The pane's board changed under it. */
	readonly noteChange: (version: number | null) => void;
	readonly publishStatus: () => void;
	/**
	 * The server said who holds the board; `mine` when it is this pane.
	 * @param holder The holder, or null when nobody has it.
	 * @param mine Whether this pane is the holder.
	 */
	readonly setHolder: (holder: LockHolder | null, mine: boolean) => void;
	/**
	 * What an agent said it was doing to this board.
	 * @param entries The last few, oldest first.
	 */
	readonly setDoing: (entries: DoingEntry[]) => void;
	readonly onLayoutRequest: ((request: "open" | "close") => void) | undefined;
	readonly onBoardError: ((error: string) => void) | undefined;
	readonly onAgentActivity: ((activity: readonly AgentActivityEntry[]) => void) | undefined;
}

type Handler = (context: MessageContext, data: WebSocketMessage) => void;

/**
 * The server points this pane at a board: on connect, and whenever a `browser
 * show` moves it.
 * @param context The pane.
 * @param data The message.
 */
function paneBoard(context: MessageContext, data: WebSocketMessage): void {
	context.adoptBoard(data.board, data.identity);
}

/**
 * Who is writing this board (ADR 0016). The pane that holds it is told too,
 * and has to recognise itself.
 * @param context The pane.
 * @param data The message.
 */
function boardLock(context: MessageContext, data: WebSocketMessage): void {
	const holder = data.holder ?? null;
	const mine = holder !== null && holder.id === context.clientId;
	context.setHolder(data.held === true && !mine ? holder : null, mine);
}

/**
 * A board has a new version.
 *
 * Announced to whichever panes are showing that board, which answer by asking
 * the server to draw it again. The announcement names the board rather than
 * carrying the change, because there is no copy in the browser to patch.
 * @param context The pane.
 * @param data The message.
 */
function boardChanged(context: MessageContext, data: WebSocketMessage): void {
	announceSemanticBoardChange(data.board ?? "", data.version ?? 0);
	if (typeof data.board === "string" && aboutThisBoard(context, data.board)) {
		context.noteChange(data.version ?? null);
	}
}

/**
 * Whether a board's news is about the board this pane is showing.
 *
 * Compared by the board and not by the whole address: the news names the
 * aggregate, because every variant is in the one document and a write to any of
 * them is a new version of all of them. A pane reading a proposal has to redraw
 * when what it proposes to change moves under it.
 * @param context The pane.
 * @param said The board the news names.
 * @returns True when it is about this pane's board.
 */
function aboutThisBoard(context: MessageContext, said: string): boolean {
	const mine = context.boardKey();
	return mine !== null && boardAddressOf(said)?.board === boardAddressOf(mine)?.board;
}

/**
 * An agent said what it was doing to this board (TASK-095).
 * @param context The pane.
 * @param data The message.
 */
function boardDoing(context: MessageContext, data: WebSocketMessage): void {
	if (Array.isArray(data.recent)) {
		context.setDoing(data.recent);
	}
	context.publishStatus();
}

/**
 * Which boards an agent is working on, across this whole server (ADR 0022).
 * Boardless and sent to every client; the shell replaces its whole map, so
 * two panes hearing the same snapshot say the same thing twice, harmlessly.
 * @param context The pane.
 * @param data The message.
 */
function agentActivity(context: MessageContext, data: WebSocketMessage): void {
	if (Array.isArray(data.activity)) {
		context.onAgentActivity?.(data.activity);
	}
}

/**
 * A board could not be read or drawn.
 * @param context The pane.
 * @param data The message.
 */
function boardError(context: MessageContext, data: WebSocketMessage): void {
	if (typeof data.error === "string") {
		context.onBoardError?.(data.error);
	}
}

/**
 * The server asks for another pane. Layout is the shell's; sent up untouched.
 * @param context The pane.
 */
function paneOpen(context: MessageContext): void {
	context.onLayoutRequest?.("open");
}

/**
 * The server asks for this pane to go.
 * @param context The pane.
 */
function paneClose(context: MessageContext): void {
	context.onLayoutRequest?.("close");
}

const HANDLERS: Readonly<Record<string, Handler>> = {
	pane_board: paneBoard,
	board_lock: boardLock,
	board_note: boardChanged,
	board_doing: boardDoing,
	board_error: boardError,
	agent_activity: agentActivity,
	pane_open: paneOpen,
	pane_close: paneClose,
};

/**
 * Whether a message is about this pane.
 *
 * A board's news names the board it is about. `board_note` is the exception it
 * has always been: it is addressed to this socket but is about whichever board
 * moved, and the panes showing that board answer it wherever they are.
 * @param context The pane.
 * @param data The message.
 * @returns True when the message is ours to act on.
 */
function addressesThisPane(context: MessageContext, data: WebSocketMessage): boolean {
	if (data.type === "pane_board" || data.type === "board_note") {
		return true;
	}
	const said = data.board;
	return typeof said === "string" ? aboutThisBoard(context, said) : true;
}

/**
 * Act on one socket message.
 * @param context The pane.
 * @param data The message.
 */
function handleSocketMessage(context: MessageContext, data: WebSocketMessage): void {
	if (addressesThisPane(context, data)) {
		HANDLERS[data.type]?.(context, data);
	}
}

export { handleSocketMessage, type MessageContext };
