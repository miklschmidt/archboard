import { useCallback, type JSX, type ReactNode } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";

/**
 * What can be done with the selection, without changing the size of the picture.
 * @param props The selection and what it can do.
 * @param props.selection Canonical selected identities.
 * @param props.onFocus Changes the focused reading.
 * @param props.canFocus Whether selected subjects belong to architecture.
 * @param props.architectural Whether structural focus actions apply.
 * @param props.oneLine Whether the selection is the relationships of one line, which reads as one.
 * @param props.children Additional actions.
 * @returns The actions.
 */
function ModelSelectionBar(props: {
	selection: ModelSelection;
	architectural: boolean;
	canFocus: boolean;
	oneLine: boolean;
	children?: ReactNode;
	onFocus: (ids: readonly string[] | null) => void;
}): JSX.Element {
	const { selection, onFocus } = props;
	const focusSelection = useCallback(
		(): void => onFocus([...selection.ids]),
		[onFocus, selection.ids],
	);
	const count = selection.ids.size;
	return (
		<div data-slot="model-selection-bar" className="flex flex-wrap items-center gap-2">
			<output
				data-slot="model-selection-count"
				data-count={count}
				hidden={count < 2 || props.oneLine}
				className="text-control"
			>
				{count} selected
			</output>
			{props.architectural && count > 0 && (
				<Button
					data-slot="model-focus"
					variant="outline"
					size="sm"
					disabled={!props.canFocus}
					onClick={focusSelection}
				>
					Focus
				</Button>
			)}
			{props.children}
		</div>
	);
}

export { ModelSelectionBar };
