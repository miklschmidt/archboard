// Which tab of a semantic pane's sidebar is open, and where the sidebar is.
//
// The sidebar has two tabs: the board — how it is being read, and the key to
// what is drawn — and the selection. Picking something out of the diagram is a
// request to be told about it, so it opens the selection tab; letting go of the
// selection is not a request to keep looking at an empty panel, so it gives
// back whichever tab was open before the pick. A person who chooses a tab
// themselves while something is selected keeps that tab until they pick again.
//
// The sidebar is docked or resting. Docked, it takes its width beside the
// picture. Resting, it is its rail of tab icons, and the picture has the width;
// a pick, or a tab chosen on the rail, then lays the panel over the picture's
// edge, and letting go of the pick folds it away again. Neither changes the
// width of the pane, so a pick never refits the picture under the pointer that
// made it. A pane alone docks its sidebar; two panes rest theirs, so each
// picture has the room. Pinning docks it and folding rests it, and that choice
// is the person's for as long as the pane lives.

import { useCallback, useState } from "react";

/** The sidebar's tabs. */
type SidebarTab = "board" | "selection";

/** What the sidebar is showing, and how to change it. */
interface Sidebar {
	/** The open tab. */
	readonly tab: SidebarTab;
	/** Whether it takes its width beside the picture; otherwise it rests as its rail. */
	readonly docked: boolean;
	/** While resting, whether its panel is laid over the picture's edge. */
	readonly floating: boolean;
	/** Whether it shows its rail alone: resting, with nothing laid over the picture. */
	readonly collapsed: boolean;
	/**
	 * Show a tab: in place when docked, laid over the picture when resting.
	 * @param tab The tab.
	 */
	readonly open: (tab: SidebarTab) => void;
	/** Fold it to its rail: rest a docked sidebar, put away a panel laid over the picture. */
	readonly collapse: () => void;
	/** Dock it beside the picture. */
	readonly pin: () => void;
}

/** The tab state, and the selection it last answered. */
interface TabState {
	readonly tab: SidebarTab;
	/** The tab to give back when the selection is let go. */
	readonly before: SidebarTab;
	/** The selection this state was last brought up to date with. */
	readonly seen: string | null;
	/** What laid the panel over the picture, while it is: a pick, or the person on the rail. */
	readonly floatBy: "pick" | "person" | null;
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
		return { tab: "selection", before, seen: selection, floatBy: state.floatBy ?? "pick" };
	}
	const floatBy = state.floatBy === "pick" ? null : state.floatBy;
	return state.tab === "selection"
		? { tab: state.before, before: state.before, seen: null, floatBy }
		: { ...state, seen: null, floatBy };
}

/**
 * Keep the sidebar's tab in step with what is selected, and its place with the panes.
 * @param selection The selected subject, or null.
 * @param resting Whether the sidebar rests unless the person docks it: while two panes share the centre.
 * @returns The sidebar state and its controls.
 */
function useSidebar(selection: string | null, resting: boolean): Sidebar {
	const [state, setState] = useState<TabState>({
		tab: selection === null ? "board" : "selection",
		before: "board",
		seen: selection,
		floatBy: null,
	});
	const [chosen, setChosen] = useState<boolean | null>(null);
	const docked = chosen ?? !resting;
	// Brought up to date during render, as React asks for state derived from a
	// prop: the tab and the selection are never seen out of step.
	if (state.seen !== selection) {
		setState(followSelection(state, selection));
	}
	const open = useCallback((tab: SidebarTab): void => {
		setState((current) => ({
			...current,
			tab,
			before: tab === "selection" ? current.before : tab,
			floatBy: "person",
		}));
	}, []);
	const collapse = useCallback((): void => {
		setState((current) => ({ ...current, floatBy: null }));
		// Folding a docked sidebar rests it; folding a panel laid over the
		// picture only puts the panel away.
		if (docked) setChosen(false);
	}, [docked]);
	const pin = useCallback((): void => {
		setState((current) => ({ ...current, floatBy: null }));
		setChosen(true);
	}, []);
	const floating = !docked && state.floatBy !== null;
	return {
		tab: state.tab,
		docked,
		floating,
		collapsed: !docked && !floating,
		open,
		collapse,
		pin,
	};
}

export { useSidebar, type Sidebar, type SidebarTab };
