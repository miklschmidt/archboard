import { useCallback } from "react";
import { usePeekControl } from "#ui/architecture-drawing/canvas/picture/hooks/use-peek.ts";

/**
 * Light a subject on the picture while a row is pointed at.
 * @param id The subject.
 * @returns What the row listens with.
 */
function usePeekRow(id: string) {
	const { point } = usePeekControl();
	const onPointerEnter = useCallback((): void => point(id), [point, id]);
	const onPointerLeave = useCallback((): void => point(null), [point]);
	return { onPointerEnter, onPointerLeave };
}

export { usePeekRow };
