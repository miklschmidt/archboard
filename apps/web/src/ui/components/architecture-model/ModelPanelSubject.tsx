import type { JSX, ReactNode } from "react";
import type { Model } from "@archboard/board/content";
import {
	ConnectionSummary,
	kindNames,
	moduleName,
} from "#ui/components/architecture-model/ModelConnections.tsx";
import { ModelCodeDetails } from "#ui/components/architecture-model/ModelCodeFindings.tsx";
import { ModelCollectionDetails } from "#ui/components/architecture-model/ModelCollectionDetails.tsx";
import { ModelDoorEndpoints } from "#ui/components/architecture-model/ModelDoorEndpoints.tsx";
import { ModelFlowDetails } from "#ui/components/architecture-model/ModelFlowDetails.tsx";
import { ModelHiddenSelection } from "#ui/components/architecture-model/ModelHiddenSelection.tsx";
import { ModelPanel } from "#ui/components/architecture-model/ModelPanel.tsx";
import {
	OpenModule,
	SelectedSubjects,
	type ModelSelectionDetailsProps,
} from "#ui/components/architecture-model/ModelSelectionDetails.tsx";
import { ModelSubjectStanding } from "#ui/components/architecture-model/ModelStateDetails.tsx";
import { ModuleOpenCode } from "#ui/components/architecture-model/ModuleNavigation.tsx";
import type { useModelCodeFindings } from "#ui/hooks/architecture-model/use-model-code-findings.ts";
import { useModelPick } from "#ui/hooks/architecture-model/use-model-pick.ts";
import { usePeekRow } from "#ui/hooks/architecture-model/use-peek-row.ts";
import {
	isRemoved,
	linesOf,
	moduleSource,
	selectedSubject,
	type Connection,
} from "#ui/rules/architecture-model/selected-subject.ts";

/** Inputs for what the panel says of a selection. */
interface ModelPanelSubjectProps extends ModelSelectionDetailsProps {
	readonly code: ReturnType<typeof useModelCodeFindings>["reading"];
	/** The code path of a module, when it has one. */
	readonly pathOf: (id: string) => string | undefined;
	readonly onReveal: () => void;
	/** What can be done with any selection. */
	readonly children: ReactNode;
}

/**
 * What the panel says of a selection, and what can be done with it.
 * @param props The selection and its reading.
 * @returns The body and the foot.
 */
function ModelPanelSubject(props: ModelPanelSubjectProps): JSX.Element {
	const subject = selectedSubject({ ...props, ids: props.selection.ids });
	const module = subject.kind === "module" ? subject.module : undefined;
	return (
		<>
			{module === undefined ? (
				<OtherSubject {...props} />
			) : (
				<ModuleSubject {...props} module={module} />
			)}
			<div className="px-4 pb-4 empty:hidden">
				<ModelHiddenSelection
					projection={props.projection}
					selected={props.selection.ids}
					oneLine={subject.kind === "connection"}
					onReveal={props.onReveal}
					onRevealFlow={props.onRevealFlow}
				/>
			</div>
			<ModelPanel.Foot>
				{module !== undefined && <ModuleActions {...props} module={module} />}
				{props.children}
			</ModelPanel.Foot>
		</>
	);
}

/**
 * What the panel says of anything but one module.
 * @param props The selection and its reading.
 * @returns The body.
 */
function OtherSubject(props: ModelPanelSubjectProps): JSX.Element {
	const { model, projection, selection } = props;
	const { ids, select } = selection;
	const subject = selectedSubject({ ...props, ids });
	if (subject.kind === "connection")
		return (
			<ConnectionSummary
				connection={subject.connection}
				model={model}
				reference={projection.reference}
				onSelect={select}
			/>
		);
	return (
		<ModelPanel.Body slot="model-panel-other">
			{subject.kind === "collection" && (
				<ModelCollectionDetails {...subject} onOpenFlow={props.onRevealFlow} />
			)}
			{subject.kind === "flow" && (
				<ModelFlowDetails
					model={model}
					flow={subject.flow}
					reference={projection.reference}
					selection={selection}
					brief
				/>
			)}
			{subject.kind === "subjects" && (
				<SelectedSubjects
					model={model}
					reference={projection.reference}
					selected={ids}
					title="Selected subjects"
					slot="model-selected-subjects"
				/>
			)}
		</ModelPanel.Body>
	);
}

/**
 * What the panel says of one module: what it is, how it stands, and what it touches.
 * @param props The module and its reading.
 * @returns The body.
 */
