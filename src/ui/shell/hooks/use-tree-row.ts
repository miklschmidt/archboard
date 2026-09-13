// Expansion belongs to a row. Left and right follow ancestry; the surrounding
// roving list owns vertical movement through the visible rows.
import { useCallback, useRef, useState, type KeyboardEvent } from "react";

/**
 * A tree row's expansion and horizontal keyboard navigation.
 * @param parentId The parent row, absent for a board root.
 * @param childId The first child row, absent for a leaf.
 * @returns The expansion state, toggle, keyboard handler and row ref.
 */
function useTreeRow(parentId: string | undefined, childId: string | undefined) {
	const [open, setOpen] = useState(true);
	const ref = useRef<HTMLButtonElement>(null);
	const toggle = useCallback((): void => {
		ref.current?.focus();
		setOpen((current) => !current);
	}, []);
	const onKeyDown = useCallback(
		(event: KeyboardEvent<HTMLButtonElement>): void => {
			if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
			event.preventDefault();
			event.stopPropagation();
			const expanding = event.key === "ArrowRight";
			if (childId !== undefined && expanding !== open) {
				setOpen(expanding);
				return;
			}
			focusRow(event.currentTarget, expanding ? childId : parentId);
		},
		[childId, open, parentId],
	);
	return { open, toggle, onKeyDown, ref };
}

/**
 * Focus a row in the same tree by its stable roving id.
 * @param source The row that heard the key.
 * @param target The parent or child to focus.
 */
function focusRow(source: HTMLElement, target: string | undefined): void {
	const tree = source.closest('[role="tree"]');
	const row = [...(tree?.querySelectorAll<HTMLElement>("[data-roving-id]") ?? [])].find(
		(item) => item.dataset["rovingId"] === target,
	);
	row?.focus();
}

export { useTreeRow };
