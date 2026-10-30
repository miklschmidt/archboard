import { useMemo, type JSX } from "react";
import { Tooltip } from "@archboard/ui-kit/components";
import type { Model, projectModel } from "@archboard/board/content";
import { kindNames, moduleName } from "#ui/components/architecture-model/ModelConnections.tsx";
import {
	tipAnchor,
	type TipTarget,
} from "#ui/clients/semantic-board-canvas/subjects/subject-tips.ts";

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
	const part = target?.part === "line" ? target.anchor : null;
	const anchor = useMemo(() => (part === null ? null : tipAnchor(part)), [part]);
	const connection = projection.connections.find(({ line }) => line.id === target?.id);
	if (anchor === null || connection === undefined || connection.joins.length === 1) return null;
	return (
		<Tooltip open>
			<Tooltip.Content
				anchor={anchor}
				sideOffset={10}
				look="card"
				data-slot="model-line-tip"
				className="w-max max-w-96 flex-col items-stretch gap-2"
			>
				<p className="text-body font-semibold">
					{ends(connection.line, model, projection.reference)}
				</p>
				<p className="text-technical text-muted-foreground">{kindNames(model, connection.joins)}</p>
				<ul className="text-body space-y-1">
					{connection.joins.map((edge) => (
						<li key={edge.id}>
							{edge.label === undefined ? "" : `${edge.label}: `}
							{ends(edge, model, projection.reference)}
						</li>
					))}
				</ul>
			</Tooltip.Content>
		</Tooltip>
	);
}

/**
 * The two ends of a line or a relationship, by name.
 * @param line The line.
 * @param line.from Where it starts.
 * @param line.to Where it ends.
 * @param model The model that names its modules.
 * @param reference The comparison base, for a removed module.
 * @returns Both names.
 */
function ends(line: { from: string; to: string }, model: Model, reference: Model | undefined) {
	return `${moduleName(model, line.from, reference)} → ${moduleName(model, line.to, reference)}`;
}

export { ModelLineTip };
