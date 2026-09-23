// Which rows of the navigator are open: what the person chose, remembered in
// this browser, except on the path to the board being read and the board
// itself, which are open until the person closes part of them — and open again
// when another board is read, so the tree always shows where the reader is.

import { useCallback, useMemo, useState } from "react";

import { pathIds, type OutlineNode } from "@/ui/board-catalog";
import { useOutlineExpansion } from "@/ui/shell/hooks/use-outline-expansion";
import type { CatalogBoard } from "@/ui/types";

const NO_IDS: ReadonlySet<string> = new Set();

/** The collapses a person made on the path to the board being read, until it changes. */
interface PathCollapses {
	readonly board: string | null;
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
 * The navigator's open rows.
 * @param outline The outline.
 * @param activeBoard The board being read, or null.
 * @returns The expansion.
 */
function useNavigatorExpansion(
	outline: readonly OutlineNode<CatalogBoard>[],
	activeBoard: string | null,
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
	// The board being read is open too: what it drills down to is where a
	// reader is most likely to go next.
	const activePath = useMemo(
		() =>
			new Set(
				activeBoard === null
					? []
					: [...pathIds(outline, activeBoard), `board:${activeBoard.toLowerCase()}`],
			),
		[outline, activeBoard],
	);
	const [collapses, setCollapses] = useState<PathCollapses>({ board: activeBoard, ids: NO_IDS });
	const closedOnPath = collapses.board === activeBoard ? collapses.ids : NO_IDS;
	const expanded = useCallback(
		(id: string): boolean => (activePath.has(id) ? !closedOnPath.has(id) : chosen.expanded(id)),
		[activePath, closedOnPath, chosen],
	);
	const setExpanded = useCallback(
		(id: string, open: boolean): void => {
			if (!activePath.has(id)) {
				chosen.setExpanded(id, open);
				return;
			}
			const ids = new Set(closedOnPath);
			if (open) ids.delete(id);
			else ids.add(id);
			setCollapses({ board: activeBoard, ids });
		},
		[activePath, closedOnPath, activeBoard, chosen],
	);
	return useMemo(() => ({ expanded, setExpanded }), [expanded, setExpanded]);
}

export { useNavigatorExpansion, type NavigatorExpansion };
