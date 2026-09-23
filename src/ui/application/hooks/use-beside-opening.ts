// Opening a board beside the one being read. With two panes that is the pane
// that is not active; with one, the second pane is added first, and the board
// is shown in it once the server has accepted it, since a pane the server has
// not registered cannot be pointed at anything.

import { useCallback, useEffect, useRef } from "react";

import type { Panes } from "@/ui/application/hooks/use-panes";
import { paneReady, recordFor } from "@/ui/application/pane-records";
import type { ShellActions } from "@/ui/shell";

/** A board waiting for the pane being added for it. */
interface PendingBeside {
	readonly key: string;
	/** The pane that was active when it was asked for: the new pane is the other one. */
	readonly from: string;
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
	return paneReady(recordFor(panes.records, target.paneId).status) ? target.paneId : null;
}

/**
 * Open a board beside the one being read.
 * @param panes The panes.
 * @param actions The shell's board and pane actions.
 * @returns The action.
 */
function useBesideOpening(
	panes: Panes,
	actions: Pick<ShellActions, "selectBoard" | "addPane">,
): (key: string) => void {
	const pending = useRef<PendingBeside | null>(null);
	useEffect(() => {
		const wanted = pending.current;
		if (wanted === null) return;
		const paneId = readyTarget(panes, wanted);
		if (paneId === null) return;
		pending.current = null;
		actions.selectBoard(wanted.key, paneId);
	}, [panes, actions]);
	return useCallback(
		(key: string): void => {
			const { list } = panes;
			const other = list.panes.find((pane) => pane.paneId !== list.activePaneId);
			if (other !== undefined) {
				actions.selectBoard(key, other.paneId);
				return;
			}
			pending.current = { key, from: list.activePaneId };
			actions.addPane();
		},
		[panes, actions],
	);
}

export { useBesideOpening };
