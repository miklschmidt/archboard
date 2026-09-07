import type { Response } from "express";
import { logger } from "@/runtime/engine/logger";
import type { ServerElement, WebSocketMessage } from "@/runtime/engine/types";
import { boards } from "@/runtime/engine/board-store";
import type { BoardState } from "@/runtime/engine/board-store";
import { releaseHold as clearHold, reportHold } from "@/runtime/engine/board-hold";
import type { HoldReport } from "@/runtime/engine/board-hold";
import { readBoardContent } from "@/runtime/engine/board-io";
import { boardLockState, onBoardLockChanged, onBoardSweep } from "@/runtime/engine/board-lock";
import type { LockHolder } from "@/runtime/engine/board-lock";
import { recentDoing, recordDoing } from "@/runtime/engine/board-doing";
import type { DoingEntry } from "@/runtime/engine/board-doing";
import { normalizeBoardKey } from "@/runtime/engine/board";
import {
	noteWrittenElsewhere,
	onNoteWrittenElsewhere,
	refreshNoteWatch,
} from "@/runtime/engine/note-watch";
import type { NoteWrittenElsewhere } from "@/runtime/engine/note-watch";
import { RenderGeometryError } from "@/runtime/engine/geometry";
import { NativeElementValidationError } from "@/runtime/engine/native-element";
import { createAgentActivity } from "@/server/canvas/lib/agent-activity";
import {
	broadcast,
	broadcastBoardless,
	sendToPane,
	syncLockWatch,
} from "@/server/canvas/lib/pane-registry";

/**
 * A board's writer changed, so every pane holding it is told (ADR 0016).
 *
 * The lock is a broadcast and not only a guard. `holder` lets a pane explain a
 * claim and go read-only under it (ADR 0022): while an agent has claimed the
 * board, the pane takes pan and zoom and no content edit, until the person
 * explicitly takes the board back. The authoritative vault-backed mutex still
 * orders when anything may persist.
 *
 * The board key is stamped on by `broadcast`, so a pane showing the other board
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
 * Fed by the same two announcements the board-scoped messages ride on, so it
 * can never say something different from what the pane on that board hears.
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
	 * The key a board is displayed under, which is the store's spelling of it
	 * when the board is open and the normalized key otherwise.
	 * @param board The normalized board key.
	 * @returns The display key.
	 */
	displayKey: (board) =>
		[...boards.keys()].find((known) => normalizeBoardKey(known) === board) ?? board,
});

onBoardLockChanged((board, holder) => {
	broadcast(lockMessage(board, holder), board);
	agentActivity.lockChanged(board, holder);
});

/**
 * An agent has just changed this board, and said what it was doing (TASK-095).
 *
 * Board-scoped like the lock, and beside it on purpose: the lock says who has
 * the board, the claim's reason says what the claim is for, and this is the
 * current step. One account at two scales, not two accounts of the same thing.
 *
 * The whole list rides with each line, so a pane that has just opened, or has
 * just received this board, is not blank until the next write. It costs a
 * few hundred bytes and it is what makes two panes on one board tell the same
 * story.
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
 * a person watching boxes move in the pane has no other way to know
 * what is being attempted, and an intent no diff can recover is one only the
 * writer can state (CLAUDE.md's principle, ADR 0016's claim from the other
 * end).
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
 * Somebody outside archboard wrote this board's note, and the panes holding it
 * are showing a board the vault no longer has (TASK-062).
 *
 * A separate message from `board_lock` because it is a separate fact. A lock
 * says another archboard writer has the board right now and the pane must stop
 * accepting edits. This says nothing is stopping anybody: the pane keeps
 * drawing, and what it is drawing on is a copy. Telling one story with the
 * other's message would mean a board going read-only because Obsidian saved.
 * @param board The board whose note changed.
 * @param written What was observed, or null when the note is archboard's own.
 * @returns The message every pane on that board receives.
 */
function noteMessage(board: string, written: NoteWrittenElsewhere | null): WebSocketMessage {
	return { type: "board_note", board, writtenElsewhere: written };
}

