import type { JSX } from "react";
import { doorEndpoints, type Model, type projectModel } from "@archboard/board/content";
import { kindNames, moduleName } from "#ui/components/architecture-model/ModelConnections.tsx";
import { useModelPick } from "#ui/hooks/architecture-model/use-model-pick.ts";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";

type Projection = ReturnType<typeof projectModel>;
type Edge = Projection["connections"][number]["joins"][number];

interface ModelDoorEndpointsProps {
	door: string;
	model: Model;
	projection: Projection;
	onSelect: ModelSelection["select"];
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
		<section data-slot="model-door-endpoints" className="mt-8 space-y-4" aria-label="Endpoints">
			<h3 className="text-title font-semibold">Endpoints</h3>
			{groups.map(({ part, edges }) => (
				<section key={part} data-part-id={part} className="space-y-1">
					<h4 className="text-control font-semibold">
						{moduleName(model, part, projection.reference)}
					</h4>
					<ul className="space-y-1">
						{edges.map((edge) => (
							<Endpoint key={edge.id} {...props} edge={edge} />
						))}
					</ul>
				</section>
			))}
		</section>
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
	return (
		<li>
			<button
				type="button"
				data-relationship-id={edge.id}
				{...pick}
				className="hover:bg-muted rounded-control text-body w-full px-3 py-2 text-left"
			>
				{moduleName(model, edge.from, projection.reference)} →{" "}
				{moduleName(model, edge.to, projection.reference)}
				<span className="text-muted-foreground block">{kindNames(model, [edge])}</span>
			</button>
		</li>
	);
}

export { ModelDoorEndpoints };
