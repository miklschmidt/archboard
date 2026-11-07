import { useCallback, useRef, type JSX } from "react";

import type { ModelFlow } from "@archboard/model/content";
import { ModelChoiceList } from "#ui/architecture-drawing/model-reader/reading/components/ModelChoiceList.tsx";
import { useRevealedRow } from "#ui/architecture-drawing/model-reader/reading/hooks/use-revealed-row.ts";

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
 * The flows. The panel beside the picture chooses the representation of the chosen one. The flow
 * on screen stays in view under the name of its collection, wherever it was chosen.
 * @param props The flows and the reading.
 * @returns The list.
 */
function ModelFlows(props: ModelFlowsProps): JSX.Element {
	const { flows, collections, flow, grammar, onChoose } = props;
	const list = useRef<HTMLDivElement>(null);
	const lit = grammar === "architecture" ? null : flow;
	useRevealedRow(list, lit, 1);
	const choose = useCallback(
		(entry: ModelFlow, beside: boolean): void => onChoose(entry.id, beside),
		[onChoose],
	);
	const collectionOf = useCallback(
		(entry: ModelFlow): string => collections.get(entry.id) ?? "",
		[collections],
	);
	return (
		<div ref={list}>
			<ModelChoiceList
				label="Flows"
				entries={flows}
				lit={lit}
				attribute="data-flow-id"
				onChoose={choose}
				sectionOf={collectionOf}
			/>
		</div>
	);
}

export { ModelFlows };
