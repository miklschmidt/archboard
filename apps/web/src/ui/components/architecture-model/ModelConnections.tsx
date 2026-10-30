import { ModelSubjectStanding } from "#ui/components/architecture-model/ModelStateDetails.tsx";
import { type JSX } from "react";
import type { Model, projectModel } from "@archboard/board/content";

import { useModelPick } from "#ui/hooks/architecture-model/use-model-pick.ts";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";

type Connection = ReturnType<typeof projectModel>["connections"][number];
interface ModelConnectionsProps {
	model: Model;
	reference: Model | undefined;
	connections: readonly Connection[];
	selected: ReadonlySet<string>;
	onSelect: ModelSelection["select"];
}

/**
 * Keyboard users inspect the same projected lines as pointer users.
 * @param props The visible connections and selection action.
 * @returns Ordered connection choices without changing the layout.
 */
function ModelConnections(props: ModelConnectionsProps): JSX.Element | null {
	if (props.connections.length === 0) return null;
	return (
		<section className="mt-8 space-y-3" aria-label="Connections">
			<h3 className="text-title font-semibold">Connections</h3>
			<ul data-slot="model-connections" className="space-y-1">
				{props.connections.map((connection) => (
					<ConnectionChoice key={connection.line.id} {...props} connection={connection} />
				))}
			</ul>
		</section>
	);
}

/**
 * Keep the projected endpoints and kind visible before inspection.
 * @param props The line and its selection action.
 * @returns A keyboard-accessible line choice.
 */
function ConnectionChoice(props: ModelConnectionsProps & { connection: Connection }): JSX.Element {
	const { model, onSelect } = props;
	const { line, joins } = props.connection;
	const pick = useModelPick(line.id, onSelect);
	return (
		<li>
			<button
				type="button"
				data-connection-id={line.id}
				data-from={line.from}
				data-to={line.to}
				data-kind={line.kind}
				aria-pressed={props.selected.has(line.id)}
				{...pick}
				className="hover:bg-muted aria-pressed:bg-muted rounded-control w-full space-y-1 px-3 py-3 text-left"
			>
				<span className="text-control block">{lineEnds(line, model, props.reference)}</span>
				<span className="text-body text-muted-foreground block">{kindNames(model, joins)}</span>
			</button>
		</li>
	);
}

/**
 * A projected line keeps all authored relationships and their distinct labels.
 * @param props The selected line and complete model.
 * @param props.connection The line and every underlying relationship.
 * @param props.model The model that resolves authored endpoints.
 * @param props.reference The coherent base for removed endpoints.
 * @returns The complete relationship details in authored order.
 */
function ConnectionDetails(props: {
	connection: Connection;
	model: Model;
	reference: Model | undefined;
}): JSX.Element {
	const { connection, model } = props;
	const labels = [...new Set(connection.joins.flatMap((edge) => edge.label ?? []))];
	return (
		<article data-slot="model-connection-details" className="space-y-6">
			<h3 className="text-title font-semibold">
				{lineEnds(connection.line, model, props.reference)}
			</h3>
			<p data-slot="model-connection-kinds" className="text-body text-muted-foreground">
				{kindNames(model, connection.joins)}
			</p>
			<ul data-slot="model-connection-labels" className="text-body space-y-1">
				{labels.map((label) => (
					<li key={label}>{label}</li>
				))}
			</ul>
			<ol className="space-y-6">
				{connection.joins.map((edge) => (
					<li key={edge.id} data-relationship-id={edge.id} className="text-body space-y-2">
						<p>
							{moduleName(model, edge.from, props.reference)} →{" "}
							{moduleName(model, edge.to, props.reference)}
						</p>
						<p className="text-muted-foreground">
							{model.policy.relationshipKinds[edge.kind]?.name ?? edge.kind}
						</p>
						{edge.label && <p>{edge.label}</p>}
						{edge.description && <p className="whitespace-pre-wrap">{edge.description}</p>}
						<code className="text-control break-all">{edge.id}</code>
						<ModelSubjectStanding model={model} subject={edge.id} />
					</li>
				))}
			</ol>
		</article>
	);
}

/**
 * The two ends of a drawn line by name, with an arrow each way when it runs both ways.
 * @param line The line.
 * @param model The model that names its modules.
 * @param reference The coherent base for a removed end.
 * @returns Both names.
 */
function lineEnds(line: Connection["line"], model: Model, reference: Model | undefined): string {
	const mark = line.twoWay === true ? "↔" : "→";
	return `${moduleName(model, line.from, reference)} ${mark} ${moduleName(model, line.to, reference)}`;
}

/**
 * Every kind that a line joins, so a mixed line names what it mixes.
 * @param model The model that names its vocabulary.
 * @param joins The relationships behind the line.
 * @returns Their distinct kinds, in authored order.
 */
function kindNames(model: Model, joins: Connection["joins"]): string {
	const kinds = new Set(joins.map((edge) => edge.kind));
	return [...kinds].map((kind) => model.policy.relationshipKinds[kind]?.name ?? kind).join(", ");
}

/**
 * Resolve an authored identity without inventing a replacement endpoint.
 * @param model The complete model.
 * @param id The authored endpoint.
 * @param reference The coherent base for a removed endpoint.
 * @returns Its name, or the exact unresolved identity.
 */
function moduleName(model: Model, id: string, reference: Model | undefined): string {
	return (
		model.modules.find((module) => module.id === id)?.name ??
		reference?.modules.find((module) => module.id === id)?.name ??
		id
	);
}

export { ModelConnections, ConnectionDetails, kindNames, lineEnds, moduleName };
