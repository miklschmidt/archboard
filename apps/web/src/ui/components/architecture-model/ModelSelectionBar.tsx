import type { JSX } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";

/**
 * The selected set remains visible without changing the architecture reading.
 * @param props The selection and its clearing action.
 * @param props.selection Canonical selected identities.
 * @returns A count and a direct action, or no row for an empty selection.
 */
function ModelSelectionBar(props: { selection: ModelSelection }): JSX.Element | null {
	const { selection } = props;
	if (selection.ids.size === 0) return null;
	return (
		<div className="border-border flex items-center gap-4 border-b px-6 py-2">
			<output
				data-slot="model-selection-count"
				data-count={selection.ids.size}
				className="text-control"
			>
				{selection.ids.size} selected
			</output>
			<Button variant="ghost" size="sm" onClick={selection.clear}>
				Clear selection
			</Button>
		</div>
	);
}

export { ModelSelectionBar };