function ModuleSubject(
	props: ModelPanelSubjectProps & { readonly module: Model["modules"][number] },
): JSX.Element {
	const { module, model, projection, selection } = props;
	const source = moduleSource(model, projection, module.id);
	const door = projection.context.some((entry) => entry.id === module.id);
	return (
		<ModelPanel.Body slot="module-details" moduleId={module.id}>
			<ModuleHead {...props} model={source} />
			<ModelCodeDetails reading={props.code} selected={selection.ids} scope={props.scope} brief />
			<ModelSubjectStanding model={model} subject={module.id} />
			<ModelDoorEndpoints
				door={module.id}
				model={source}
				projection={projection}
				onSelect={selection.select}
			/>
			{!door && <ModuleLines {...props} model={source} id={module.id} />}
		</ModelPanel.Body>
	);
}

/**
 * What a module is: its name, its kind and code path, and its responsibility.
 * @param props The module and the model that defines it.
 * @returns The head.
 */
function ModuleHead(
	props: ModelPanelSubjectProps & { readonly module: Model["modules"][number] },
): JSX.Element {
	const { module, model } = props;
	const path = props.pathOf(module.id);
	return (
		<>
			<ModelPanel.Head title={module.name}>
				<span>{model.policy.nodeKinds[module.kind]?.name ?? module.kind}</span>
				{path !== undefined && (
					<code className="text-technical min-w-0 font-mono break-all">{path}</code>
				)}
			</ModelPanel.Head>
			{module.responsibility && (
				<p className="text-control font-normal whitespace-pre-wrap">{module.responsibility}</p>
			)}
		</>
	);
}

/**
 * Every line of the reading that touches a module, as rows that select it.
 * @param props The module and its reading.
 * @returns What it sends to and what it receives from.
 */
function ModuleLines(props: ModelPanelSubjectProps & { readonly id: string }): JSX.Element {
	const { sends, receives } = linesOf(props.projection, props.id);
	return (
		<>
			<LineList {...props} title="Sends to" slot="model-panel-sends" lines={sends} end="to" />
			<LineList
				{...props}
				title="Receives from"
				slot="model-panel-receives"
				lines={receives}
				end="from"
			/>
		</>
	);
}

/**
 * One direction of a module's lines.
 * @param props The lines, and which end names the other module.
 * @returns The list, or nothing when it has no line.
 */
function LineList(
	props: ModelPanelSubjectProps & {
		readonly title: string;
		readonly slot: string;
		readonly lines: readonly Connection[];
		readonly end: "from" | "to";
	},
): JSX.Element | null {
	const { lines } = props;
	if (lines.length === 0) return null;
	return (
		<ModelPanel.Section title={props.title} count={lines.length} slot={props.slot}>
			<ModelPanel.Rows items={lines}>
				{(connection) => <LineRow key={connection.line.id} {...props} connection={connection} />}
			</ModelPanel.Rows>
		</ModelPanel.Section>
	);
}

/**
 * One line of a module: the module at its other end, and what it joins. It selects the line.
 * @param props The line and its reading.
 * @returns A row of the panel.
 */
function LineRow(
	props: ModelPanelSubjectProps & {
		readonly connection: Connection;
		readonly end: "from" | "to";
	},
): JSX.Element {
	const { connection, end, model, projection, selection } = props;
	const { line, joins } = connection;
	const pick = useModelPick(line.id, selection.select);
	const peek = usePeekRow(line.id);
	const kinds = kindNames(model, joins);
	return (
		<ModelPanel.Row
			data-connection-id={line.id}
			data-from={line.from}
			data-to={line.to}
			{...pick}
			{...peek}
			name={moduleName(model, line[end], projection.reference)}
			detail={joins.length === 1 ? kinds : `${joins.length} · ${kinds}`}
		/>
	);
}

/**
 * The two actions that take the reader from a module: into it, and to its code.
 * @param props The module and its reading.
 * @returns The actions that apply.
 */
function ModuleActions(
	props: ModelPanelSubjectProps & { readonly module: Model["modules"][number] },
): JSX.Element {
	const { module, projection } = props;
	return (
		<>
			{!isRemoved(projection, module.id) && module.id !== props.scope && (
				<OpenModule id={module.id} onOpen={props.onOpen} />
			)}
			<ModuleOpenCode
				paneId={props.paneId}
				vault={props.vault}
				model={props.model}
				module={module}
				onNotice={props.onCodeTargetNotice}
			/>
		</>
	);
}

export { ModelPanelSubject };
