import { expect, test } from "bun:test";

import { followBoardLink, isBoardLink, type OpenBoard } from "@/ui/canvas/board-links";
import type { OpenBoardRequest } from "@/ui/canvas/api";
import type { BoardInfo } from "@/ui/types";

/** What a following of a board link did. */
interface Followed {
	readonly opens: OpenBoardRequest[];
	readonly asked: string[];
	readonly errors: string[];
	readonly open: OpenBoard;
}

/**
 * A pane that records what the link asked of it and of the server.
 * @returns What was asked.
 */
function pane(): Followed {
	const opens: OpenBoardRequest[] = [];
	const asked: string[] = [];
	const errors: string[] = [];
	return {
		opens,
		asked,
		errors,
		/**
		 * Take the server's place.
		 * @param address The board and the pane.
		 * @returns A board that says nothing more than that it opened.
		 */
		open: (address: OpenBoardRequest): Promise<BoardInfo> => {
			opens.push(address);
			return Promise.resolve({
				board: address.board,
				identity: { board: address.board, variant: "current" },
				elementCount: 0,
				placeholder: false,
			});
		},
	};
}

/**
 * The options one pane follows a link with.
 * @param followed What is recording.
 * @param mayMove Whether the pane may lose its board.
 * @returns The options.
 */
function options(followed: Followed, mayMove: boolean) {
	return {
		clientId: "A-1",
		/**
		 * The link could not be followed.
		 * @param error The words.
		 */
		onBoardLinkError: (error: string): void => {
			followed.errors.push(error);
		},
		/**
		 * Whether this pane may move.
		 * @param boardKey The board the link named.
		 * @returns What the test said.
		 */
		onBoardOpenRequested: (boardKey: string): boolean => {
			followed.asked.push(boardKey);
			return mayMove;
		},
	};
}

test("a board link is the one an element carries as a wiki-link", () => {
	expect(isBoardLink("[[payments]]")).toBe(true);
	expect(isBoardLink("src/server/index.ts:14")).toBe(false);
});

test("following a board link points the clicked pane at the board it names", () => {
	const followed = pane();
	followBoardLink(options(followed, true), "[[payments@proposed]]", followed.open);
	expect(followed.opens).toEqual([{ board: "payments@proposed", pane: "A-1" }]);
	expect(followed.errors).toEqual([]);
});

test("a pane that may not move asks the server for nothing at all", () => {
	const followed = pane();
	followBoardLink(options(followed, false), "[[payments]]", followed.open);
	expect(followed.asked).toEqual(["payments"]);
	expect(followed.opens).toEqual([]);
	// The refusal is explained by whoever made it, not repeated as a failed link.
	expect(followed.errors).toEqual([]);
});

test("a link the board vocabulary does not accept is named rather than sent", () => {
	const followed = pane();
	followBoardLink(options(followed, true), "[[payments|Payments]]", followed.open);
	expect(followed.opens).toEqual([]);
	expect(followed.asked).toEqual([]);
	expect(followed.errors[0]).toContain("without an alias");
});
