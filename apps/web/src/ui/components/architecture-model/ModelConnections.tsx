import { ModelPanel } from "#ui/components/architecture-model/ModelPanel.tsx";
import { ModelSubjectStanding } from "#ui/components/architecture-model/ModelStateDetails.tsx";
import type { JSX, ReactNode } from "react";
import { RiArrowLeftRightLine, RiArrowRightLine } from "@remixicon/react";
import type { Model, projectModel } from "@archboard/board/content";

import { useModelPick } from "#ui/hooks/architecture-model/use-model-pick.ts";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import { usePeekRow } from "#ui/hooks/architecture-model/use-peek-row.ts";

type Connection = ReturnType<typeof projectModel>["connections"][number];

/** What a panel row of a relationship reads. */
interface RelationshipRowProps {
	edge: Connection["joins"][number];
	model: Model;
	reference: Model | undefined;
	onSelect: ModelSelection["select"];
}

/**
 * One real relationship behind a joined line: its real ends, and it selects like any other.
 * @param props The relationship and its model.
 * @returns A row of the panel.
 */
function RelationshipRow(props: RelationshipRowProps): JSX.Element {
	const { edge, model, reference, onSelect } = props;
	const pick = useModelPick(edge.id, onSelect);
	const peek = usePeekRow(edge.id);
	return (
		<ModelPanel.Row
			data-relationship-id={edge.id}
			{...pick}
			{...peek}
			stacked
			name={`${moduleName(model, edge.from, reference)} → ${moduleName(model, edge.to, reference)}`}
			detail={edge.label ?? kindNames(model, [edge])}
		/>
	);
}

/**
 * One end of a relationship, which selects that module.
 * @param props The module and how to select it.
 * @param props.id The module.
 * @param props.title Which end it is.
 * @param props.name Its name.
 * @param props.onSelect The selection action.
 * @returns A row of the panel.
 */
function RelationshipEnd(props: {
	id: string;
	title: string;
	name: string;
	onSelect: ModelSelection["select"];
}): JSX.Element {
	const pick = useModelPick(props.id, props.onSelect);
	const peek = usePeekRow(props.id);
	return (
		<ModelPanel.Row
			data-end-id={props.id}
			{...pick}
			{...peek}
			name={props.name}
			detail={props.title}
		/>
	);
}

/** What the panel reads a selected line from. */
interface ConnectionSummaryProps {
	/** The line, with the selected relationships behind it. */
	connection: Connection;
	/** The model that resolves authored endpoints. */
	model: Model;
	/** The coherent base for removed endpoints. */
	reference: Model | undefined;
	onSelect: ModelSelection["select"];
	/** What the code says of it. */
	children?: ReactNode;
	/** What stands under the details: what touches the line. */
	context?: ReactNode;
}

/**
 * What the panel says of a selected line: a joined line lists every relationship with its real
 * ends, and one relationship says what it carries and selects either end.
 * @param props The selected line and complete model.
 * @returns The details, without the evidence that About holds.
 */
function ConnectionSummary(props: ConnectionSummaryProps): JSX.Element {
	const { connection, model, reference } = props;
	const { line, joins } = connection;
	const one = joins.length === 1;
	const ends = one ? joins[0] : line;
	return (
		<ModelPanel.Body slot="model-connection-details">
			<ModelPanel.Head title={lineEnds(ends, model, reference)}>
				<span data-slot="model-connection-kinds">{kindNames(model, joins)}</span>
			</ModelPanel.Head>
			{props.children}
			{one ? <OneRelationship {...props} edge={joins[0]} /> : <JoinedRelationships {...props} />}
			{props.context}
		</ModelPanel.Body>
	);
}

/**
 * Every relationship that a joined line stands for.
 * @param props The selected line and complete model.
 * @returns The list.
 */
function JoinedRelationships(props: ConnectionSummaryProps): JSX.Element {
	const { model, reference, onSelect } = props;
	const { joins } = props.connection;
	return (
		<ModelPanel.Section title="Relationships" count={joins.length} slot="model-connection-joins">
			<ModelPanel.Rows items={joins}>
				{(edge) => (
					<RelationshipRow
						key={edge.id}
						edge={edge}
						model={model}
						reference={reference}
						onSelect={onSelect}
					/>
				)}
			</ModelPanel.Rows>
		</ModelPanel.Section>
	);
}

/**
 * What one relationship carries, and its two ends.
 * @param props The relationship and complete model.
 * @returns Its summary.
 */
function OneRelationship(
	props: ConnectionSummaryProps & { readonly edge: Connection["joins"][number] },
): JSX.Element {
	const { edge, model, reference, onSelect } = props;
	return (
		<>
			{edge.label && <p className="text-body">{edge.label}</p>}
			<ModelSubjectStanding model={model} subject={edge.id} reference={reference} />
			<ModelPanel.Section title="Ends" slot="model-connection-ends">
				<RelationshipEnd
					id={edge.from}
					title="From"
					name={moduleName(model, edge.from, reference)}
					onSelect={onSelect}
				/>
				<RelationshipEnd
					id={edge.to}
					title="To"
					name={moduleName(model, edge.to, reference)}
					onSelect={onSelect}
				/>
			</ModelPanel.Section>
		</>
	);
}

/**
 * The two ends of a line as a title, with the mark the line draws between them.
 * @param props The line and its model.
 * @param props.line The line.
 * @param props.model The model that names its modules.
 * @param props.reference The coherent base for a removed end.
 * @returns The title's words.
 */
function LineTitle(props: {
	line: Connection["line"];
	model: Model;
	reference: Model | undefined;
}): JSX.Element {
	const { line, model, reference } = props;
	return (
		<span aria-label={lineEnds(line, model, reference)}>
			{moduleName(model, line.from, reference)}{" "}
			<LineArrow line={line} className="inline size-[0.7em] align-baseline" />{" "}
			{moduleName(model, line.to, reference)}
		</span>
	);
}

/**
 * A projected line keeps every authored relationship with all that it says. The page's title says
 * the ends, the kind and the label of a line of one relationship, so here it adds the rest.
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
	const { connection, model, reference } = props;
	const several = connection.joins.length > 1;
	return (
		<article data-slot="model-connection-details" className="space-y-8">
			<ol className="space-y-6">
				{connection.joins.map((edge) => (
					<li key={edge.id} data-relationship-id={edge.id} className="text-body space-y-2">
						{several && (
							<>
								<p className="text-control">{lineEnds(edge, model, reference)}</p>
								<p className="text-muted-foreground">
									{model.policy.relationshipKinds[edge.kind]?.name ?? edge.kind}
								</p>
								{edge.label && <p>{edge.label}</p>}
							</>
						)}
						{edge.description && (
							<p className="text-control max-w-[72ch] font-normal whitespace-pre-wrap">
								{edge.description}
							</p>
						)}
						<code className="text-technical text-muted-foreground font-mono break-all">
							{edge.id}
						</code>
						<ModelSubjectStanding model={model} subject={edge.id} reference={reference} />
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
 * The mark between the two ends of a drawn line.
 * @param props The line and how the mark stands among its words.
 * @param props.line The line.
 * @param props.className Where it stands.
 * @returns An arrow each way when it runs both ways.
 */
function LineArrow(props: { line: Connection["line"]; className: string }): JSX.Element {
	const Arrow = props.line.twoWay === true ? RiArrowLeftRightLine : RiArrowRightLine;
	return <Arrow aria-hidden="true" className={props.className} />;
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

export { ConnectionDetails, ConnectionSummary, LineTitle, kindNames, lineEnds, moduleName };
