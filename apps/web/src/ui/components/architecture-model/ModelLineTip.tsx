import type { JSX } from "react";
import type { Model, projectModel } from "@archboard/model/content";
import { kindNames, lineEnds } from "#ui/components/architecture-model/ModelConnections.tsx";
import { TipCard } from "#ui/architecture-drawing/canvas/presentation/components/SemanticSubjectTip.tsx";
import type { TipTarget } from "#ui/architecture-drawing/canvas/picture/clients/subject-tips.ts";

type Projection = ReturnType<typeof projectModel>;

interface ModelLineTipProps {
	target: TipTarget | null;
	model: Model;
	projection: Projection;
}

/**
 * A joined line lists its kinds and every relationship that it holds.
 * @param props The part under the pointer and the reading it belongs to.
 * @returns The tip, or nothing when the pointer rests on anything but a joined line.
 */
function ModelLineTip(props: ModelLineTipProps): JSX.Element | null {
	const { target, model, projection } = props;
	const connection = projection.connections.find(({ line }) => line.id === target?.id);
	if (target?.part !== "line" || connection === undefined || connection.joins.length === 1) {
		return null;
	}
	return (
		<TipCard slot="model-line-tip">
			<p className="text-body font-semibold">
				{lineEnds(connection.line, model, projection.reference)}
			</p>
			<p className="text-technical text-muted-foreground">{kindNames(model, connection.joins)}</p>
			<TipRelationships edges={connection.joins} model={model} reference={projection.reference} />
		</TipCard>
	);
}

/**
 * Relationships in a tip, each with what it says and its real ends.
 * @param props The relationships and what names their ends.
 * @param props.edges The relationships.
 * @param props.model The model.
 * @param props.reference The comparison base, which names removed ends.
 * @returns The list.
 */
function TipRelationships(props: {
	readonly edges: readonly Projection["connections"][number]["joins"][number][];
	readonly model: Model;
	readonly reference: Model | undefined;
}): JSX.Element {
	const { model, reference } = props;
	return (
		<ul className="text-body space-y-1">
			{props.edges.map((edge) => (
				<li key={edge.id}>
					{edge.label === undefined ? "" : `${edge.label}: `}
					{lineEnds(edge, model, reference)}
				</li>
			))}
		</ul>
	);
}

export { ModelLineTip, TipRelationships };
