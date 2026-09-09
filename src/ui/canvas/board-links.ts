// What a board link does when somebody follows it: drilling down from a node
// to the board describing its internals, in the pane they clicked in.
//
// The board address goes to the server as it was written; the server owns
// address validation and vault resolution, and level metadata is not
// navigation. Whether the pane may go at all is asked first, by the same rule
// that answers the board picker and the address bar (TASK-166), so a pane
// holding work the note has not got is never asked to leave it behind.

import { openBoard } from "@/ui/canvas/api";
import type { OpenBoardRequest } from "@/ui/canvas/api";
import type { BoardInfo } from "@/ui/types";

/** The one server call following a board link makes; injectable for checks. */
type OpenBoard = (address: OpenBoardRequest) => Promise<BoardInfo>;

/**
 * Permission for this pane to move, and where the command's outcome goes. The
 * address bar hands one out when the pane may go and nothing else is on its
 * way to the server, so the person's move is the last one it is given.
 */
interface BoardMove {
	/**
	 * The open finished.
	 * @param openedKey The board the server says it opened.
	 */
	readonly done: (openedKey: string) => void;
	/** The open did not finish, so nothing moved. */
	readonly failed: () => void;
}

/** What following a board link needs, and where its outcomes go. */
interface BoardLinkOptions {
	/** The clicked pane's identity to the server. */
	readonly clientId: string;
	/** The link could not be followed, with what to do about it. */
	readonly onBoardLinkError: (error: string) => void;
	/**
	 * The person is following a board link. Answers with permission to move once
	 * the pane may, or null when it may not; a refusal is explained by whoever
	 * refused it.
	 */
	readonly onBoardOpenRequested: (boardKey: string) => Promise<BoardMove | null>;
}

/** A board wiki-link, without an alias or a heading or block anchor. */
const BOARD_LINK = /^\[\[([^[\]#^|\r\n]+)\]\]$/;

/**
 * Whether an element's link is a board link rather than a code target.
 * @param link The element's link.
 * @returns True when it is a wiki-link.
 */
function isBoardLink(link: string): boolean {
	return link.startsWith("[[");
}

/**
 * Follow a board link in the clicked pane.
 * @param options The pane and outcome callbacks.
 * @param link The element's link.
 * @param open The server call, injectable for checks.
 */
async function followBoardLink(
	options: BoardLinkOptions,
	link: string,
	open: OpenBoard = openBoard,
): Promise<void> {
	const board = BOARD_LINK.exec(link)?.[1]?.trim();
	if (!board) {
		options.onBoardLinkError(
			"Use [[board-key]] with the key from Board navigation, without an alias or heading/block anchor.",
		);
		return;
	}
	const move = await options.onBoardOpenRequested(board);
	if (move !== null) {
		await openInPane(options, board, move, open);
	}
}

/**
 * Ask the server for the board, and say so when it could not be reached.
 * @param options The pane and outcome callbacks.
 * @param board The board key the link named.
 * @param move The permission, which hears how the command ended.
 * @param open The server call.
 */
async function openInPane(
	options: BoardLinkOptions,
	board: string,
	move: BoardMove,
	open: OpenBoard,
): Promise<void> {
	try {
		move.done((await open({ board, pane: options.clientId })).board);
	} catch (error: unknown) {
		move.failed();
		const message = error instanceof Error ? error.message : String(error);
		options.onBoardLinkError(
			`Could not open board "${board}". ${message} Check the target in Board navigation and try the link again.`,
		);
	}
}

export { followBoardLink, isBoardLink, type BoardLinkOptions, type BoardMove, type OpenBoard };
