import { useCallback, useMemo, type JSX } from "react";

import type { ModelFlow, projectModel } from "@archboard/board/content";
import { ModelChoiceList } from "#ui/components/architecture-model/ModelChoiceList.tsx";
import { ModelSwitch } from "#ui/components/architecture-model/ModelSwitch.tsx";

/** What a flow can be read as, once it is chosen. */
const REPRESENTATIONS = [
	{ value: "sequence", label: "Sequence" },
	{ value: "flowchart", label: "Flowchart" },
] as const;

type Representation = (typeof REPRESENTATIONS)[number]["value"];

/** Inputs for the flows. */
interface ModelFlowsProps {
	readonly content: ReturnType<typeof projectModel>["depicted"];
	/** The flows that concern the open scope. */
	readonly near: readonly ModelFlow[];
	/** The name of the collection that holds each flow. */
	readonly collections: ReadonlyMap<string, string>;
	/** The flow on screen. */
	readonly flow: string | null;
	readonly grammar: string;
	readonly onChoose: (id: string, beside: boolean) => void;
	readonly onGrammar: (grammar: string) => void;
}

/**
 * The flows, chosen first, with the representation chosen second under the chosen flow.
 * @param props The flows and the reading.
 * @returns The list.
 */
function ModelFlows(props: ModelFlowsProps): JSX.Element {
	const { content, near, collections, flow, grammar, onChoose, onGrammar } = props;
	const rest = useMemo(
		() => content.flows.filter((entry) => !near.includes(entry)),
		[content.flows, near],
	);
	const choose = useCallback(
		(entry: ModelFlow, beside: boolean): void => onChoose(entry.id, beside),
		[onChoose],
	);
	const collectionOf = useCallback(
		(entry: ModelFlow): string => collections.get(entry.id) ?? "",
		[collections],
	);
	const representation: Representation = grammar === "flowchart" ? "flowchart" : "sequence";
	const switcher = useMemo(
		() => (
			<ModelSwitch
				label="Representation"
				slot="model-grammar-selector"
				choices={REPRESENTATIONS}
				value={representation}
				onChange={onGrammar}
			/>
		),
		[representation, onGrammar],
	);
	return (
		<ModelChoiceList
			label="Flows"
			near={near}
			rest={rest}
			restLabel="All flows"
			lit={grammar === "architecture" ? null : flow}
			attribute="data-flow-id"
			onChoose={choose}
			sectionOf={collectionOf}
			under={switcher}
		/>
	);
}

export { ModelFlows };
