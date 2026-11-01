import { useEffect, type RefObject } from "react";
import { ROW_HEIGHT } from "#ui/rules/shell/tree-grid.ts";

/**
 * Keep a row in view when it changes, unless the person is using the list: a row moving under
 * their pointer or focus would be a row they did not choose. The rows that stick above it cover
 * the top of the column, so it stands clear of them.
 * @param list The element around the list.
 * @param id The row, or null.
 * @param depth How many rows stick above it.
 */
function useRevealedRow(
	list: RefObject<HTMLDivElement | null>,
	id: string | null,
	depth: number,
): void {
	useEffect(() => {
		const root = list.current;
		if (id === null || root === null) return;
		if (root.contains(document.activeElement) || root.matches(":hover")) return;
		const row = root.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`);
		if (row === null) return;
		row.style.scrollMarginTop = `${depth * ROW_HEIGHT}px`;
		row.scrollIntoView({ block: "nearest" });
	}, [list, id, depth]);
}

export { useRevealedRow };
