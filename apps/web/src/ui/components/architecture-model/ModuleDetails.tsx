import { AuthoredReference as Reference } from "#ui/components/architecture-model/AuthoredReference.tsx";
import { useCallback, type JSX, type ReactNode } from "react";
import type { ArchitectureModelRead } from "@archboard/board/model";
import type { relationshipsOf } from "#ui/rules/architecture-model/selected-subject.ts";

type Model = Extract<ArchitectureModelRead, { success: true }>;
type Module = Model["modules"][number];
type Relationships = ReturnType<typeof relationshipsOf>;
interface ModuleDetailsProps {
	module: Module;
	model: Model;
	children?: ReactNode;
	standing?: ReactNode;
	/** What the module and its parts send and receive in this reading. */
	relationships: Relationships;
	/** Select what a connection row names. */
	onSelect: (id: string) => void;
}

/**
 * Authored meaning from the selected module, without a second model copy.
 * @param props The module and the model that resolves its references.
 * @returns The module's responsibility, evidence, and connections.
 */
function ModuleDetails(props: ModuleDetailsProps): JSX.Element {
	const { module } = props;
	return (
		<article
			data-slot="module-details"
			data-module-id={module.id}
			className="max-w-prose space-y-8"
		>
			<ModuleIntroduction {...props} />
			{props.standing}
			<ModuleEvidence {...props} />
			{props.children}
			<Connections {...props} />
			<details className="text-body text-muted-foreground">
				<summary>Definition</summary>
				<dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
					<Fact name="Identity">
						<code>{module.id}</code>
					</Fact>
					<Fact name="File">
						<code>{module.file}</code>
					</Fact>
					<Fact name="Order">{module.order}</Fact>
				</dl>
			</details>
		</article>
	);
}

/**
 * The module's purpose precedes its supporting evidence.
 * @param props The module and its policy vocabulary.
 * @returns The authored introduction.
 */
function ModuleIntroduction(props: ModuleDetailsProps): JSX.Element {
	const { module, model } = props;
	return (
		<header className="space-y-3">
			<h3 className="title-figure [overflow-wrap:anywhere] uppercase">{module.name}</h3>
			<p className="text-control text-muted-foreground">
				{model.policy.nodeKinds[module.kind]?.name ?? module.kind}
			</p>
			{module.responsibility && (
				<p className="text-reading whitespace-pre-wrap">{module.responsibility}</p>
			)}
			{module.description && <p className="text-body whitespace-pre-wrap">{module.description}</p>}
		</header>
	);
}

/**
 * Evidence identifies where the module's explanation comes from.
 * @param props The module and its policy vocabulary.
 * @returns Authored groups, aliases, code, and document references.
 */
function ModuleEvidence(props: ModuleDetailsProps): JSX.Element {
	const { module, model } = props;
	const documents = new Map(
		module.documents?.map((reference) => [JSON.stringify(reference), reference]),
	);
	return (
		<dl className="text-body grid grid-cols-[auto_1fr] gap-x-6 gap-y-3">
			<ModuleParent {...props} />
			<Fact name="Groups">
				{module.groups?.map((id) => model.policy.groups[id]?.name ?? id).join(", ")}
			</Fact>
			<Fact name="Former names">{module.formerNames?.join(", ")}</Fact>
			{module.binding && (
				<Fact name="Code">
					<Reference reference={module.binding} />
				</Fact>
			)}
			{documents.size > 0 && (
				<Fact name="Documents">
					<ul className="space-y-2">
						{[...documents].map(([key, reference]) => (
							<li key={key}>
								<Reference reference={reference} />
							</li>
						))}
					</ul>
				</Fact>
			)}
		</dl>
	);
}

/**
 * The parent explains containment without changing the selected identity.
 * @param props The selected module and complete model.
 * @returns Its parent fact, or nothing for a root.
 */
