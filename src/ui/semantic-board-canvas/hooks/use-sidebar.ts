// Which tab of a semantic pane's sidebar is open, and where the sidebar is.
//
// The sidebar has two tabs: the board — how it is being read, and the key to
// what is drawn — and the selection. Picking something out of the diagram is a
// request to be told about it, so it opens the selection tab; letting go of the
// selection is not a request to keep looking at an empty panel, so it gives
// back whichever tab was open before. A person who chooses a tab themselves
// while something is selected keeps that tab until they pick again.
//
// The sidebar is docked, floating or away. Docked, it takes its width beside
// the picture. Floating, its panel is laid over the picture's edge, and the
// picture has the width. Away, it is nowhere: no bar, no icons, and the control
// in the pane's header is how it comes back. A pane alone docks its sidebar; two
// panes keep theirs away, so each picture has the room, until a pick or the
// control floats it. A pick floats it and letting go of the pick puts it away
// again, so neither refits the picture under the pointer that made it. What the
// person asks for is theirs for as long as the pane lives: pinning docks a
// floating panel, and hiding a docked sidebar means it docks again, and does
// not float, when they ask for it back.

import { useCallback, useId, useState } from "react";

/** The sidebar's tabs. */
type SidebarTab = "board" | "selection";

/** What the sidebar is showing, and how to change it. */
interface Sidebar {
	/** The open tab. */
	readonly tab: SidebarTab;
	/** Whether it takes its width beside the picture. */
	readonly docked: boolean;
	/** Whether its panel is laid over the picture's edge. */
	readonly floating: boolean;
	/** Whether its panel is on screen, docked or floating. */
	readonly shown: boolean;
	/** The panel's id, which the control that shows and hides it points at. */
	readonly panelId: string;
	/** The id of the control that shows and hides it, which a panel put away gives focus back to. */
	readonly toggleId: string;
	/**
	 * Choose a tab of the panel the person is looking at.
	 * @param tab The tab.
	 */
	readonly open: (tab: SidebarTab) => void;
	/** Show the panel where the person last had it, or put it away. */
	readonly toggle: () => void;
	/** Dock a floating panel beside the picture. */
	readonly pin: () => void;
	/** Put a floating panel away. */
	readonly putAway: () => void;
}

/** The sidebar's state, and the selection it last answered. */
interface Frame {
	readonly tab: SidebarTab;
	/** The tab to give back when the selection is let go. */
	readonly before: SidebarTab;
	/** The selection this state was last brought up to date with. */
	readonly seen: string | null;
	/** Whether the person has it docked, when they have said; null leaves it to the pane. */
	readonly pinned: boolean | null;
	/** A docked sidebar the person put away, which docks again when they ask for it. */
	readonly away: boolean;
	/** What laid the panel over the picture, while it is: a pick, or the person. */
	readonly floatBy: "pick" | "person" | null;
}

/**
 * The state after the selection changed.
 * @param state The state before.
 * @param selection The selection now.
 * @returns The state after.
 */
function followSelection(state: Frame, selection: string | null): Frame {
	if (selection !== null) {
		const before = state.tab === "selection" ? state.before : state.tab;
		return {
			...state,
			tab: "selection",
			before,
			seen: selection,
			floatBy: state.floatBy ?? "pick",
		};
	}
	const floatBy = state.floatBy === "pick" ? null : state.floatBy;
	return state.tab === "selection"
		? { ...state, tab: state.before, seen: null, floatBy }
		: { ...state, seen: null, floatBy };
}

/**
 * Whether the person has the sidebar docked, as they have said or the pane has it.
 * @param state The state.
 * @param resting Whether the sidebar stays away unless the person docks it.
 * @returns Whether the sidebar is docked unless it is put away.
 */
function dockedBy(state: Frame, resting: boolean): boolean {
	return state.pinned ?? !resting;
}

/**
 * The state after the control that shows and hides the sidebar was pressed.
 * @param state The state before.
 * @param docked Whether the sidebar is docked now.
 * @param floating Whether its panel is floating now.
 * @param pinned Whether it docks unless it is put away.
 * @returns The state after.
 */
function toggled(state: Frame, docked: boolean, floating: boolean, pinned: boolean): Frame {
	if (docked) {
		return { ...state, away: true, floatBy: null };
	}
	if (floating) {
		return { ...state, floatBy: null };
	}
	return pinned ? { ...state, away: false } : { ...state, floatBy: "person" };
}

/**
 * Keep the sidebar's tab in step with what is selected, and its place with the panes.
 * @param selection The selected subject, or null.
 * @param resting Whether the sidebar stays away unless the person docks it: while two panes share the centre.
 * @returns The sidebar state and its controls.
 */
function useSidebar(selection: string | null, resting: boolean): Sidebar {
	const [state, setState] = useState<Frame>({
		tab: selection === null ? "board" : "selection",
		before: "board",
		seen: selection,
		pinned: null,
		away: false,
		floatBy: null,
	});
	const panelId = useId();
	const toggleId = useId();
	const pinned = dockedBy(state, resting);
	const docked = pinned && !state.away;
	const floating = !docked && state.floatBy !== null;
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
	const toggle = useCallback((): void => {
		setState((current) => toggled(current, docked, floating, pinned));
	}, [docked, floating, pinned]);
	const pin = useCallback((): void => {
		setState((current) => ({ ...current, pinned: true, away: false, floatBy: null }));
	}, []);
	const putAway = useCallback((): void => {
		setState((current) => ({ ...current, floatBy: null }));
	}, []);
	return {
		tab: state.tab,
		docked,
		floating,
		shown: docked || floating,
		panelId,
		toggleId,
		open,
		toggle,
		pin,
		putAway,
	};
}

export { useSidebar, type Sidebar, type SidebarTab };
