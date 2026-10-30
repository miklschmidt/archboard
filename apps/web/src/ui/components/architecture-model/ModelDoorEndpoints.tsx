import type { JSX } from "react";
import { doorEndpoints, type Model, type projectModel } from "@archboard/board/content";
import { kindNames, moduleName } from "#ui/components/architecture-model/ModelConnections.tsx";
import { ModelPanel } from "#ui/components/architecture-model/ModelPanel.tsx";
import { useModelPick } from "#ui/hooks/architecture-model/use-model-pick.ts";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import { usePeekRow } from "#ui/hooks/architecture-model/use-peek-row.ts";

type Projection = ReturnType<typeof projectModel>;
type Edge = Projection["listed"][number]["joins"][number];

interface ModelDoorEndpointsProps {
	door: string;
	model: Model;
	projection: Projection;
	onSelect: ModelSelection["select"];
	/** Whether each list shows whole, where nothing limits the room. */
	whole?: boolean;
}

/**
 * A door lists the real endpoints that its name stands for.
 * @param props The selected module and the reading it stands in.
 * @returns Its relationships grouped by the child that reaches them, or nothing for another module.
 */
function ModelDoorEndpoints(props: ModelDoorEndpointsProps): JSX.Element | null {
	const { door, model, projection } = props;
	const groups = doorEndpoints(projection, door);
	if (groups.length === 0) return null;
	return (
		<div data-slot="model-door-endpoints" className="flex flex-col gap-4">
			{groups.map(({ part, edges }) => (
				<ModelPanel.Section
					key={part}
					title={moduleName(model, part, projection.reference)}
					count={edges.length}
					slot="model-door-part"
				>
					<ModelPanel.Rows items={edges} whole={props.whole}>
						{(edge) => <Endpoint key={edge.id} {...props} edge={edge} />}
					</ModelPanel.Rows>
				</ModelPanel.Section>
			))}
		</div>
	);
}

/**
 * One real relationship behind a door, which selects like any other.
 * @param props The relationship and its model.
 * @returns A keyboard-accessible row.
 */
function Endpoint(props: ModelDoorEndpointsProps & { edge: Edge }): JSX.Element {
	const { edge, model, projection, onSelect } = props;
	const pick = useModelPick(edge.id, onSelect);
	const peek = usePeekRow(edge.id);
	return (
		<ModelPanel.Row
			data-relationship-id={edge.id}
			{...pick}
			{...peek}
			stacked
			name={`${moduleName(model, edge.from, projection.reference)} → ${moduleName(model, edge.to, projection.reference)}`}
			detail={edge.label ?? kindNames(model, [edge])}
		/>
	);
}

export { ModelDoorEndpoints };
