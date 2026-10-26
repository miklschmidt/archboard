import type { JSX, ReactNode } from "react";
import type { ArchitectureModelRead } from "@archboard/board/model";

type Model = Extract<ArchitectureModelRead, { success: true }>;
type Module = Model["modules"][number];
interface ModuleDetailsProps {
	module: Module;
	model: Model;
	children?: ReactNode;
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
			<h3 className="text-figure font-display uppercase">{module.name}</h3>
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

interface ReferenceProps {
	reference: NonNullable<Module["binding"]>;
}

/**
 * A reference remains text until code navigation is delivered separately.
 * @param props An authored binding or document reference.
 * @returns Its repository, path, and any pinned revision.
 */
function Reference(props: ReferenceProps): JSX.Element {
	const { reference } = props;
	const revision = reference.commit ?? reference.branch;
	return (
		<span className="block space-y-1">
			<span className="text-muted-foreground block break-all">{reference.repo}</span>
			<code className="block break-all">
				{reference.path}
				{reference.symbol && <> · {reference.symbol}</>}
			</code>
			{revision && <code className="text-muted-foreground block break-all">{revision}</code>}
		</span>
	);
}

/**
 * Show authored outgoing connections and derived incoming connections.
 * @param props The selected module and its complete model.
 * @returns Both directions, resolved by stable identity.
 */
function Connections(props: ModuleDetailsProps): JSX.Element {
	const { module, model } = props;
	const directions = [
		{
			name: "Outgoing connections",
			edges: model.relationships.filter((edge) => edge.from === module.id),
			outgoing: true,
		},
		{
			name: "Incoming connections",
			edges: model.relationships.filter((edge) => edge.to === module.id),
			outgoing: false,
		},
	];
	return (
		<div className="space-y-8">
			{directions.map(({ name, edges, outgoing }) => (
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
									endpoint={outgoing ? edge.to : edge.from}
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
	edge: Model["relationships"][number];
	model: Model;
	endpoint: string;
}

/**
 * Describe one connection and keep its evidence available on demand.
 * @param props The authored relationship and its other endpoint.
 * @returns One relationship row.
 */
function ConnectionRow(props: ConnectionRowProps): JSX.Element {
	const { edge, model, endpoint } = props;
	return (
		<li className="space-y-2 py-3">
			<p className="text-control font-medium">{moduleName(model, endpoint)}</p>
			<p className="text-body">
				{edge.label ?? model.policy.relationshipKinds[edge.kind]?.name ?? edge.kind}
			</p>
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
 * Resolve a visible label by identity, without substituting another subject.
 * @param model The coherent model.
 * @param id The exact endpoint.
 * @returns Its name or the unresolved identity.
 */
function moduleName(model: Model, id: string): string {
	return model.modules.find((module) => module.id === id)?.name ?? id;
}

export { ModuleDetails };
