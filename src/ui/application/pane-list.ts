// The panes the application shows: one or two, called A and B, one of them
// focused. Pure: the application keeps this in React state and the sessions
// behind each pane are mounted from it.

/** The ids panes are called by, in reading order. A third pane is refused. */
const PANE_IDS = ["A", "B"] as const;

/** One pane's identity in the chrome. */
interface PaneEntry {
	readonly paneId: string;
	readonly label: string;
}

/** The pane list and the focused pane. */
interface PaneList {
	readonly panes: readonly PaneEntry[];
	readonly activePaneId: string;
}

/**
 * The entry for one pane id.
 * @param paneId The pane.
 * @returns Its entry, labelled "Pane A" or "Pane B".
 */
function paneEntry(paneId: string): PaneEntry {
	return Object.freeze({ paneId, label: `Pane ${paneId}` });
}

/**
 * The list the application starts with: pane A, focused.
 * @returns The list.
 */
function initialPaneList(): PaneList {
	return Object.freeze({ panes: [paneEntry(PANE_IDS[0])], activePaneId: PANE_IDS[0] });
}

/**
 * The list a set of pane ids makes, in reading order, with one focused. Ids
 * this shell does not have panes for are ignored, and naming none at all
 * leaves the list the application starts with.
 * @param paneIds The panes wanted, in any order.
 * @param activePaneId The pane to focus, or null for the first.
 * @returns The list.
 */
function paneListOf(paneIds: readonly string[], activePaneId: string | null): PaneList {
	const panes = PANE_IDS.filter((paneId) => paneIds.includes(paneId)).map(paneEntry);
	const first = panes[0];
	if (first === undefined) {
		return initialPaneList();
	}
	const active =
		activePaneId !== null && panes.some((pane) => pane.paneId === activePaneId)
			? activePaneId
			: first.paneId;
	return Object.freeze({ panes, activePaneId: active });
}

/**
 * Whether the list has a pane with this id.
 * @param list The list.
 * @param paneId The pane.
 * @returns True when present.
 */
function hasPane(list: PaneList, paneId: string): boolean {
	return list.panes.some((pane) => pane.paneId === paneId);
}

/**
 * Add a second pane and focus it. A list that already has two is returned as is.
 * @param list The list.
 * @returns The list with the new pane, or the same list.
 */
function addPane(list: PaneList): PaneList {
	const free = PANE_IDS.find((paneId) => !hasPane(list, paneId));
	if (free === undefined) {
		return list;
	}
	return Object.freeze({ panes: [...list.panes, paneEntry(free)], activePaneId: free });
}

/**
 * Whether closing a pane would do anything. The last pane cannot be closed, and
 * neither can one this list has not got; a caller that acts on a close has to
 * know, because a refused close must not take the pane's state with it.
 * @param list The list.
 * @param paneId The pane to close.
 * @returns True when the close would happen.
 */
function canClosePane(list: PaneList, paneId: string): boolean {
	return list.panes.length > 1 && hasPane(list, paneId);
}

/**
 * Close a pane. The last pane cannot be closed; focus moves to the pane that
 * remains when the closed one was focused.
 * @param list The list.
 * @param paneId The pane to close.
 * @returns The list without the pane, or the same list.
 */
function closePane(list: PaneList, paneId: string): PaneList {
	if (!canClosePane(list, paneId)) {
		return list;
	}
	const panes = list.panes.filter((pane) => pane.paneId !== paneId);
	const first = panes[0];
	const activePaneId =
		list.activePaneId === paneId && first !== undefined ? first.paneId : list.activePaneId;
	return Object.freeze({ panes, activePaneId });
}

/**
 * Focus a pane.
 * @param list The list.
 * @param paneId The pane.
 * @returns The list with that pane focused, or the same list when it is unknown.
 */
function selectPane(list: PaneList, paneId: string): PaneList {
	if (!hasPane(list, paneId) || list.activePaneId === paneId) {
		return list;
	}
	return Object.freeze({ panes: list.panes, activePaneId: paneId });
}

/**
 * The primary pane: the one the server picks when a request names none.
 * @param list The list.
 * @returns The first pane's id.
 */
function primaryPaneId(list: PaneList): string {
	return list.panes[0]?.paneId ?? PANE_IDS[0];
}

export {
	PANE_IDS,
	addPane,
	canClosePane,
	closePane,
	hasPane,
	initialPaneList,
	paneListOf,
	primaryPaneId,
	selectPane,
	type PaneEntry,
	type PaneList,
};