function ModuleParent(props: ModuleDetailsProps): JSX.Element | null {
	const { module, model } = props;
	if (module.parent === undefined) return null;
	return (
		<Fact name="Part of">
			<span data-slot="module-parent" data-module-id={module.parent}>
				{moduleName(model, module.parent)}
			</span>
		</Fact>
	);
}

interface FactProps {
	name: string;
	children: ReactNode;
}

/**
 * A fact is absent when the author supplied no value.
 * @param props The label and authored value.
 * @returns One definition, or nothing.
 */
function Fact(props: FactProps): JSX.Element | null {
	const { name, children } = props;
	if (children === undefined || children === null || children === "") return null;
	return (
		<>
			<dt className="text-muted-foreground">{name}</dt>
			<dd className="min-w-0 break-words">{children}</dd>
		</>
	);
}

/**
 * Show every relationship in each direction, so that About agrees with the lines of the panel.
 * @param props The selected module and what it sends and receives.
 * @returns Both directions, resolved by stable identity.
 */
function Connections(props: ModuleDetailsProps): JSX.Element {
	const { module, model, relationships } = props;
	const directions = [
		{ name: "Outgoing connections", edges: relationships.outgoing },
		{ name: "Incoming connections", edges: relationships.incoming },
	];
	return (
		<div className="space-y-8">
			{directions.map(({ name, edges }) => (
				<section key={name} aria-label={name}>
					<h4 className="text-title mb-3 font-semibold">{name}</h4>
					{edges.length === 0 ? (
						<p className="text-body text-muted-foreground">None recorded.</p>
					) : (
						<ul className="divide-border divide-y">
							{edges.map((edge) => (
								<ConnectionRow
									key={edge.id}
									edge={edge}
									model={model}
									module={module.id}
									onSelect={props.onSelect}
								/>
							))}
						</ul>
					)}
				</section>
			))}
		</div>
	);
}

interface ConnectionRowProps {
	edge: Relationships["outgoing"][number];
	model: Model;
	/** The module that the row is listed under. */
	module: string;
	onSelect: (id: string) => void;
}

/**
 * Describe one connection and keep its evidence available on demand.
 * @param props The authored relationship and its other endpoint.
 * @returns One relationship row.
 */
function ConnectionRow(props: ConnectionRowProps): JSX.Element {
	const { edge, model, onSelect } = props;
	const select = useCallback((): void => onSelect(edge.id), [onSelect, edge.id]);
	return (
		<li className="space-y-2 py-3">
			<button
				type="button"
				data-relationship-id={edge.id}
				onClick={select}
				className="hover:bg-muted/60 rounded-control -mx-2 block w-[calc(100%+1rem)] px-2 py-1 text-left"
			>
				<span className="text-control block font-medium">{rowName(model, edge, props.module)}</span>
				<span className="text-body block">
					{edge.label ?? model.policy.relationshipKinds[edge.kind]?.name ?? edge.kind}
				</span>
			</button>
			{edge.description && (
				<p className="text-body text-muted-foreground whitespace-pre-wrap">{edge.description}</p>
			)}
			{edge.anchor && (
				<details className="text-body text-muted-foreground">
					<summary>Evidence</summary>
					<Reference reference={edge.anchor} />
				</details>
			)}
		</li>
	);
}

/**
 * What a row calls a relationship: the other end, or both ends when a part of the module holds it.
 * @param model The coherent model.
 * @param edge The relationship.
 * @param module The module that lists it.
 * @returns The row's name.
 */
function rowName(model: Model, edge: ConnectionRowProps["edge"], module: string): string {
	if (edge.from === module) return moduleName(model, edge.to);
	if (edge.to === module) return moduleName(model, edge.from);
	return `${moduleName(model, edge.from)} → ${moduleName(model, edge.to)}`;
}

/**
 * Resolve a visible label by identity, without substituting another subject.
 * @param model The coherent model.
 * @param id The exact endpoint.
 * @returns Its name or the unresolved identity.
 */
function moduleName(model: Model, id: string): string {
	return model.modules.find((module) => module.id === id)?.name ?? id;
}

export { ModuleDetails };
