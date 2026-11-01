import type { JSX } from "react";
import type { ModelFlow } from "@archboard/board/content";
import { ModelPanel } from "#ui/components/architecture-model/ModelPanel.tsx";
import { ModelSwitch } from "#ui/components/architecture-model/ModelSwitch.tsx";

/** What a flow can be read as. */
const REPRESENTATIONS = [
	{ value: "sequence", label: "Sequence" },
	{ value: "flowchart", label: "Flowchart" },
] as const;

type Representation = (typeof REPRESENTATIONS)[number]["value"];

/** Inputs for the head of a flow. */
interface ModelFlowHeadProps {
	readonly flow: ModelFlow;
	/** The name of the collection that holds the flow, when a state holds it. */
	readonly collection: string | undefined;
	readonly grammar: string;
	readonly onGrammar: (grammar: string) => void;
}

/**
 * The head of the panel on a flow: its name, where it belongs, since the open module does not own
 * it, and how it is read.
 * @param props The flow and its representation.
 * @returns The head.
 */
function ModelFlowHead(props: ModelFlowHeadProps): JSX.Element {
	const { flow, collection, grammar, onGrammar } = props;
	const representation: Representation = grammar === "flowchart" ? "flowchart" : "sequence";
	return (
		<>
			<ModelPanel.Head title={flow.name}>
				<span data-slot="model-flow-home">
					{collection === undefined ? "Flow" : `Flow in ${collection}`}
				</span>
			</ModelPanel.Head>
			<ModelSwitch
				label="Representation"
				slot="model-grammar-selector"
				choices={REPRESENTATIONS}
				value={representation}
				onChange={onGrammar}
			/>
		</>
	);
}

export { ModelFlowHead };
