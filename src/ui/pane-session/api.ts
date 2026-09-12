// What a pane says to the canvas server over HTTP: what it is showing, which
// board it should show, and the one control a person has over an agent's claim.
//
// Everything else a pane needs arrives over its socket or through the semantic
// board cache. There is no write here, because a person does not author a
// semantic board (ADR 0023); `takeBoardBack` is not a write to a board, it is
// the release of somebody else's lease.

import { boardQuery, json, post, cancellable } from "@/ui/server-requests";
import type { BoardIdentity, BrowserPaneListing, LockHolder } from "@/ui/types";

/** What one pane tells the server it has in front of the human. */
interface PaneReport {
	clientId: string;
	paneId: string;
	/**
	 * The board key this pane is showing: `pipeline`, or `pipeline@variant`;
	 * null when it is showing none. A pane on a vault that holds no board still
	 * registers, because a pane that did not exist to the server could never be
	 * shown the first board somebody makes.
	 */
	board: string | null;
	primary: boolean;
	focused: boolean;
	/** Where the pane is in the page, in CSS pixels. */
	rect: { x: number; y: number; width: number; height: number };
	/** Which bundle this tab is running, so the canvas can say when it is old. */
	build?: string;
}

/** The server's answer to a pane report. */
interface PaneReply {
	success: true;
	registered: boolean;
	paneCount: number;
	/**
	 * Set when this tab is running a bundle the canvas no longer serves, i.e.
	 * somebody rebuilt the frontend after the tab was opened (TASK-056).
	 */
	staleFrontend?: { loaded: string | null; current: string | null; message: string | null };
}

/**
 * Tell the server what this pane currently shows: which board, and where the
 * pane sits on the display. Registration lives exactly as long as the socket.
 * @param pane The report.
 * @returns Whether the pane is registered, and whether the tab is stale.
 */
function reportPane(pane: PaneReport): Promise<PaneReply> {
	return post("/api/panes", pane);
}

/**
 * The entry script this tab loaded, hash and all, read off the served
 * document so the tab and the canvas read the same fact from the same place.
 * @returns The script URL, or undefined when the document names none.
 */
function loadedBundle(): string | undefined {
	const script = document.querySelector('script[type="module"][src]');
	return script?.getAttribute("src") ?? undefined;
}

/**
 * What the panes are holding, across every tab this server serves.
 * @param signal Cancels the read.
 * @returns The pane inventory.
 */
function fetchPaneInventory(signal?: AbortSignal): Promise<BrowserPaneListing> {
	return json("/api/panes", cancellable(signal));
}

/** What `showBoard` asks for: which board, in which pane. */
interface ShowBoardRequest {
	/** The board key: `pipeline`, or `pipeline@variant`. */
	board: string;
	/** Which pane shows it. Required once more than one is open. */
	pane?: string;
}

/** What the server answers a show with. */
interface ShowBoardReply {
	success: true;
	board: string;
	identity: BoardIdentity;
	paneId: string;
}

/**
 * Point a pane at a board.
 *
 * The shell asks rather than deciding, so that one owner records which pane
 * holds what — the same owner an agent's `browser show` goes through, and the
 * same one `browser panes` is answered from (ADR 0009).
 * @param request The board and the pane to show it in.
 * @returns What the pane is showing now.
 */
function showBoard(request: ShowBoardRequest): Promise<ShowBoardReply> {
	return post("/api/panes/show", request);
}

/** The answer to a take-back: whether a claim was released, and which. */
interface TakeBackReply {
	success: true;
	released: boolean;
	claim?: LockHolder;
}

/**
 * Release an agent's claim on a board: the one explicit control a person has
 * over a claimed board (ADR 0022). The board goes to nobody, the agent is told
 * once that it lost the board, and nothing already written is undone.
 * @param board The board key.
 * @param clientId This pane.
 * @returns Whether a claim was released.
 */
function takeBoardBack(board: string | null, clientId: string): Promise<TakeBackReply> {
	return post(`/api/semantic-boards/take-back${boardQuery(board)}`, { clientId });
}

export {
	fetchPaneInventory,
	loadedBundle,
	reportPane,
	showBoard,
	takeBoardBack,
	type PaneReply,
	type PaneReport,
	type ShowBoardReply,
	type ShowBoardRequest,
	type TakeBackReply,
};
