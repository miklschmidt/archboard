import type { JSX } from "react";
import { ModelExplanationMenu } from "#ui/architecture-drawing/model-reader/reading/components/ModelExplanationMenu.tsx";
import { ModelSelectionBar } from "#ui/architecture-drawing/model-reader/reading/components/ModelSelectionBar.tsx";
import type { useModelExplanation } from "#ui/architecture-drawing/model-reader/reading/hooks/use-model-explanation.ts";
import type { Reader } from "#ui/architecture-drawing/model-reader/hooks/use-reader.ts";
import { selectedSubject } from "#ui/architecture-drawing/model-reader/rules/selected-subject.ts";

/** What can be done with a selection, wherever it is explained. */
interface SelectionActions {
	readonly reader: Reader;
	readonly behavioralIds: ReadonlySet<string>;
	readonly explanation: ReturnType<typeof useModelExplanation>;
	readonly menu: boolean;
	readonly onMenu: (open: boolean) => void;
}

/**
 * What can be done with the selection.
 * @param props The reader and what the panel says of it.
 * @returns The controls.
 */
function SelectionControls(props: SelectionActions): JSX.Element {
	const { reader, behavioralIds } = props;
	const { selection, location, accepted } = reader;
	const { shown } = accepted;
	return (
		<ModelSelectionBar
			selection={selection}
			onFocus={location.setFocus}
			architectural={location.grammar === "architecture"}
			canFocus={![...selection.ids].some((id) => behavioralIds.has(id))}
			oneLine={selectedSubject({ ...shown, ids: selection.ids }).kind === "connection"}
		>
			<ReadingExplain {...props} />
		</ModelSelectionBar>
	);
}

/**
 * The agent's explanations of a reading. An original under migration has no agent to read it.
 * @param props What can be done with the reading.
 * @returns The menu.
 */
function ReadingExplain(props: SelectionActions): JSX.Element | null {
	const { reader, explanation } = props;
	const { selection, model, accepted } = reader;
	if (model.migrationPreview !== undefined) return null;
	return (
		<ModelExplanationMenu
			open={props.menu}
			onOpenChange={props.onMenu}
			model={accepted.shown.model}
			selected={selection.ids}
			unavailable={explanation.unavailable}
			onAction={explanation.act}
		/>
	);
}

export { ReadingExplain, SelectionControls, type SelectionActions };
