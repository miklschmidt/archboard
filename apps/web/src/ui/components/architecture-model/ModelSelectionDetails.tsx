import { ModelHistory } from "#ui/components/architecture-model/ModelHistory.tsx";
import { modelSubjects, subjectName } from "#ui/rules/architecture-model/flow-reading.ts";
import { useCallback, type ComponentProps, type JSX, type ReactNode } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { Model, projectModel } from "@archboard/board/content";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import { ModelSubjectStanding } from "#ui/components/architecture-model/ModelStateDetails.tsx";
import { ModelFlowDetails } from "#ui/components/architecture-model/ModelFlowDetails.tsx";
import { ModuleDetails } from "#ui/components/architecture-model/ModuleDetails.tsx";
import { ModuleNavigation } from "#ui/components/architecture-model/ModuleNavigation.tsx";
import { ModelCollectionDetails } from "#ui/components/architecture-model/ModelCollectionDetails.tsx";
import { ConnectionDetails } from "#ui/components/architecture-model/ModelConnections.tsx";
import { ModelInterface } from "#ui/components/architecture-model/ModelInterface.tsx";

interface ModelSelectionDetailsProps {
	evidence?: ReactNode;
	vault: string;
	paneId: string;
	onCodeTargetNotice: ComponentProps<typeof ModuleNavigation>["onNotice"];
	model: Model;
	scope: string | null;
	projection: ReturnType<typeof projectModel>;
	selection: ModelSelection;
	onOpen: (scope: string | null) => void;
	onRevealFlow: (id: string) => void;
}

/**
 * Inspect canonical selection independently from what the canvas currently draws.
 * @param props The selected subjects and coherent reading.
 * @returns One module, an aggregate, multiple subjects, or the scope introduction.
 */
function ModelSelectionDetails(props: ModelSelectionDetailsProps): JSX.Element {
	const { ids } = props.selection;
	const only = selectedIdentity(ids);
	const module = inspectedModule(props, only);
	if (module !== undefined) return <SelectedModule {...props} module={module} />;
	const collection = inspectedCollection(props, only);
	if (collection !== undefined)
		return <ModelCollectionDetails {...collection} onOpenFlow={props.onRevealFlow} />;
	if (props.projection.flow !== null)
		return (
			<ModelFlowDetails
				model={props.model}
				flow={props.projection.flow}
				reference={props.projection.reference}
				selection={props.selection}
			/>
		);
	const connection = inspectedConnection(props);
	if (connection !== undefined)
		return (
			<ConnectionDetails
				connection={connection}
				model={props.model}
				reference={props.projection.reference}
			/>
		);
	if (ids.size > 0)
		return (
			<SelectedSubjects
				model={props.model}
				reference={props.projection.reference}
				selected={ids}
				title="Selected subjects"
				slot="model-selected-subjects"
			/>
		);
	return <UnselectedDetails {...props} />;
}

/**
 * An explicit relationship can select one member of a projected aggregate.
 * @param props The authored selection and projected connections.
 * @returns Only the selected relationships when one connection contains them all.
 */
function inspectedConnection(props: ModelSelectionDetailsProps) {
	const { ids } = props.selection;
	if (ids.size === 0) return undefined;
	const connection = props.projection.allConnections.find(({ joins }) =>
		[...ids].every((id) => joins.some((edge) => edge.id === id)),
	);
	if (connection === undefined) return undefined;
	const [first, ...rest] = connection.joins.filter((edge) => ids.has(edge.id));
	return first === undefined ? undefined : { ...connection, joins: [first, ...rest] as const };
}

/**
 * Only a single authored identity opens its dedicated inspector.
 * @param selected The temporary selected identities.
 * @returns The one subject, or absence for empty and mixed selections.
 */
function selectedIdentity(selected: ReadonlySet<string>): string | undefined {
	return selected.size === 1 ? [...selected][0] : undefined;
}

