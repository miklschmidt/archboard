import type { JSX } from "react";
import { doorEndpoints } from "@archboard/model/content";
import { moduleName } from "#ui/components/architecture-model/ModelConnections.tsx";
import { TipRelationships } from "#ui/components/architecture-model/ModelLineTip.tsx";
import { SubjectTipBox } from "#ui/components/canvas/SemanticSubjectTip.tsx";
import type { SubjectTip, TipTarget } from "#ui/clients/canvas/subjects/subject-tips.ts";
import { toggleOf } from "#ui/rules/architecture-model/expansion.ts";
import { isRemoved, moduleSource } from "#ui/rules/architecture-model/selected-subject.ts";
import type { AcceptedScene } from "#ui/rules/architecture-model/scene.ts";

type Projection = AcceptedScene["projection"];

/** How many relationships a tip shows. It takes no pointer, so About holds the rest. */
const TIP_ROWS = 8;

/** What a tip over a door reads. */
interface ModelDoorTipProps {
	readonly target: TipTarget;
	readonly scene: AcceptedScene;
	/** What any card's tip says of the door. */
	readonly said: SubjectTip | null;
	readonly appearance: SubjectTip["appearance"];
}

/**
 * The real endpoints behind a door, on the door.
 * @param props The door and the scene it stands in.
 * @returns The tip.
 */
function ModelDoorTip(props: ModelDoorTipProps): JSX.Element {
	const { target, scene } = props;
	const { model, projection } = scene;
	const { id } = target;
	return (
		<SubjectTipBox tip={doorSays(props)}>
			<DoorEndpoints
				door={id}
				model={moduleSource(model, projection, id)}
				projection={projection}
			/>
		</SubjectTipBox>
	);
}

/**
 * What a tip over a door says besides its endpoints: what any card's tip says, whether or not
 * that has anything to add, and what a click does.
 * @param props The door and the scene it stands in.
 * @returns What it says.
 */
function doorSays(props: ModelDoorTipProps): SubjectTip {
	const { target, scene, appearance, said } = props;
	const { model, projection } = scene;
	const { id } = target;
	return {
		title: moduleName(model, id, projection.reference),
		kind: appearance?.typeName,
		appearance,
		lead: said?.lead,
		body: said?.body,
		hint: doorHint(projection, id),
	};
}

/**
 * What a press on a door does.
 * @param projection The reading.
 * @param id The door.
 * @returns The hint, or nothing for a door that leads nowhere.
 */
function doorHint(projection: Projection, id: string): string | undefined {
	if (isRemoved(projection, id)) return undefined;
	return toggleOf(projection, id) === "expand"
		? "Click to open, plus to expand here"
		: "Click to open";
}

/**
 * The relationships a tip has room for, in drawn order, under the part that reaches them.
 * @param projection The reading.
 * @param door The door.
 * @returns The parts with their rows, and how many relationships are left out.
 */
function endpointRows(projection: Projection, door: string) {
	const groups = doorEndpoints(projection, door);
	let room = TIP_ROWS;
	const shown = groups.flatMap(({ part, edges }) => {
		const rows = edges.slice(0, room);
		room -= rows.length;
		return rows.length === 0 ? [] : [{ part, edges: rows }];
	});
	const total = groups.reduce((sum, { edges }) => sum + edges.length, 0);
	return { shown, more: total - TIP_ROWS };
}

/**
 * What a door's name stands for, by the part that reaches it.
 * @param props The door and its reading.
 * @param props.door The door.
 * @param props.model The model that defines the door.
 * @param props.projection The reading.
 * @returns The list.
 */
function DoorEndpoints(props: {
	readonly door: string;
	readonly model: AcceptedScene["model"];
	readonly projection: Projection;
}): JSX.Element {
	const { door, model, projection } = props;
	const { reference } = projection;
	const { shown, more } = endpointRows(projection, door);
	return (
		<div data-slot="model-door-tip" className="flex max-w-96 flex-col gap-2">
			{shown.map(({ part, edges }) => (
				<section key={part} data-slot="model-door-part" className="flex flex-col gap-1">
					<h4 className="text-body font-semibold">{moduleName(model, part, reference)}</h4>
					<TipRelationships edges={edges} model={model} reference={reference} />
				</section>
			))}
			{more > 0 && (
				<p data-slot="model-door-tip-more" className="text-body text-muted-foreground">
					{more} more
				</p>
			)}
		</div>
	);
}

export { ModelDoorTip };
