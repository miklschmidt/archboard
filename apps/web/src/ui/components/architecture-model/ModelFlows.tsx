import { useCallback, type JSX } from "react";

import type { ModelFlow } from "@archboard/model/content";
import { ModelChoiceList } from "#ui/components/architecture-model/ModelChoiceList.tsx";

/** Inputs for the flows. */
interface ModelFlowsProps {
	/** Every flow of the model, whatever is open. */
	readonly flows: readonly ModelFlow[];
	/** The name of the collection that holds each flow. */
	readonly collections: ReadonlyMap<string, string>;
	/** The flow on screen. */
	readonly flow: string | null;
	readonly grammar: string;
	readonly onChoose: (id: string, beside: boolean) => void;
}

/**
 * The flows. The panel beside the picture chooses the representation of the chosen one.
 * @param props The flows and the reading.
 * @returns The list.
 */
function ModelFlows(props: ModelFlowsProps): JSX.Element {
	const { flows, collections, flow, grammar, onChoose } = props;
	const choose = useCallback(
		(entry: ModelFlow, beside: boolean): void => onChoose(entry.id, beside),
		[onChoose],
	);
	const collectionOf = useCallback(
		(entry: ModelFlow): string => collections.get(entry.id) ?? "",
		[collections],
	);
	return (
		<ModelChoiceList
			label="Flows"
			entries={flows}
			lit={grammar === "architecture" ? null : flow}
			attribute="data-flow-id"
			onChoose={choose}
			sectionOf={collectionOf}
			flat
		/>
	);
}

export { ModelFlows };
