import { useCallback, type JSX } from "react";
import { Button } from "@archboard/ui-kit/components";
import { ModelSubjectStanding } from "#ui/components/architecture-model/ModelStateDetails.tsx";
import type { Model } from "#ui/rules/architecture-model/projection.ts";

interface CollectionDetailsProps {
	model: Model;
	collection: Model["collections"][number];
	onOpenFlow: (id: string) => void;
}

/**
 * A collection destination offers its authored flows without treating the collection as a module.
 * @param props The exact collection and deliberate flow action.
 * @returns Its meaning and available flows, including an explicit empty state.
 */
function ModelCollectionDetails(props: CollectionDetailsProps): JSX.Element {
	const id = `${props.model.manifest.id}#${props.collection.id}`;
	return (
		<section data-slot="model-collection-details" data-collection-id={id} className="space-y-4">
			<h3 className="text-title font-semibold">{props.collection.name}</h3>
			<p className="text-body text-muted-foreground">Flow collection</p>
			<ModelSubjectStanding model={props.model} subject={id} />
			{props.collection.flows.length === 0 && (
				<p className="text-body">This collection has no flows.</p>
			)}
			<ul className="space-y-3">
				{props.collection.flows.map((flow) => (
					<CollectionFlow key={flow.id} flow={flow} onOpen={props.onOpenFlow} />
				))}
			</ul>
		</section>
	);
}

/**
 * Opening a collection member uses the same explicit flow navigation as the mode selector.
 * @param props The authored flow and navigation action.
 * @param props.flow One complete flow definition.
 * @param props.onOpen The selected flow action.
 * @returns One keyboard-accessible flow choice.
 */
function CollectionFlow({
	flow,
	onOpen,
}: {
	flow: CollectionDetailsProps["collection"]["flows"][number];
	onOpen: CollectionDetailsProps["onOpenFlow"];
}): JSX.Element {
	const open = useCallback((): void => onOpen(flow.id), [flow.id, onOpen]);
	return (
		<li className="text-body space-y-2">
			<Button variant="outline" data-open-flow={flow.id} onClick={open}>
				{flow.name}
			</Button>
			{flow.summary && <p>{flow.summary}</p>}
		</li>
	);
}

export { ModelCollectionDetails };
