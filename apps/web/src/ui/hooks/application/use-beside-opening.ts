// Opening a model beside the one being read. With two panes that is the pane
// that is not active; with one, the second pane is added first, and the board
// is shown in it once the server has accepted it, since a pane the server has
// not registered cannot be pointed at anything.

import { useCallback, useEffect, useRef } from "react";

import type { Panes } from "#ui/hooks/application/use-panes.ts";
import { paneReady, recordFor } from "#ui/rules/application/pane-records.ts";
import type { ShellActions } from "#ui/rules/shell/contracts.ts";

/** A model waiting for the pane being added for it. */
interface PendingBeside {
	readonly key: string;
	/** The repository the board is in. */
	readonly repository: string;
	/** The pane that was active when it was asked for: the new pane is the other one. */
	readonly from: string;
	/** The new pane has appeared: should it go again before it is ready, the board is not wanted any more. */
	seen: boolean;
}

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
 * Open a model beside the one being read.
 * @param panes The panes, watched for the pane an opening waits on.
 * @param livePanes The panes as they are when the person acts, which the action reads
 * so that it keeps one identity through every pane's news.
 * @param actions The shell's board and pane actions.
 * @returns The action.
 */
function useBesideOpening(
	panes: Panes,
	livePanes: Panes,
	actions: Pick<ShellActions, "openModel" | "addPane" | "selectPane">,
): (key: string, repository: string) => void {
	const pending = useRef<PendingBeside | null>(null);
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
		void actions.openModel(wanted.key, wanted.repository, paneId);
		// Beside means the person stays where they were reading, as with two panes.
		actions.selectPane(wanted.from);
	}, [panes, actions]);
	return useCallback(
		(key: string, repository: string): void => {
			const { list } = livePanes;
			const other = list.panes.find((pane) => pane.paneId !== list.activePaneId);
			if (other !== undefined) {
				void actions.openModel(key, repository, other.paneId);
				return;
			}
			pending.current = { key, repository, from: list.activePaneId, seen: false };
			actions.addPane();
		},
		[livePanes, actions],
	);
}

export { useBesideOpening };
