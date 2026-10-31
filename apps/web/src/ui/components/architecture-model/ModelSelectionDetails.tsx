import { modelSubjects, subjectName } from "#ui/rules/architecture-model/flow-reading.ts";
import { useCallback, type ComponentProps, type JSX, type ReactNode } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { Model, projectModel } from "@archboard/board/content";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import { ModelSubjectStanding } from "#ui/components/architecture-model/ModelStateDetails.tsx";
import type { ModuleNavigation } from "#ui/components/architecture-model/ModuleNavigation.tsx";

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
 * Several selected subjects keep their canonical names together in the inspector.
 * @param props The selected identities and complete model.
 * @param props.model The coherent model.
 * @param props.reference The verified base for removed subjects.
 * @param props.selected Canonical selected identities.
 * @param props.title The heading, for a place that does not state one.
 * @param props.slot The represented reading context.
 * @returns Authored subjects without discarding the rest of the selection.
 */
function SelectedSubjects(props: {
	model: Model;
	reference: Model | undefined;
	selected: ReadonlySet<string>;
	title?: string | undefined;
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
			{props.title !== undefined && <h3 className="text-title font-semibold">{props.title}</h3>}
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

export { OpenModule, SelectedSubjects, scopeModel, type ModelSelectionDetailsProps };
