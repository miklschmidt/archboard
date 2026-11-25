import { useCallback, useMemo, useRef, type JSX, type MouseEvent } from "react";

import type { ModelFlow } from "@archboard/model/content";
import { ClaimMark } from "#ui/shell/components/ActivityLamp.tsx";
import { ModelPanel } from "#ui/architecture-drawing/model-reader/reading/components/ModelPanel.tsx";
import { useRevealedRow } from "#ui/architecture-drawing/model-reader/reading/hooks/use-revealed-row.ts";
import {
	claimsOn,
	type ClaimedSubjects,
} from "#ui/architecture-drawing/model-reader/rules/claimed-subjects.ts";

/** Inputs for the flows. */
interface ModelFlowsProps {
	/** Every flow of the model, whatever is open. */
	readonly flows: readonly ModelFlow[];
	/** The name of the collection that holds each flow. */
	readonly collections: ReadonlyMap<string, string>;
	/** The flow on screen. */
	readonly flow: string | null;
	readonly grammar: string;
	/** What the agents claim. */
	readonly claimed: ClaimedSubjects;
	readonly onChoose: (id: string, beside: boolean) => void;
}

/**
 * One flow row in the navigator, drawn with the panel's row so flows read alike in both side
 * columns. Alt opens the flow in the other pane.
 * @param props The flow, whether it is on screen, active claims and the open handler.
 * @param props.entry The flow.
 * @param props.current Whether the flow is on screen.
 * @param props.claimed Active agent claims.
 * @param props.onChoose Open the flow.
 * @returns A row of the flows list.
 */
function FlowRow(props: {
	readonly entry: ModelFlow;
	readonly current: boolean;
	readonly claimed: ClaimedSubjects;
	readonly onChoose: (id: string, beside: boolean) => void;
}): JSX.Element {
	const { entry, current, claimed, onChoose } = props;
	const claims = useMemo(() => claimsOn(claimed, [entry.id]), [claimed, entry.id]);
	const mark = useMemo(
		() => (claims.length > 0 ? <ClaimMark purposes={claims} /> : undefined),
		[claims],
	);
	const open = useCallback(
		(event: MouseEvent<HTMLButtonElement>): void => onChoose(entry.id, event.altKey),
		[entry.id, onChoose],
	);
	return (
		<ModelPanel.Row
			data-flow-id={entry.id}
			data-row-id={entry.id}
			aria-current={current ? "location" : undefined}
			onClick={open}
			name={entry.name}
			mark={mark}
		/>
	);
}

/**
 * The flows. The panel beside the picture chooses the representation of the chosen one. The flow
 * on screen stays in view under the name of its collection, wherever it was chosen.
 * @param props The flows and the reading.
 * @returns The list.
 */
function ModelFlows(props: ModelFlowsProps): JSX.Element {
	const { flows, collections, flow, grammar, claimed, onChoose } = props;
	const list = useRef<HTMLDivElement>(null);
	const lit = grammar === "architecture" ? null : flow;
	useRevealedRow(list, lit, 0);
	const collectionOf = useCallback(
		(entry: ModelFlow): string => collections.get(entry.id) ?? "",
		[collections],
	);
	return (
		<div ref={list} className="py-1 pr-3 pl-2">
			<ul aria-label="Flows" className="flex flex-col">
				<ModelPanel.Rows items={flows} limit={flows.length} groupOf={collectionOf}>
					{(entry) => (
						<FlowRow
							key={entry.id}
							entry={entry}
							current={entry.id === lit}
							claimed={claimed}
							onChoose={onChoose}
						/>
					)}
				</ModelPanel.Rows>
			</ul>
		</div>
	);
}

export { ModelFlows };
