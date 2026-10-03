// The shortcut for the part search, heard by the sidebar's frame and not by the
// field: the field is not drawn while the sidebar is away, and a shortcut that
// only the field hears does nothing in the one layout, two panes, where the
// sidebar is away most of the time. The frame shows the sidebar where the person
// last had it when it is away, and asks for the field; the field takes focus
// when it is there to take it, and says that it has.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { usePaneChrome } from "@/ui/components/PaneChrome";
import type { Sidebar } from "@/ui/semantic-board-canvas/hooks/use-sidebar";
import { asksForSearch } from "@/ui/semantic-board-canvas/lib/search-shortcut";

/** Whether the field has been asked for, and how to say that it has taken focus. */
interface SearchRequest {
	/** The shortcut was pressed in this pane and the field has not taken focus yet. */
	readonly requested: boolean;
	/** The field took focus. */
	readonly settled: () => void;
}

/**
 * Nothing to say: a field outside a sidebar is never asked for.
 * @returns Nothing.
 */
function settleNothing(): void {
	return undefined;
}

/** What a field outside a sidebar hears: nothing asked. */
const NOTHING_ASKED: SearchRequest = Object.freeze({ requested: false, settled: settleNothing });

/** Carries what the frame heard to the field it holds. */
const SearchRequestContext = createContext<SearchRequest>(NOTHING_ASKED);

/**
 * Listen for the search shortcut for this pane, which is the pane with focus.
 * @param sidebar The sidebar, which the shortcut shows when it is away.
 * @returns What the field needs to know.
 */
function useSearchRequest(sidebar: Sidebar): SearchRequest {
	const { active } = usePaneChrome();
	const { shown, toggle } = sidebar;
	const [requested, setRequested] = useState(false);
	useEffect(() => {
		if (!active) {
			return undefined;
		}
		/**
		 * Show the sidebar when it is away, and ask for the field.
		 * @param event The key event.
		 */
		const onKey = (event: KeyboardEvent): void => {
			if (document.fullscreenElement !== null || !asksForSearch(event)) {
				return;
			}
			event.preventDefault();
			if (!shown) toggle();
			setRequested(true);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [active, shown, toggle]);
	const settled = useCallback((): void => {
		setRequested(false);
	}, []);
	return useMemo(() => ({ requested, settled }), [requested, settled]);
}

/**
 * What the frame asked of the field.
 * @returns Whether the field was asked for, and how to say that it took focus.
 */
function useSearchRequested(): SearchRequest {
	return useContext(SearchRequestContext);
}

export { SearchRequestContext, useSearchRequest, useSearchRequested, type SearchRequest };
