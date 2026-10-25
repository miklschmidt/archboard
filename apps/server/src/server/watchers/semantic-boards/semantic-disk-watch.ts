// Noticing that a board changed on disk without this process writing it.
//
// The file is the board (ADR 0015, ADR 0023), and one vault can be open in more
// than one server: ADR 0016's lease is what stops two writers colliding, not
// what tells the loser its picture went stale. A write from another process, or
// an editor replacing the file, reaches a pane through nothing at all — the
// change feed hears this process's own broadcasts, and there is no second
// socket between servers to hear anything else on.
//
// So the file is watched, and watched the cheap way: a fingerprint of the
// directory entry, never its content. What changed is not read here and could
// not usefully be — the pane holds no copy to patch, so the whole of the news
// is "this board moved", and the pane answers by asking for the board again.
//
// It rides the lock sweep rather than adding a poll of its own. That sweep
// already runs exactly when somebody is looking, over exactly the boards on
// screen, and stops when the last pane goes; a second timer with the same job
// would be a second answer to "is anybody watching".

import fs from "node:fs";

import { boardMemoryKey, locateSemanticBoard } from "@archboard/board/address";
import { onBoardSweep } from "@archboard/board/lock";
import { logger } from "@archboard/diagnostics/logger";
import type { WebSocketMessage } from "@archboard/server-lifecycle/panes";
import { broadcast, onBoardBroadcast } from "@archboard/workbench/panes";

/**
 * What a board's file looked like when it was last seen, by the board's memory
 * key: a board of one name in two vaults is two files (ADR 0049).
 *
 * The fingerprint and nothing else: this is not a cache of the board, and a
 * reader that wanted the board would read the board.
 */
const seen = new Map<string, string>();

/** Stops observing this process's own announcements, while the watch is on. */
let stopObserving: (() => void) | null = null;

/**
 * The board file as the directory entry describes it.
 *
 * Inode, size and modification time together, because each alone is forgeable
 * by an ordinary write: an atomic replace makes a new inode, an in-place edit
 * of the same length moves only the time, and a filesystem with coarse time
 * resolution can leave the time alone for two writes in the same tick.
 * @param vault The vault the board lives in.
 * @param board The board key.
 * @returns The fingerprint, or the empty string when the board has no file.
 */
function fingerprintOf(vault: string, board: string): string {
	try {
		const entry = fs.statSync(locateSemanticBoard(board, vault).file, { bigint: true });
		return `${entry.ino}:${entry.size}:${entry.mtimeNs}`;
	} catch {
		// No file is a fingerprint too: a board that was deleted under an open
		// pane is a change, and the pane is told the same way.
		return "";
	}
}

/**
 * Tell every pane on a board that it moved.
 *
 * The same announcement a write makes, and deliberately: a pane cannot tell
 * which server wrote a board and must not need to, and the agent's context
 * feed reads the same broadcast, so the two can never disagree about what
 * happened.
 *
 * No version rides along, because this process has not read one. The pane's
 * answer is to ask for the board again, which is where the version comes from.
 * @param vault The vault the board lives in.
 * @param board The board key.
 */
function announceChangedOnDisk(vault: string, board: string): void {
	logger.info(`Board changed on disk by another writer: "${board}" (${vault})`);
	broadcast({ type: "board_note", board, semantic: true } satisfies WebSocketMessage, vault, board);
}

/**
 * Look at one board, and say so when its file is not the one this process last
 * saw.
 *
 * The one observation, used by the sweep and by a pane arriving alike. A board
 * with no fingerprint yet is one nobody was watching, so there is nobody to
 * tell and the fingerprint is simply taken; a board with one is judged against
 * it, and a difference is news.
 * @param vault The vault the board lives in.
 * @param board The board key.
 */
function observe(vault: string, board: string): void {
	const now = fingerprintOf(vault, board);
	const key = boardMemoryKey(vault, board);
	const before = seen.get(key);
	seen.set(key, now);
	if (before !== undefined && before !== now) {
		announceChangedOnDisk(vault, board);
	}
}

/**
 * The lock sweep looked at one of the boards on screen.
 * @param vault The vault the board lives in.
 * @param board The board key, as the lock sweep supplies it.
 */
function sweepBoard(vault: string, board: string): void {
	observe(vault, board);
}

/**
 * A pane arrived on a board, which is a moment to look at its file.
 *
 * Arriving is where the baseline comes from, and it is taken here rather than
 * on the first sweep because this is the moment the pane is about to read the
 * board: what it reads is what it has, and anything that replaces the file
 * afterwards is news for it. Taking it on the first sweep instead would leave a
 * window — the width of one sweep — in which a replacement is adopted silently.
 *
 * But arriving is an observation, not a reset. A pane arriving on a board
 * somebody else is already showing must not seed over THEIR baseline: if the
 * file has moved since that baseline was taken and this arrival simply recorded
 * what it found, the panes already there would never be told, for as long as
 * they stayed open. So the same rule as a sweep — a fingerprint that is not the
 * one we had is news, whoever noticed it.
 * @param vault The vault the pane named.
 * @param board The board key the pane arrived on.
 */
function noteBoardShown(vault: string, board: string): void {
	if (stopObserving !== null) {
		observe(vault, board);
	}
}

/**
 * Take this board's fingerprint without announcing it.
 *
 * For a board this process has just announced itself: the write already told
 * every pane, and the file it left behind is not news a second time.
 * @param vault The vault the board lives in.
 * @param board The board key.
 */
function noteAnnounced(vault: string, board: string): void {
	seen.set(boardMemoryKey(vault, board), fingerprintOf(vault, board));
}

/**
 * Watch the boards on screen for changes this process did not make.
 *
 * Idempotent: installing twice leaves one passenger and one observer.
 */
function watchSemanticBoardFiles(): void {
	if (stopObserving !== null) {
		return;
	}
	stopObserving = onBoardBroadcast((message, vault, board) => {
		if (message.type === "board_note") {
			noteAnnounced(vault, board);
		}
	});
	onBoardSweep(sweepBoard);
}

/** Stop watching and forget every fingerprint, because the server is stopping. */
function forgetSemanticBoardFiles(): void {
	stopObserving?.();
	stopObserving = null;
	onBoardSweep(null);
	seen.clear();
}

export { forgetSemanticBoardFiles, noteBoardShown, watchSemanticBoardFiles };
