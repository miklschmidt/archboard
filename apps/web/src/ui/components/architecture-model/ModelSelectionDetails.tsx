import { ModelHistory } from "#ui/components/architecture-model/ModelHistory.tsx";
import { modelSubjects, subjectName } from "#ui/rules/architecture-model/flow-reading.ts";
import {
	isRemoved,
	moduleSource,
	relationshipsOf,
	selectedSubject,
} from "#ui/rules/architecture-model/selected-subject.ts";
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
import { ModelDoorEndpoints } from "#ui/components/architecture-model/ModelDoorEndpoints.tsx";

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
 * @returns One module, an aggregate, or multiple subjects.
 */
function ModelSelectionDetails(props: ModelSelectionDetailsProps): JSX.Element | null {
	const { ids } = props.selection;
	const subject = selectedSubject({ ...props, ids });
	if (subject.kind === "module") return <SelectedModule {...props} module={subject.module} />;
	if (subject.kind === "collection")
		return <ModelCollectionDetails {...subject} onOpenFlow={props.onRevealFlow} />;
	if (subject.kind === "flow")
		return (
			<ModelFlowDetails
				model={props.model}
				flow={subject.flow}
				reference={props.projection.reference}
				selection={props.selection}
			/>
		);
	if (subject.kind === "connection")
		return (
			<ConnectionDetails
				connection={subject.connection}
				model={props.model}
				reference={props.projection.reference}
			>
				{props.evidence}
			</ConnectionDetails>
		);
	if (subject.kind === "subjects")
		return (
			<SelectedSubjects
				model={props.model}
				reference={props.projection.reference}
				selected={ids}
				title="Selected subjects"
				slot="model-selected-subjects"
			/>
		);
	return null;
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
	const { module, model, projection } = props;
	return (
		<SelectedModuleDetails
			{...props}
			model={moduleSource(model, projection, module.id)}
			comparisonModel={model}
			removed={isRemoved(projection, module.id)}
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
			relationships={relationshipsOf(props.model, props.projection, props.module.id)}
			onSelect={props.selection.select}
			standing={
				<>
					{props.evidence}
					<ModelSubjectStanding model={props.comparisonModel} subject={props.module.id} />
				</>
			}
		>
			{props.module.id === props.scope && (
				<ModelInterface
					model={props.model}
					projection={props.projection}
					onSelect={props.selection.select}
				/>
			)}
			<ModelDoorEndpoints
				door={props.module.id}
				model={props.model}
				projection={props.projection}
				onSelect={props.selection.select}
				whole
			/>
			<div className="flex flex-wrap items-start gap-2">
				{!props.removed && props.module.id !== props.scope && (
					<OpenModule id={props.module.id} onOpen={props.onOpen} />
				)}
				<ModuleNavigation
					paneId={props.paneId}
					vault={props.vault}
					model={props.model}
					module={props.module}
					onNotice={props.onCodeTargetNotice}
				/>
			</div>
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
			<h3 className="title-figure [overflow-wrap:anywhere] uppercase">{module.name}</h3>
			{module.responsibility && (
				<p className="text-reading max-w-[68ch] text-pretty">{module.responsibility}</p>
			)}
			{module.description && (
				<p className="text-body max-w-[68ch] whitespace-pre-wrap">{module.description}</p>
			)}
		</section>
	);
}

/**
 * The model names itself where no module is open.
 * @param props The coherent model.
 * @returns Its authored model name.
 */
function ModelIntroduction(props: Pick<ModelSelectionDetailsProps, "model">): JSX.Element {
	return <h3 className="title-figure uppercase">{props.model.manifest.name}</h3>;
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
		<Button data-slot="module-open" onClick={open}>
			Open module
		</Button>
	);
}

export {
	ModelSelectionDetails,
	OpenModule,
	ScopeIntroduction,
	SelectedSubjects,
	scopeModel,
	type ModelSelectionDetailsProps,
};