/**
 * Collections use qualified subject identities while retaining their local authored identity.
 * @param props The selected reading and coherent comparison reference.
 * @param id The exact inspected identity.
 * @returns The collection and the state that owns its definition.
 */
function inspectedCollection(props: ModelSelectionDetailsProps, id: string | undefined) {
	if (props.projection.flow !== null) return undefined;
	for (const model of [props.model, props.projection.reference]) {
		if (model === undefined) continue;
		const collection = model.collections.find((entry) => `${model.manifest.id}#${entry.id}` === id);
		if (collection !== undefined) return { model, collection };
	}
	return undefined;
}

/**
 * With no transient selection, explain the captured focus or the open scope.
 * @param props The current architectural reading.
 * @returns Focused identities or the complete scope introduction and interface.
 */
function UnselectedDetails(props: ModelSelectionDetailsProps): JSX.Element {
	if (props.projection.flow !== null)
		return (
			<ModelFlowDetails
				model={props.model}
				flow={props.projection.flow}
				reference={props.projection.reference}
				selection={props.selection}
			/>
		);
	if (props.projection.focused !== null)
		return (
			<SelectedSubjects
				model={props.model}
				reference={props.projection.reference}
				selected={props.projection.focused}
				title="Focused subjects"
				slot="model-focused-subjects"
			/>
		);
	return (
		<>
			<ScopeIntroduction model={scopeModel(props)} scope={props.scope} />
			<ModelSubjectStanding model={props.model} subject={props.scope} />
			<ModelInterface
				model={props.model}
				projection={props.projection}
				onSelect={props.selection.select}
			/>
		</>
	);
}

/**
 * A comparison can inspect a removed definition only from its verified reference.
 * @param props The selected state and optional coherent reference.
 * @param id The inspected identity.
 * @returns Its selected definition, otherwise the explicit reference definition.
 */
function inspectedModule(props: ModelSelectionDetailsProps, id: string | undefined) {
	return (
		props.model.modules.find((entry) => entry.id === id) ??
		props.projection.reference?.modules.find((entry) => entry.id === id)
	);
}

/**
 * A removed scope explains its reference definition without changing selected architecture.
 * @param props The requested scope and coherent readings.
 * @returns The model that actually owns the scope definition.
 */
function scopeModel(props: ModelSelectionDetailsProps): Model {
	if (props.scope === null) return props.model;
	if (props.model.modules.some((entry) => entry.id === props.scope)) return props.model;
	return props.projection.reference ?? props.model;
}

/**
 * Removed module details stay read-only in their reference state.
 * @param props The selected module and verified comparison.
 * @returns Change details followed by the appropriate authored definition.
 */
function SelectedModule(
	props: ModelSelectionDetailsProps & { module: Model["modules"][number] },
): JSX.Element {
	const removed = props.projection.standing?.[props.module.id] === "removed";
	const source =
		removed && props.projection.reference !== undefined ? props.projection.reference : props.model;
	return (
		<SelectedModuleDetails
			{...props}
			model={source}
			comparisonModel={props.model}
			removed={removed}
		/>
	);
}

/**
 * Source actions sit beside the module's authored evidence in every inspection mode.
 * @param props The actual selected or removed module and its owning reading.
 * @returns Authored details with the shared navigation controls.
 */
function SelectedModuleDetails(
	props: ModelSelectionDetailsProps & {
		module: Model["modules"][number];
		comparisonModel: Model;
		removed: boolean;
	},
): JSX.Element {
	return (
		<ModuleDetails
			module={props.module}
			model={props.model}
			standing={
				<>
					{props.evidence}
					<ModelSubjectStanding model={props.comparisonModel} subject={props.module.id} />
				</>
			}
		>
			{!props.removed && props.module.id !== props.scope && (
				<OpenModule id={props.module.id} onOpen={props.onOpen} />
			)}
			{props.module.id === props.scope && (
				<ModelInterface
					model={props.model}
					projection={props.projection}
					onSelect={props.selection.select}
				/>
			)}
			<ModuleNavigation
				paneId={props.paneId}
				vault={props.vault}
				model={props.model}
				module={props.module}
				onNotice={props.onCodeTargetNotice}
			/>
			<ModelHistory
				vault={props.vault}
				model={props.model}
				module={props.module}
				onSelect={props.selection.select}
			/>
		</ModuleDetails>
	);
}

