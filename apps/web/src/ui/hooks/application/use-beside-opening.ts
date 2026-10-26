// Opening a board beside the one being read. With two panes that is the pane
// that is not active; with one, the second pane is added first, and the board
// is shown in it once the server has accepted it, since a pane the server has
// not registered cannot be pointed at anything.
//
// A board opened beside the board on screen in the pane it came from, as a
// proposal opened beside the current variant is, is read through that pane's
// view (TASK-538.04), so the two are read the same way from the start.

import { useCallback, useEffect, useRef } from "react";

import type { Arrival, PaneReadings } from "#ui/hooks/application/use-pane-reading.ts";
import type { Panes } from "#ui/hooks/application/use-panes.ts";
import { paneReady, recordFor } from "#ui/rules/application/pane-records.ts";
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

/** A board waiting for the pane being added for it. */
interface PendingBeside extends Beside {
	/** The new pane has appeared: should it go again before it is ready, the board is not wanted any more. */
	seen: boolean;
}

/** How a board is opened beside a pane. */
type OpenBeside = ShellActions["openBeside"];

/**
 * The pane a pending board is waiting for, once the server has accepted it.
 * @param panes The panes.
 * @param pending The pending board.
 * @returns The pane id, or null while it is not there or not ready.
 */
function readyTarget(panes: Panes, pending: PendingBeside): string | null {
	const target = panes.list.panes.find((pane) => pane.paneId !== pending.from);
	if (target === undefined) return null;
	pending.seen = true;
	return paneReady(recordFor(panes.records, target.paneId).status) ? target.paneId : null;
}

/**
 * Whether a pending board is no longer wanted: the pane added for it went
 * before it was ready, or the pane it was asked from did.
 * @param panes The panes.
 * @param pending The pending board.
 * @returns True when it should be forgotten.
 */
function abandoned(panes: Panes, pending: PendingBeside): boolean {
	const ids = panes.list.panes.map((pane) => pane.paneId);
	return !ids.includes(pending.from) || (pending.seen && ids.length < 2);
}

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
 * Open a board beside the one being read.
 * @param panes The panes, watched for the pane an opening waits on.
 * @param livePanes The panes as they are when the person acts, which the action reads
 * so that it keeps one identity through every pane's news.
 * @param actions The shell's board and pane actions.
 * @param readings What each pane reads, which the pane beside is told the view through.
 * @returns The action.
 */
function useBesideOpening(
	panes: Panes,
	livePanes: Panes,
	actions: Pick<ShellActions, "selectBoard" | "addPane" | "selectPane">,
	readings: Pick<PaneReadings, "showView" | "arriveThrough">,
): OpenBeside {
	const pending = useRef<PendingBeside | null>(null);
	const { showView, arriveThrough } = readings;
	const show = useCallback(
		(beside: Beside, paneId: string, status: PaneStatus): void => {
			const { arrival } = beside;
			if (arrival !== null && openedOn(status, arrival.board)) {
				showView(paneId, arrival.view);
			} else {
				arriveThrough(paneId, arrival);
			}
			void actions.selectBoard(beside.key, paneId, beside.repository).then((shown) => {
				// A board that never comes is no board for the pane to arrive on.
				if (!shown) arriveThrough(paneId, null);
				return shown;
			});
		},
		[actions, showView, arriveThrough],
	);
	useEffect(() => {
		const wanted = pending.current;
		if (wanted === null) return;
		if (abandoned(panes, wanted)) {
			pending.current = null;
			return;
		}
		const paneId = readyTarget(panes, wanted);
		if (paneId === null) return;
		pending.current = null;
		show(wanted, paneId, recordFor(panes.records, paneId).status);
		// Beside means the person stays where they were reading, as with two panes.
		actions.selectPane(wanted.from);
	}, [panes, actions, show]);
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
			const other = list.panes.find((pane) => pane.paneId !== source);
			if (other !== undefined) {
				show(beside, other.paneId, recordFor(records, other.paneId).status);
				return;
			}
			pending.current = { ...beside, seen: false };
			actions.addPane();
		},
		[livePanes, actions, show],
	);
}

export { useBesideOpening };
