import { useCallback, type KeyboardEvent, type MouseEvent } from "react";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";

/**
 * Native choices share modifier semantics with diagram picks.
 * @param id The visible subject identity.
 * @param select The canonical selection action.
 * @returns Pointer and keyboard actions for a native button.
 */
function useModelPick(id: string, select: ModelSelection["select"]) {
	const click = useCallback(
		(event: MouseEvent<HTMLButtonElement>): void => {
			select(id, event.ctrlKey || event.metaKey);
		},
		[id, select],
	);
	const keyDown = useCallback(
		(event: KeyboardEvent<HTMLButtonElement>): void => {
			if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;
			event.preventDefault();
			select(id, true);
		},
		[id, select],
	);
	return { onClick: click, onKeyDown: keyDown };
}

export { useModelPick };