/**
 * Several selected subjects keep their canonical names together in the inspector.
 * @param props The selected identities and complete model.
 * @param props.model The coherent model.
 * @param props.reference The verified base for removed subjects.
 * @param props.selected Canonical selected identities.
 * @param props.title The selection or focus heading.
 * @param props.slot The represented reading context.
 * @returns Authored subjects without discarding the rest of the selection.
 */
function SelectedSubjects(props: {
	model: Model;
	reference: Model | undefined;
	selected: ReadonlySet<string>;
	title: string;
	slot: "model-selected-subjects" | "model-focused-subjects";
}): JSX.Element {
	const fromBase = props.reference === undefined ? [] : modelSubjects(props.reference);
	const subjects = [
		...new Map(
			[...fromBase, ...modelSubjects(props.model)].map((subject) => [subject.id, subject]),
		).values(),
	].filter((subject) => props.selected.has(subject.id));
	return (
		<section className="space-y-4">
			<h3 className="text-title font-semibold">{props.title}</h3>
			{subjects.length < props.selected.size && (
				<output data-slot="module-missing-selection" className="text-body block">
					{props.selected.size - subjects.length} selected subjects are unavailable in this reading.
				</output>
			)}
			<ul data-slot={props.slot} className="text-body space-y-3">
				{subjects.map((subject) => (
					<li key={subject.id} data-subject-id={subject.id}>
						{subjectName(subject)}
						<ModelSubjectStanding model={props.model} subject={subject.id} />
					</li>
				))}
			</ul>
		</section>
	);
}

/**
 * Opening a module makes that module the subject of the explanation.
 * @param props The coherent model and current scope.
 * @param props.model The complete reading.
 * @param props.scope The open module, or repository roots.
 * @returns Authored module meaning or the repository introduction.
 */
function ScopeIntroduction(props: { model: Model; scope: string | null }): JSX.Element {
	const module = props.model.modules.find((entry) => entry.id === props.scope);
	if (module === undefined) return <ModelIntroduction model={props.model} />;
	return (
		<section data-slot="model-scope-introduction" className="space-y-3">
			<h3 className="text-figure font-display uppercase">{module.name}</h3>
			{module.responsibility && <p className="text-reading">{module.responsibility}</p>}
			{module.description && <p className="text-body whitespace-pre-wrap">{module.description}</p>}
		</section>
	);
}

/**
 * The model introduces itself until the reader selects a module.
 * @param props The coherent model.
 * @returns Its authored model name and exploration action.
 */
function ModelIntroduction(props: Pick<ModelSelectionDetailsProps, "model">): JSX.Element {
	const { model } = props;
	return (
		<div className="max-w-prose space-y-4">
			<h3 className="text-figure font-display uppercase">{model.manifest.name}</h3>
			{model.roots.length > 0 && (
				<p className="text-body text-muted-foreground">
					Select a module to read its responsibility and connections.
				</p>
			)}
		</div>
	);
}

/**
 * Opening changes scope while preserving the selected module identity.
 * @param props The module destination and navigation action.
 * @param props.id The existing module identity.
 * @param props.onOpen The scope navigation action.
 * @returns A keyboard-accessible opening action.
 */
function OpenModule(props: { id: string; onOpen: (scope: string | null) => void }): JSX.Element {
	const { id, onOpen } = props;
	const open = useCallback((): void => onOpen(id), [id, onOpen]);
	return (
		<Button variant="outline" data-slot="module-open" className="mb-6" onClick={open}>
			Open module
		</Button>
	);
}

export { ModelSelectionDetails, UnselectedDetails as ModelScopeDetails };
