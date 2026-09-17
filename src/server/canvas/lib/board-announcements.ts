// What the canvas tells its panes about a board: who is writing it, and what
// they said they were doing.
//
// Board content is not here and cannot be. A board is a file the server reads,
// and a pane holds only a read-only cache of what it last read, which it reads
// again when told (ADR 0023). So the news is always the same shape: this board
// moved, or this board changed hands.

import type { Response } from "express";
import { boardLockState, onBoardLockChanged } from "@/runtime/engine/board-lock";
import type { LockHolder } from "@/runtime/engine/board-lock";
import { recentDoing, recordDoing } from "@/runtime/engine/board-doing";
import type { DoingEntry } from "@/runtime/engine/board-doing";
import { normalizeBoardKey } from "@/runtime/engine/board";
import type { WebSocketMessage } from "@/runtime/engine/types";
import { createAgentActivity } from "@/server/canvas/lib/agent-activity";
import {
	aggregateOf,
	broadcast,
	broadcastBoardless,
	sendToPane,
	syncLockWatch,
} from "@/server/canvas/lib/pane-registry";

/**
 * A board's writer changed, so every pane showing it is told (ADR 0016).
 *
 * The lock is a broadcast and not only a guard. `holder` lets a pane explain a
 * claim (ADR 0022): while an agent has claimed the board, the pane says so and
 * offers the one control that takes it back. The authoritative vault-backed
 * mutex still orders when anything may persist.
 *
 * The board key is stamped on by `broadcast`, so a pane showing another board
 * drops it the same way it drops any other board's news.
 * @param board The board whose lock changed.
 * @param holder Who holds it now, or null when it is free.
 * @returns The message every pane on that board receives.
 */
function lockMessage(board: string, holder: LockHolder | null): WebSocketMessage {
	return { type: "board_lock", board, held: holder !== null, holder };
}

/**
 * The boardless account of agent work, for the navigator (ADR 0022).
 *
 * Fed by the same announcements the board-scoped messages ride on, so it can
 * never say something different from what the pane on that board hears.
 */
const agentActivity = createAgentActivity({
	/**
	 * Deliver one navigator message to every client.
	 * @param message The boardless activity message.
	 */
	send: (message) => {
		broadcastBoardless(message);
	},
	/**
	 * The key a board is displayed under.
	 * @param board The normalized board key.
	 * @returns The display key.
	 */
	displayKey: (board) => normalizeBoardKey(board),
});

onBoardLockChanged((board, holder) => {
	broadcast(lockMessage(board, holder), board);
	agentActivity.lockChanged(board, holder);
});

syncLockWatch();

/**
 * An agent has just changed this board, and said what it was doing (TASK-095).
 *
 * Board-scoped like the lock, and beside it on purpose: the lock says who has
 * the board, the claim's reason says what the claim is for, and this is the
 * current step. One account at two scales, not two accounts of the same thing.
 *
 * The whole list rides with each line, so a pane that has just opened, or has
 * just been given this board, is not blank until the next write. It costs a few
 * hundred bytes and it is what makes two panes on one board tell the same story.
 * @param board The board that was written.
 * @param entry What the writer said it was doing.
 */
function announceDoing(board: string, entry: DoingEntry): void {
	const recent = recordDoing(board, entry);
	broadcast({ type: "board_doing", doing: entry, recent }, board);
	agentActivity.doingLanded(board, entry);
}

/**
 * Refuse a write that did not say what it was doing.
 *
 * The refusal teaches, because being made to write the sentence is the point:
 * a person watching a diagram change has no other way to know what is being
 * attempted, and an intent no diff can recover is one only the writer can state.
 * @param res The response the refusal goes out on.
 * @param board The board the write named.
 * @param requestPath The route, so the refusal can show where `?doing=` goes.
 * @param problem What was wrong with the description that was given.
 */
function refuseUndescribedWrite(
	res: Response,
	board: string,
	requestPath: string,
	problem: string,
): void {
	res.status(400).json({
		success: false,
		code: "DOING_REQUIRED",
		error:
			`This write to "${board}" says nothing about what it is doing (${problem}). Say it in one short ` +
			'line, in the present tense — "adding the payment queue", "rerouting orders through it" — and it ' +
			"goes up on the canvas as the write lands, so the person at the board can see what you are up to. " +
			`On the command line that is \`--doing "..."\`, and on the API it is \`?doing=\` (${requestPath}). ` +
			`A claim's \`reason\` is the overall reason and does not stand in for this: ` +
			"this is the step. Nothing was written.",
		board,
	});
}

/**
 * Tell one pane where a board stands, now.
 *
 * A broadcast only reaches a pane that was connected when it went out, and a
 * pane arrives — a new tab, a reconnection, a board switch — into a board that
 * may already be held. Without this it would believe a held board is free until
 * the next thing happens to it, which is the fail-open the ADR forbids.
 * @param clientId The pane's client id.
 * @param board The board the pane has just been given.
 */
function tellPaneAboutLock(clientId: string, board: string): void {
	// Keyed by the aggregate, not by the pane's address. Every variant of a
	// board is in the one document, so there is one lease and one account of
	// what an agent is doing for the whole family: a pane showing a proposal is
	// looking at the same file as a pane showing what is current, and telling it
	// about a lock of its own would be inventing a second answer.
	const aggregate = aggregateOf(board) ?? board;
	sendToPane(clientId, lockMessage(aggregate, boardLockState(aggregate)), board);
	// And the last few things an agent said it was doing here (TASK-095). A pane
	// that has just been given a board an agent is part way through would
	// otherwise show the banner saying somebody has it and nothing at all about
	// what has happened so far.
	const said = recentDoing(aggregate);
	if (said.length > 0) {
		sendToPane(clientId, { type: "board_doing", board: aggregate, recent: said }, board);
	}
}

export { agentActivity, announceDoing, lockMessage, refuseUndescribedWrite, tellPaneAboutLock };
