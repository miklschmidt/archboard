import type { JSX } from "react";
import {
	ModelCodeDetails,
	ModelCodeWarnings,
} from "#ui/components/architecture-model/ModelCodeFindings.tsx";
import { ModelExplanationMenu } from "#ui/components/architecture-model/ModelExplanationMenu.tsx";
import { ModelSelectionBar } from "#ui/components/architecture-model/ModelSelectionBar.tsx";
import type { useModelCodeFindings } from "#ui/hooks/architecture-model/use-model-code-findings.ts";
import type { useModelExplanation } from "#ui/hooks/architecture-model/use-model-explanation.ts";
import type { Reader } from "#ui/hooks/architecture-model/use-reader.ts";
import { useShowSubject } from "#ui/hooks/architecture-model/use-show-subject.ts";
import { selectedSubject } from "#ui/rules/architecture-model/selected-subject.ts";

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

/**
 * What the code says of what is open, for the panel while nothing is selected: every warning of
 * the model, which the picture cannot mark while it does not draw the warned part, and the findings
 * of the open module itself.
 * @param props The reader and the findings.
 * @param props.reader The reader.
 * @param props.code The code findings of the reading.
 * @returns The findings.
 */
function ReadingFindings(props: {
	readonly reader: Reader;
	readonly code: ReturnType<typeof useModelCodeFindings>;
}): JSX.Element {
	const { reader, code } = props;
	const onShow = useShowSubject(reader);
	return (
		<>
			<ModelCodeWarnings reading={code.reading} onSelect={onShow} />
			<ModelCodeDetails
				reading={code.reading}
				selected={reader.selection.ids}
				scope={reader.location.scope}
			/>
		</>
	);
}

export { ReadingExplain, ReadingFindings, SelectionControls, type SelectionActions };
