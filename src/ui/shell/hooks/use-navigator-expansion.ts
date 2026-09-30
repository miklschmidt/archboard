// Which rows of the navigator are open: what the person chose, remembered in
// this browser, except on the way to what the panes show. Every pane's board,
// the folders and boards above it, and the Earlier row holding its variant
// when that variant is historical or shelved, are open until the person closes
// part of them, and open again when a pane moves, so the tree always shows
// which board and variant each pane shows.

import { useCallback, useMemo, useState } from "react";

import { pathIds, type OutlineNode } from "@/ui/board-catalog";
import { useOutlineExpansion } from "@/ui/shell/hooks/use-outline-expansion";
import { readingRowIds } from "@/ui/shell/lib/variant-rows";
import type { PaneMark } from "@/ui/shell/types/navigator-rows";
import type { CatalogBoard } from "@/ui/types";

const NO_IDS: ReadonlySet<string> = new Set();

/** The collapses a person made on the way to what the panes show, until a pane moves. */
interface PathCollapses {
	/** What the panes showed when the collapses were made. */
	readonly shown: string;
	readonly ids: ReadonlySet<string>;
}

/** The navigator's open rows. */
interface NavigatorExpansion {
	/**
	 * Whether a row is open.
	 * @param id The row.
	 * @returns True when open.
	 */
	readonly expanded: (id: string) => boolean;
	/**
	 * Open or close a row.
	 * @param id The row.
	 * @param open Whether it opens.
	 */
	readonly setExpanded: (id: string, open: boolean) => void;
}

/**
 * The rows on the way to what the panes show, and the board rows themselves:
 * what a board drills down to is where a reader is most likely to go next.
 * @param outline The outline.
 * @param panes The panes.
 * @returns The ids.
 */
function shownPathIds(
	outline: readonly OutlineNode<CatalogBoard>[],
	panes: readonly PaneMark[],
): Set<string> {
	return new Set(
		panes.flatMap((pane) =>
			pane.board === null ? [] : [...pathIds(outline, pane.board), ...readingRowIds(outline, pane)],
		),
	);
}

/**
 * The navigator's open rows.
 * @param outline The outline.
 * @param panes The panes.
 * @returns The expansion.
 */
function useNavigatorExpansion(
	outline: readonly OutlineNode<CatalogBoard>[],
	panes: readonly PaneMark[],
): NavigatorExpansion {
	const topBoards = useMemo(
		() =>
			new Set(
				outline
					.filter((node) => node.kind === "board" && node.children.length > 0)
					.map((node) => node.id),
			),
		[outline],
	);
	const openByDefault = useCallback((id: string): boolean => topBoards.has(id), [topBoards]);
	const chosen = useOutlineExpansion(openByDefault);
	const shown = panes.map((pane) => pane.key ?? "").join("\n");
	const path = useMemo(() => shownPathIds(outline, panes), [outline, panes]);
	const [collapses, setCollapses] = useState<PathCollapses>({ shown, ids: NO_IDS });
	const closedOnPath = collapses.shown === shown ? collapses.ids : NO_IDS;
	const expanded = useCallback(
		(id: string): boolean => (path.has(id) ? !closedOnPath.has(id) : chosen.expanded(id)),
		[path, closedOnPath, chosen],
	);
	const setExpanded = useCallback(
		(id: string, open: boolean): void => {
			if (!path.has(id)) {
				chosen.setExpanded(id, open);
				return;
			}
			const ids = new Set(closedOnPath);
			if (open) ids.delete(id);
			else ids.add(id);
			setCollapses({ shown, ids });
		},
		[path, closedOnPath, shown, chosen],
	);
	return useMemo(() => ({ expanded, setExpanded }), [expanded, setExpanded]);
}

export { useNavigatorExpansion, type NavigatorExpansion };
