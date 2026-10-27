// What a pane does with each message on its socket.
//
// A semantic pane hears about its board rather than receiving it. The board is
// a file the server reads and draws; the pane holds no copy, so nothing here
// applies content, merges anything or decides what the board becomes (ADR
// 0023). Eight kinds of news: which board this pane is on and in which
// repository's vault, who is writing it, what they said they were doing, that it
// has a new version, what an agent is doing elsewhere, what the shell should do
// about the layout, which step of a walkthrough somebody narrating it asked for,
// and that a checkout was chosen somewhere.

import {
	PanePresentRequestSchema,
	ArchitecturePaneReadingSchema,
} from "@archboard/board/pane-context";
import { announceSemanticBoardChange } from "#ui/state/semantic-board-canvas/board-changes.ts";
import { boardAddressOf } from "#ui/rules/semantic-board-canvas/board/address.ts";
import type {
	AgentActivityEntry,
	BoardIdentity,
	DoingEntry,
	LockHolder,
	WebSocketMessage,
} from "#ui/rules/pane-session/session-types.ts";
import type { z } from "zod";

type PanePresentRequest = z.infer<typeof PanePresentRequestSchema>;

/** Canonical navigation resolved by the shared runtime before it reaches a pane. */
interface PaneModelRequest {
	readonly reading: z.infer<typeof ArchitecturePaneReadingSchema> & { model: string };
	readonly repository: string | null;
}

/** Where the server says a pane is: a vault, and the repository it is listed under. */
interface PanePlace {
	readonly vault: string;
	readonly repository: string | null;
}

/** Everything a message handler may read or do. */
interface MessageContext {
	readonly clientId: string;
	readonly boardKey: () => string | null;
	/**
	 * The vault the pane is in: news on its socket is about this vault.
	 * @returns The vault.
	 */
	readonly vault: () => string;
	/**
	 * This pane is on a board: the one the server addressed to it.
	 * @param key The board key, or null when the server named none.
	 * @param identity Its identity, when the server sent one.
	 * @param place The vault the pane is in now, when the server said.
	 */
	readonly adoptBoard: (
		key: string | null | undefined,
		identity: BoardIdentity | null | undefined,
		place: PanePlace | null,
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
	readonly onPresentRequest: ((request: PanePresentRequest) => void) | undefined;
	readonly onModelRequest?: ((request: PaneModelRequest) => void) | undefined;
	readonly onBoardError: ((error: string) => void) | undefined;
	readonly onAgentActivity:
		| ((vault: string, activity: readonly AgentActivityEntry[]) => void)
		| undefined;
	readonly onRepositoriesChanged: (() => void) | undefined;
	readonly onExplanationsChanged: (() => void) | undefined;
}

type Handler = (context: MessageContext, data: WebSocketMessage) => void;

/**
 * The server points this pane at a board: on connect, and whenever a `browser
 * show` moves it.
 * @param context The pane.
 * @param data The message.
 */
function paneBoard(context: MessageContext, data: WebSocketMessage): void {
	const place =
		typeof data.vault === "string"
			? { vault: data.vault, repository: data.repository ?? null }
			: null;
	context.adoptBoard(data.board, data.identity, place);
}

/**
 * A canonical arrival updates its place and delegates display intent to the router.
 * @param context The addressed pane session.
 * @param data The runtime-resolved reading.
 */
function paneModel(context: MessageContext, data: WebSocketMessage): void {
	if (typeof data.model !== "string" || typeof data.vault !== "string") return;
	const parsed = ArchitecturePaneReadingSchema.safeParse(data.reading);
	if (!parsed.success) return;
	const repository = data.repository ?? null;
	context.adoptBoard(null, null, { vault: data.vault, repository });
	context.onModelRequest?.({ reading: { ...parsed.data, model: data.model }, repository });
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
	announceSemanticBoardChange(context.vault(), data.board ?? "", data.version ?? 0);
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
 * Which boards an agent is working on in one vault (ADR 0022). Boardless and
 * sent to every client, naming its vault; the shell replaces that vault's whole
 * map, so two panes hearing the same snapshot say the same thing twice, harmlessly.
 * @param context The pane.
 * @param data The message.
 */
function agentActivity(context: MessageContext, data: WebSocketMessage): void {
	if (typeof data.vault === "string" && Array.isArray(data.activity)) {
		context.onAgentActivity?.(data.vault, data.activity);
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

/**
 * A checkout was chosen somewhere, so the repositories are read again.
 * @param context The pane.
 */
function repositoriesChanged(context: MessageContext): void {
	context.onRepositoriesChanged?.();
}

/**
 * The server asks this pane to go to a step of a walkthrough, or to leave the
 * presentation (TASK-251). Where the pane is in a walkthrough is the pane's own,
 * so the request goes up to whoever draws the board; a request that does not
 * read as one is dropped, and the server hears nothing arrived.
 * @param context The pane.
 * @param data The message.
 */
function panePresent(context: MessageContext, data: WebSocketMessage): void {
	const request = PanePresentRequestSchema.safeParse(data);
	if (request.success) {
		context.onPresentRequest?.(request.data);
	}
}

const HANDLERS: Readonly<Record<string, Handler>> = {
	pane_model: paneModel,
	pane_board: paneBoard,
	board_lock: boardLock,
	board_note: boardChanged,
	board_doing: boardDoing,
	board_error: boardError,
	agent_activity: agentActivity,
	pane_open: paneOpen,
	pane_close: paneClose,
	pane_present: panePresent,
	repositories_changed: repositoriesChanged,
	/**
	 * Refresh the tab answer through the existing query owner.
	 * @param context The current pane callbacks.
	 */
	architecture_explanations_changed: (context): void => {
		context.onExplanationsChanged?.();
	},
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
	if (data.type === "pane_board" || data.type === "pane_model" || data.type === "board_note") {
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

export { handleSocketMessage, type MessageContext, type PanePlace, type PaneModelRequest };
