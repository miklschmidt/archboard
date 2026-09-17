// Which tab of a semantic pane's sidebar is open, and whether the sidebar is.
//
// The sidebar has two tabs: the board — how it is being read, and the key to
// what is drawn — and the selection. Picking something out of the diagram is a
// request to be told about it, so it opens the selection tab; letting go of the
// selection is not a request to keep looking at an empty panel, so it gives
// back whichever tab was open before the pick. A person who chooses a tab
// themselves while something is selected keeps that tab until they pick again.
//
// Collapsing is the person's. A pick never opens a collapsed sidebar: opening
// it would change the width of the pane, and a pane that changes width refits
// its picture, which would move the diagram under the pointer that just picked.

import { useCallback, useState } from "react";

/** The sidebar's tabs. */
type SidebarTab = "board" | "selection";

/** What the sidebar is showing, and how to change it. */
interface Sidebar {
	/** The open tab. */
	readonly tab: SidebarTab;
	/** Whether the sidebar is collapsed to its tab icons. */
	readonly collapsed: boolean;
	/**
	 * Open a tab, expanding the sidebar if it was collapsed.
	 * @param tab The tab.
	 */
	readonly open: (tab: SidebarTab) => void;
	/** Collapse the sidebar to its tab icons. */
	readonly collapse: () => void;
}

/** The tab state, and the selection it last answered. */
interface TabState {
	readonly tab: SidebarTab;
	/** The tab to give back when the selection is let go. */
	readonly before: SidebarTab;
	/** The selection this state was last brought up to date with. */
	readonly seen: string | null;
}

/**
 * The tab state after the selection changed.
 * @param state The state before.
 * @param selection The selection now.
 * @returns The state after.
 */
function followSelection(state: TabState, selection: string | null): TabState {
	if (selection !== null) {
		const before = state.tab === "selection" ? state.before : state.tab;
		return { tab: "selection", before, seen: selection };
	}
	return state.tab === "selection"
		? { tab: state.before, before: state.before, seen: null }
		: { ...state, seen: null };
}

/**
 * Keep the sidebar's tab in step with what is selected.
 * @param selection The selected subject, or null.
 * @returns The sidebar state and its controls.
 */
function useSidebar(selection: string | null): Sidebar {
	const [state, setState] = useState<TabState>({
		tab: selection === null ? "board" : "selection",
		before: "board",
		seen: selection,
	});
	const [collapsed, setCollapsed] = useState(false);
	// Brought up to date during render, as React asks for state derived from a
	// prop: the tab and the selection are never seen out of step.
	if (state.seen !== selection) {
		setState(followSelection(state, selection));
	}
	const open = useCallback((tab: SidebarTab): void => {
		setCollapsed(false);
		setState((current) => ({
			...current,
			tab,
			before: tab === "selection" ? current.before : tab,
		}));
	}, []);
	const collapse = useCallback((): void => {
		setCollapsed(true);
	}, []);
	return { tab: state.tab, collapsed, open, collapse };
}

export { useSidebar, type Sidebar, type SidebarTab };
