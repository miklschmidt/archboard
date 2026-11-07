import { AuthoredReference as Reference } from "#ui/architecture-drawing/model-reader/reading/components/AuthoredReference.tsx";
import type { JSX, ReactNode } from "react";
import type { ArchitectureModelRead } from "@archboard/model/contract";
import type { Connection } from "#ui/architecture-drawing/model-reader/rules/selected-subject.ts";

type Model = Extract<ArchitectureModelRead, { success: true }>;
type Module = Model["modules"][number];
interface ModuleDetailsProps {
	module: Module;
	model: Model;
}

/**
 * What About keeps of a module for a reader who asks for its identity.
 * @param props The module.
 * @param props.module The module.
 * @returns A closed note.
 */
function ModuleDefinition(props: { module: Module }): JSX.Element {
	const { module } = props;
	return (
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
 * What a relationship adds to its row: its longer account, and its evidence on demand.
 * @param props The authored relationship.
 * @param props.edge The relationship.
 * @returns The account, or nothing for a relationship with neither.
 */
function RelationshipEvidence(props: { edge: Connection["joins"][number] }): JSX.Element | null {
	const { edge } = props;
	if (!edge.description && !edge.anchor) return null;
	return (
		<div className="text-body text-muted-foreground space-y-2 pr-1 pb-2 pl-3">
			{edge.description && <p className="max-w-[72ch] whitespace-pre-wrap">{edge.description}</p>}
			{edge.anchor && (
				<details>
					<summary>Evidence</summary>
					<Reference reference={edge.anchor} />
				</details>
			)}
		</div>
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

export { ModuleDefinition, ModuleEvidence, RelationshipEvidence };
