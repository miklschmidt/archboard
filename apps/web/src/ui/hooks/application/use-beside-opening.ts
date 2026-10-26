// Opening a board beside the one being read. With two panes that is the pane
// that is not active; with one, the second pane is added on the board, so the
// server starts it there and the address writes one entry (TASK-550): there is
// no moment in which the new pane shows the board it was not added for.
//
// A board opened beside the board on screen in the pane it came from, as a
// proposal opened beside the current variant is, is read through that pane's
// view (TASK-538.04), so the two are read the same way from the start.

import { useCallback } from "react";

import type { Arrival, PaneReadings } from "#ui/hooks/application/use-pane-reading.ts";
import type { Panes } from "#ui/hooks/application/use-panes.ts";
import { freePaneId, type PaneList } from "#ui/rules/application/pane-list.ts";
import { recordFor } from "#ui/rules/application/pane-records.ts";
import type { PaneStatus } from "#ui/rules/pane-session/session-types.ts";
import { boardAddressOf, sameBoardName } from "#ui/rules/semantic-board-canvas/board/address.ts";
import type { ShellActions } from "#ui/rules/shell/contracts.ts";

/** A board to open beside a pane. */
interface Beside {
	readonly key: string;
	/** The repository the board is in, or undefined for that of the pane it came from. */
	readonly repository: string | undefined;
	/** The pane it was asked from: the board opens in the other one. */
	readonly from: string;
	/** The view the pane beside reads it through, or null when the boards differ. */
	readonly arrival: Arrival | null;
}

/** What opening beside acts through. */
interface BesideActors
	extends
		Pick<ShellActions, "selectBoard" | "addPane" | "selectPane">,
		Pick<PaneReadings, "showView" | "arriveThrough"> {}

/** How a board is opened beside a pane. */
type OpenBeside = ShellActions["openBeside"];

/**
 * The view a board opened beside a pane is read through: that pane's, when the
 * board has the name of the one on screen there.
 * @param from What the pane it came from shows.
 * @param key The board opened beside it.
 * @returns The board's name and the view, or null for another board.
 */
function arrivalFrom(from: PaneStatus, key: string): Arrival | null {
	const board = boardAddressOf(key);
	const onScreen = boardAddressOf(from.boardKey);
	if (board === null || onScreen === null || !sameBoardName(board.board, onScreen.board)) {
		return null;
	}
	return { board: board.board, view: from.view };
}

/**
 * Whether a pane was opened on a board of this name. An adoption of the same
 * board keeps the view a pane reads, so such a pane can read it at once.
 * @param status The pane.
 * @param board The board's name.
 * @returns True when its own board has that name.
 */
function openedOn(status: PaneStatus, board: string): boolean {
	const opened = boardAddressOf(status.opened);
	return opened !== null && sameBoardName(opened.board, board);
}

/**
 * Add the second pane on the board, and keep the pane it came from active.
 * @param actors The actions and readings.
 * @param list The one pane.
 * @param beside The board.
 */
function addBeside(actors: BesideActors, list: PaneList, beside: Beside): void {
	const added = freePaneId(list);
	if (added === null || !actors.addPane(beside)) {
		return;
	}
	actors.arriveThrough(added, beside.arrival);
	// Beside means the person stays where they were reading, as with two panes.
	actors.selectPane(beside.from);
}

/**
 * Show the board in the pane beside, which reads it through the view it arrives with.
 * @param actors The actions and readings.
 * @param paneId The pane beside.
 * @param status What it shows now.
 * @param beside The board.
 */
function showBeside(
	actors: BesideActors,
	paneId: string,
	status: PaneStatus,
	beside: Beside,
): void {
	const { arrival } = beside;
	if (arrival !== null && openedOn(status, arrival.board)) {
		actors.showView(paneId, arrival.view);
	} else {
		actors.arriveThrough(paneId, arrival);
	}
	void actors.selectBoard(beside.key, paneId, beside.repository).then((shown) => {
		// A board that never comes is no board for the pane to arrive on.
		if (!shown) actors.arriveThrough(paneId, null);
		return shown;
	});
}

/**
 * Open a board beside the one being read.
 * @param livePanes The panes as they are when the person acts, which the action reads
 * so that it keeps one identity through every pane's news.
 * @param actions The shell's board and pane actions.
 * @param readings What each pane reads, which the pane beside is told the view through.
 * @returns The action.
 */
function useBesideOpening(
	livePanes: Panes,
	actions: Pick<ShellActions, "selectBoard" | "addPane" | "selectPane">,
	readings: Pick<PaneReadings, "showView" | "arriveThrough">,
): OpenBeside {
	const { showView, arriveThrough } = readings;
	return useCallback(
		(key: string, repository?: string, from?: string): void => {
			const { list, records } = livePanes;
			const source = from ?? list.activePaneId;
			const status = recordFor(records, source).status;
			const beside: Beside = {
				key,
				repository: repository ?? status.repository ?? undefined,
				from: source,
				arrival: arrivalFrom(status, key),
			};
			const actors: BesideActors = { ...actions, showView, arriveThrough };
			const other = list.panes.find((pane) => pane.paneId !== source);
			if (other === undefined) {
				addBeside(actors, list, beside);
			} else {
				showBeside(actors, other.paneId, recordFor(records, other.paneId).status, beside);
			}
		},
		[livePanes, actions, showView, arriveThrough],
	);
}

export { useBesideOpening };
