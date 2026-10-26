import { useCallback, type JSX, type ReactNode } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";

/**
 * The selected set remains visible without changing the architecture reading.
 * @param props The selection and its clearing action.
 * @param props.selection Canonical selected identities.
 * @param props.focus The captured focused identities, or no focus.
 * @param props.onFocus Changes the focused reading.
 * @param props.architectural Whether structural focus actions apply.
 * @param props.children Additional reading controls.
 * @returns Stable selection and focus controls without resizing the canvas.
 */
function ModelSelectionBar(props: {
	selection: ModelSelection;
	architectural: boolean;
	children?: ReactNode;
	focus: readonly string[] | null;
	onFocus: (ids: readonly string[] | null) => void;
}): JSX.Element {
	const { selection, focus, onFocus } = props;
	const focusSelection = useCallback(
		(): void => onFocus([...selection.ids]),
		[onFocus, selection.ids],
	);
	const clearFocus = useCallback((): void => onFocus(null), [onFocus]);
	return (
		<div className="border-border flex items-center gap-4 border-b px-6 py-2">
			<output
				data-slot="model-selection-count"
				data-count={selection.ids.size}
				className="text-control"
			>
				{selection.ids.size} selected
			</output>
			{props.architectural && (
				<Button
					data-slot="model-focus"
					variant="outline"
					size="sm"
					disabled={selection.ids.size === 0}
					onClick={focusSelection}
				>
					Focus
				</Button>
			)}
			{props.architectural && focus !== null && (
				<Button data-slot="model-clear-focus" variant="outline" size="sm" onClick={clearFocus}>
					Clear focus ({focus.length})
				</Button>
			)}
			<Button
				variant="ghost"
				size="sm"
				onClick={selection.clear}
				disabled={selection.ids.size === 0}
			>
				Clear selection
			</Button>
			{props.children}
		</div>
	);
}

export { ModelSelectionBar };
