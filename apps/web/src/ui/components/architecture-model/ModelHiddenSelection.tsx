import { useCallback, type JSX } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { projectModel } from "#ui/rules/architecture-model/projection.ts";
import { flowSubjects } from "#ui/rules/architecture-model/flow-reading.ts";

interface ModelHiddenSelectionProps {
	projection: ReturnType<typeof projectModel>;
	selected: ReadonlySet<string>;
	onReveal: () => void;
	onRevealFlow: (id: string) => void;
}

/**
 * A hidden selection remains inspectable in its structural or authored flow context.
 * @param props The visible projection, selected identities, and explicit reveal actions.
 * @returns A hidden count with actions for the readings that contain those subjects.
 */
function ModelHiddenSelection(props: ModelHiddenSelectionProps): JSX.Element | null {
	const hidden = hiddenSelection(props);
	if (hidden.count === 0) return null;
	return (
		<section className="border-border mb-6 space-y-3 border-b pb-4">
			<output
				data-slot="model-hidden-selection"
				data-count={hidden.count}
				className="text-body block"
			>
				{hidden.count} selected subjects are hidden in this reading.
			</output>
			{hidden.structural > 0 && (
				<Button
					data-slot="model-reveal-selection"
					variant="outline"
					size="sm"
					onClick={props.onReveal}
				>
					Reveal selection
				</Button>
			)}
			{hidden.flows.map((flow) => (
				<RevealFlow key={flow.id} id={flow.id} name={flow.name} onReveal={props.onRevealFlow} />
			))}
		</section>
	);
}

/**
 * Count known subjects that the current projection does not represent.
 * @param props The coherent state, visible content, and selection.
 * @param props.projection The complete and visible architectural content.
 * @param props.selected Canonical selected identities.
 * @returns Hidden structural subjects and separate authored flows that can reveal the rest.
 */
function hiddenSelection({ projection, selected }: ModelHiddenSelectionProps) {
	const visible = new Set([
		...projection.content.nodes.map((node) => node.id),
		...projection.connections.flatMap(({ joins }) => joins.map((edge) => edge.id)),
		...flowSubjects(projection.content.flows).map((subject) => subject.id),
	]);
	const structural = [...projection.depicted.nodes, ...projection.depicted.edges].filter(
		(subject) => selected.has(subject.id) && !visible.has(subject.id),
	);
	const behavioral = flowSubjects(projection.depicted.flows).filter(
		(subject) => selected.has(subject.id) && !visible.has(subject.id),
	);
	const hiddenIds = new Set(behavioral.map((subject) => subject.id));
	return {
		count: structural.length + behavioral.length,
		structural: structural.length,
		flows: projection.depicted.flows.filter((flow) =>
			flowSubjects([flow]).some((subject) => hiddenIds.has(subject.id)),
		),
	};
}

/**
 * A reader explicitly chooses which authored flow reveals a hidden step.
 * @param props The flow identity, name, and reading action.
 * @param props.id The stable flow identity.
 * @param props.name Its authored name.
 * @param props.onReveal Opens that flow without changing selection.
 * @returns One flow action, without combining separate flows.
 */
function RevealFlow(props: {
	id: string;
	name: string;
	onReveal: (id: string) => void;
}): JSX.Element {
	const { id, onReveal } = props;
	const reveal = useCallback((): void => onReveal(id), [id, onReveal]);
	return (
		<Button
			data-reveal-flow={id}
			variant="outline"
			size="sm"
			className="max-w-full whitespace-normal"
			onClick={reveal}
		>
			Show {props.name}
		</Button>
	);
}

export { ModelHiddenSelection };