onNoteWrittenElsewhere((board, written) => {
	broadcast(noteMessage(board, written), board);
});

// Registered here rather than by the module itself so that the one place the
// lock watcher is wired is the one place anything rides on it.
onBoardSweep((board) => {
	refreshNoteWatch(board);
});

syncLockWatch();

/**
 * Tell one pane where a board stands, now.
 *
 * A broadcast only reaches a pane that was connected when it went out, and a
 * pane arrives — a new tab, a reconnection, a board switch — into a board that
 * may already be held. Without this it would believe a held board is free until
 * the next thing happens to it, which is the fail-open the ADR forbids.
 * @param clientId The pane's client id.
 * @param board The board the pane has just received.
 */
function tellPaneAboutLock(clientId: string, board: string): void {
	sendToPane(clientId, lockMessage(board, boardLockState(board)), board);
	// And whether the note is the one this board came from. Same reasoning, same
	// moment: a tab that opens onto a board Obsidian rewrote an hour ago would
	// otherwise hear nothing until the next sweep found a change, and the change
	// it is waiting for already happened.
	sendToPane(clientId, noteMessage(board, noteWrittenElsewhere(board)), board);
	// And the last few things an agent said it was doing here (TASK-095). A pane
	// that has just received a board an agent is part way through would
	// otherwise show the banner saying somebody has it and nothing at all about
	// what has happened so far.
	const said = recentDoing(board);
	if (said.length > 0) {
		sendToPane(clientId, { type: "board_doing", recent: said }, board);
	}
}

/**
 * A board's elements, read out of its note.
 *
 * The one answer to "what is on this board", for everything that is not a
 * request working against content it already read: the change feed at the end
 * of a settle delay, a pane receiving a board, the report of what each pane
 * holds. Each is a fresh read, which is what makes them agree with the note
 * rather than with a copy of it that stopped being right at some point nobody
 * noticed (ADR 0015).
 * @param board The open board.
 * @returns Its elements as the note holds them.
 */
function boardElements(board: BoardState): ServerElement[] {
	return Array.from(readBoardContent(board).elements.values());
}

/**
 * Whether an error means the note is present but cannot be rendered.
 * @param error The failure a note read produced.
 * @returns True for a geometry or native-element refusal.
 */
function isUnrenderableNote(
	error: unknown,
): error is RenderGeometryError | NativeElementValidationError {
	return error instanceof RenderGeometryError || error instanceof NativeElementValidationError;
}

/**
 * How many elements a board has, for a summary that does not need them all.
 * @param board The open board.
 * @returns The element count, or zero for a note that cannot be rendered.
 */
function boardElementCount(board: BoardState): number {
	try {
		return readBoardContent(board).elements.size;
	} catch (error) {
		// A malformed persisted scratch note is still an open board address. Keep
		// board listings and health usable while its pane carries the actual error.
		if (isUnrenderableNote(error)) {
			return 0;
		}
		throw error;
	}
}

/**
 * A board is saving again, and every pane holding it should say so.
 *
 * One of the three outcomes has been chosen and carried out by the time this
 * runs; which one, and what it cost, is the caller's to have decided (ADR
 * 0006). All this does is take the mark down.
 * @param key The board that was held.
 * @param outcome Which of the three outcomes ended the hold.
 * @returns The hold's report, or null when the board was not held.
 */
function releaseBoardHold(
	key: string,
	outcome: "reload" | "overwrite" | "elsewhere",
): HoldReport | null {
	const hold = clearHold(key);
	if (!hold) {
		return null;
	}
	const report = reportHold(key, hold);
	logger.info(`Board "${key}" is saving again (${outcome}), after ${hold.writes} held change(s).`);
	broadcast({ type: "board_released", hold: report, outcome }, key);
	return report;
}

export {
	agentActivity,
	announceDoing,
	boardElementCount,
	boardElements,
	isUnrenderableNote,
	lockMessage,
	noteMessage,
	refuseUndescribedWrite,
	releaseBoardHold,
	tellPaneAboutLock,
};
