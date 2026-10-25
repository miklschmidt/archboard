// The shortcut for the part search, heard by the sidebar's frame and not by the
// field: the field is not drawn while the sidebar is away, and a shortcut that
// only the field hears does nothing in the one layout, two panes, where the
// sidebar is away most of the time. The frame shows the sidebar where the person
// last had it when it is away, and asks for the field; the field takes focus
// when it is there to take it, and says that it has. A part chosen in the field
// is explained in the selection tab under it, and the frame gives that tab the
// keyboard, as it does for every control that goes with a pick.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { usePaneChrome } from "#ui/hooks/semantic-board-canvas/use-pane-chrome.ts";
import type { Sidebar } from "#ui/hooks/semantic-board-canvas/use-sidebar.ts";
import { asksForSearch } from "#ui/rules/semantic-board-canvas/board/search-shortcut.ts";

/** Whether the field has been asked for, how to say that it has taken focus, and where focus goes after a choice. */
interface SearchRequest {
	/** The shortcut was pressed in this pane and the field has not taken focus yet. */
	readonly requested: boolean;
	/** The field took focus. */
	readonly settled: () => void;
	/** A part was chosen: give focus to the tab that explains it, so the keyboard is not left on the page's body. */
	readonly chosen: () => void;
}

/**
 * Nothing to do: a field outside a sidebar is never asked for, and keeps focus after a choice.
 * @returns Nothing.
 */
function doNothing(): void {
	return undefined;
}

/** What a field outside a sidebar hears: nothing asked. */
const NOTHING_ASKED: SearchRequest = Object.freeze({
	requested: false,
	settled: doNothing,
	chosen: doNothing,
});

/** Carries what the frame heard to the field it holds. */
const SearchRequestContext = createContext<SearchRequest>(NOTHING_ASKED);

/**
 * Listen for the search shortcut for this pane, which is the pane with focus.
 * @param sidebar The sidebar, which the shortcut shows when it is away.
 * @returns What the field needs to know.
 */
function useSearchRequest(sidebar: Sidebar): SearchRequest {
	const { active } = usePaneChrome();
	const { shown, toggle, steppedAside, selectionTabId } = sidebar;
	const [requested, setRequested] = useState(false);
	useEffect(() => {
		// A presented walkthrough has the sidebar stepped aside: nothing here is on screen to ask for.
		if (!active || steppedAside) {
			return undefined;
		}
		/**
		 * Show the sidebar when it is away, and ask for the field.
		 * @param event The key event.
		 */
		const onKey = (event: KeyboardEvent): void => {
			if (document.fullscreenElement !== null || event.defaultPrevented || !asksForSearch(event)) {
				return;
			}
			event.preventDefault();
			if (!shown) toggle();
			setRequested(true);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [active, steppedAside, shown, toggle]);
	const settled = useCallback((): void => {
		setRequested(false);
	}, []);
	const chosen = useCallback((): void => {
		document.getElementById(selectionTabId)?.focus();
	}, [selectionTabId]);
	return useMemo(() => ({ requested, settled, chosen }), [requested, settled, chosen]);
}

/**
 * What the frame asked of the field.
 * @returns Whether the field was asked for, and how to say that it took focus.
 */
function useSearchRequested(): SearchRequest {
	return useContext(SearchRequestContext);
}

export { SearchRequestContext, useSearchRequest, useSearchRequested, type SearchRequest };
