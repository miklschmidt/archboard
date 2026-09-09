// Opening, closing and focusing panes, over the list as it is at the moment
// somebody acts.
//
// The moves are made once and kept for the application's life: the pane host
// hands them to every session it wires, and the server asks that host to close
// panes opened long after it was built. A move that read the list its callback
// was made with would act on a workspace that has since changed — closing a
// pane the shell no longer has, or refusing to close one it does.
//
// Each move says whether the list changed, because a refused close must not
// take the pane's record and its unanswered note states with it, and a restore
// reads the workspace once per render and needs to know whether that reading
// is still good.

import { addPane, closePane, selectPane, type PaneList } from "@/ui/application/pane-list";

/** The moves, over one list. */
interface PaneMoves {
	/** The list as it is now. */
	readonly list: () => PaneList;
	/** Open the second pane; false when there is no pane to open. */
	readonly add: () => boolean;
	/** Close a pane; false when the list refuses it. */
	readonly close: (paneId: string) => boolean;
	/** Focus a pane; false when it is already the focused one. */
	readonly select: (paneId: string) => boolean;
}

/**
 * The moves over a list, and where a changed list goes.
 * @param initial The list to start from.
 * @param changed Called with the new list whenever a move changes it.
 * @returns The moves.
 */
function createPaneMoves(initial: PaneList, changed: (list: PaneList) => void): PaneMoves {
	let list = initial;
	/**
	 * Take a new list, when it is a different one.
	 * @param next What the move produced.
	 * @returns Whether anything changed.
	 */
	function take(next: PaneList): boolean {
		if (next === list) {
			return false;
		}
		list = next;
		changed(next);
		return true;
	}
	return {
		/**
		 * The list as it is now.
		 * @returns The list.
		 */
		list: (): PaneList => list,
		/**
		 * Open the second pane.
		 * @returns Whether it opened.
		 */
		add: (): boolean => take(addPane(list)),
		/**
		 * Close a pane.
		 * @param paneId The pane.
		 * @returns Whether it closed.
		 */
		close: (paneId: string): boolean => take(closePane(list, paneId)),
		/**
		 * Focus a pane.
		 * @param paneId The pane.
		 * @returns Whether the focus moved.
		 */
		select: (paneId: string): boolean => take(selectPane(list, paneId)),
	};
}

export { createPaneMoves, type PaneMoves };
