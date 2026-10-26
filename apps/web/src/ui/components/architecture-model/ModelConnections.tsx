import { useCallback, type JSX } from "react";
import type { Model, projectModel } from "#ui/rules/architecture-model/projection.ts";

type Connection = ReturnType<typeof projectModel>["connections"][number];
interface ModelConnectionsProps {
	model: Model;
	connections: readonly Connection[];
	selected: string | null;
	onSelect: (id: string) => void;
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
				{props.connections.map(({ line }) => (
					<ConnectionChoice key={line.id} {...props} line={line} />
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
function ConnectionChoice(
	props: ModelConnectionsProps & { line: Connection["line"] },
): JSX.Element {
	const { line, model, onSelect } = props;
	const choose = useCallback((): void => onSelect(line.id), [onSelect, line.id]);
	return (
		<li>
			<button
				type="button"
				data-connection-id={line.id}
				data-from={line.from}
				data-to={line.to}
				data-kind={line.kind}
				aria-pressed={props.selected === line.id}
				onClick={choose}
				className="hover:bg-muted aria-pressed:bg-muted rounded-control w-full space-y-1 px-3 py-3 text-left"
			>
				<span className="text-control block">
					{moduleName(model, line.from)} → {moduleName(model, line.to)}
				</span>
				<span className="text-body text-muted-foreground block">
					{model.policy.relationshipKinds[line.kind]?.name ?? line.kind}
				</span>
			</button>
		</li>
	);
}

/**
 * A projected line keeps all authored relationships and their distinct labels.
 * @param props The selected line and complete model.
 * @param props.connection The line and every underlying relationship.
 * @param props.model The model that resolves authored endpoints.
 * @returns The complete relationship details in authored order.
 */
function ConnectionDetails(props: { connection: Connection; model: Model }): JSX.Element {
	const { connection, model } = props;
	const labels = [...new Set(connection.joins.flatMap((edge) => edge.label ?? []))];
	return (
		<article data-slot="model-connection-details" className="space-y-6">
			<h3 className="text-title font-semibold">
				{moduleName(model, connection.line.from)} → {moduleName(model, connection.line.to)}
			</h3>
			<ul data-slot="model-connection-labels" className="text-body space-y-1">
				{labels.map((label) => (
					<li key={label}>{label}</li>
				))}
			</ul>
			<ol className="space-y-6">
				{connection.joins.map((edge) => (
					<li key={edge.id} data-relationship-id={edge.id} className="text-body space-y-2">
						<p>
							{moduleName(model, edge.from)} → {moduleName(model, edge.to)}
						</p>
						<p className="text-muted-foreground">
							{model.policy.relationshipKinds[edge.kind]?.name ?? edge.kind}
						</p>
						{edge.label && <p>{edge.label}</p>}
						{edge.description && <p className="whitespace-pre-wrap">{edge.description}</p>}
						<code className="text-control break-all">{edge.id}</code>
					</li>
				))}
			</ol>
		</article>
	);
}

/**
 * Resolve an authored identity without inventing a replacement endpoint.
 * @param model The complete model.
 * @param id The authored endpoint.
 * @returns Its name, or the exact unresolved identity.
 */
function moduleName(model: Model, id: string): string {
	return model.modules.find((module) => module.id === id)?.name ?? id;
}

export { ModelConnections, ConnectionDetails };
