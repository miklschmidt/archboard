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

/** What following a board link needs, and where its outcomes go. */
interface BoardLinkOptions {
	/** The clicked pane's identity to the server. */
	readonly clientId: string;
	/** The link could not be followed, with what to do about it. */
	readonly onBoardLinkError: (error: string) => void;
	/**
	 * The person is following a board link. Answers whether this pane may move;
	 * a refusal is explained by whoever refused it.
	 */
	readonly onBoardOpenRequested: (boardKey: string) => boolean;
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
function followBoardLink(
	options: BoardLinkOptions,
	link: string,
	open: OpenBoard = openBoard,
): void {
	const board = BOARD_LINK.exec(link)?.[1]?.trim();
	if (!board) {
		options.onBoardLinkError(
			"Use [[board-key]] with the key from Board navigation, without an alias or heading/block anchor.",
		);
		return;
	}
	if (!options.onBoardOpenRequested(board)) {
		return;
	}
	void open({ board, pane: options.clientId }).catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		options.onBoardLinkError(
			`Could not open board "${board}". ${message} Check the target in Board navigation and try the link again.`,
		);
	});
}

export { followBoardLink, isBoardLink, type BoardLinkOptions, type OpenBoard };
