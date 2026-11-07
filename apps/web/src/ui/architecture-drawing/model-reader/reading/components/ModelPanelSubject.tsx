import { useMemo, type ComponentProps, type JSX, type ReactNode } from "react";
import type { Model } from "@archboard/model/content";
import {
	ConnectionSummary,
	kindNames,
	moduleName,
} from "#ui/architecture-drawing/model-reader/reading/components/ModelConnections.tsx";
import { ModelChangesWith } from "#ui/architecture-drawing/model-reader/reading/components/ModelChangesWith.tsx";
import { ModelCodeDetails } from "#ui/architecture-drawing/model-reader/reading/components/ModelCodeFindings.tsx";
import { ModelCollectionDetails } from "#ui/architecture-drawing/model-reader/reading/components/ModelCollectionDetails.tsx";
import { ModelFlowDetails } from "#ui/architecture-drawing/model-reader/reading/components/ModelFlowDetails.tsx";
import { ModelHiddenSelection } from "#ui/architecture-drawing/model-reader/reading/components/ModelHiddenSelection.tsx";
import { ModelInterfaceLine } from "#ui/architecture-drawing/model-reader/reading/components/ModelInterfaceLine.tsx";
import { ModelPanel } from "#ui/architecture-drawing/model-reader/reading/components/ModelPanel.tsx";
import {
	OpenModule,
	SelectedSubjects,
	ToggleModule,
	type ModelSelectionDetailsProps,
} from "#ui/architecture-drawing/model-reader/reading/components/ModelSelectionDetails.tsx";
import { ModelSubjectStanding } from "#ui/architecture-drawing/model-reader/reading/components/ModelStateDetails.tsx";
import {
	ModuleOpenCode,
	ModuleOpenReferences,
} from "#ui/architecture-drawing/model-reader/reading/module-navigation/components/ModuleNavigation.tsx";
import { TraceToggle } from "#ui/architecture-drawing/canvas/presentation/components/TraceToggle.tsx";
import type { useModelCodeFindings } from "#ui/architecture-drawing/model-reader/reading/hooks/use-model-code-findings.ts";
import { useModelPick } from "#ui/architecture-drawing/model-reader/reading/hooks/use-model-pick.ts";
import { usePeekRow } from "#ui/architecture-drawing/model-reader/reading/hooks/use-peek-row.ts";
import { toggleOf } from "#ui/architecture-drawing/model-reader/rules/expansion.ts";
import { pictureReach } from "#ui/architecture-drawing/model-reader/reading/rules/picture-reach.ts";
import {
	linesOf,
	moduleInterface,
	moduleSource,
	opensAsModule,
	selectedSubject,
	type Connection,
	type SelectedSubject,
} from "#ui/architecture-drawing/model-reader/rules/selected-subject.ts";
import type { Way } from "#ui/architecture-drawing/canvas/picture/camera/rules/reach.ts";

/** Inputs for what the panel says of a selection. */
interface ModelPanelSubjectProps extends ModelSelectionDetailsProps {
	readonly code: ReturnType<typeof useModelCodeFindings>["reading"];
	/** The code path of a module, when it has one. */
	readonly pathOf: (id: string) => string | undefined;
	readonly onReveal: () => void;
	/** What stands under the subject's own details: what touches it. */
	readonly context: ReactNode;
	/** The head of the flow on screen, when a flow is read. */
	readonly flowHead: ReactNode;
	/** Expand a door or collapse a frame. */
	readonly onToggle: (id: string) => boolean;
	/** What the interface line of a module does. */
	readonly line: Pick<ComponentProps<typeof ModelInterfaceLine>, "onShow" | "onAbout">;
}

/**
 * What the panel says while nothing is selected: what is open, and what touches it.
 * @param props What is open.
 * @param props.name Its name.
 * @param props.description What it says of itself.
 * @param props.flowHead The head of the flow on screen, which stands in place of the name.
 * @param props.children What touches it.
 * @returns The body.
 */
function ModelPanelScope(props: {
	readonly name: ReactNode;
	readonly description: string | undefined;
	readonly flowHead: ReactNode;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<ModelPanel.Body slot="model-panel-scope">
			{props.flowHead ?? <ModelPanel.Head title={props.name} />}
			{Boolean(props.description) && (
				<p className="text-control font-normal whitespace-pre-wrap">{props.description}</p>
			)}
			{props.children}
		</ModelPanel.Body>
	);
}

/**
 * What the panel says of a selection.
 * @param props The selection and its reading.
 * @returns The body.
 */
function ModelPanelSubject(props: ModelPanelSubjectProps): JSX.Element {
	const subject = selectedSubject({ ...props, ids: props.selection.ids });
	return (
		<>
			{subject.kind === "module" ? (
				<ModuleSubject {...props} module={subject.module} />
			) : (
				<OtherSubject {...props} subject={subject} />
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
		</>
	);
}

/**
 * What can be done with a selection, at the foot of the panel.
 * @param props The selection, its reading and what can be done with any selection.
 * @returns The foot.
 */
function ModelPanelActions(
	props: ModelPanelSubjectProps & { readonly children: ReactNode },
): JSX.Element {
	const subject = selectedSubject({ ...props, ids: props.selection.ids });
	return (
		<>
			{subject.kind === "module" && <ModuleActions {...props} module={subject.module} />}
			{props.children}
		</>
	);
}

/**
 * What the panel says of anything but one module.
 * @param props The selection and its reading.
 * @returns The body.
 */
function OtherSubject(
	props: ModelPanelSubjectProps & {
		readonly subject: Exclude<SelectedSubject, { readonly kind: "module" }>;
	},
): JSX.Element {
	const { model, projection, selection, subject } = props;
	const { ids, select } = selection;
	const warnings = <ModelCodeDetails reading={props.code} selected={ids} scope={props.scope} />;
	if (subject.kind === "connection")
		return (
			<ConnectionSummary
				connection={subject.connection}
				model={model}
				reference={projection.reference}
				onSelect={select}
				context={props.context}
			>
				{warnings}
			</ConnectionSummary>
		);
	return (
		<ModelPanel.Body slot="model-panel-other">
			{warnings}
			{subject.kind === "collection" && (
				<ModelCollectionDetails {...subject} onOpenFlow={props.onRevealFlow} />
			)}
			{subject.kind === "flow" && (
				<>
					{props.flowHead}
					<ModelFlowDetails
						model={model}
						flow={subject.flow}
						reference={projection.reference}
						selection={selection}
						brief
						bare
					/>
				</>
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
			{props.context}
		</ModelPanel.Body>
	);
}

/**
 * What the panel says of one module: what it is, how it stands, its lines, and what touches it.
 * @param props The module and its reading.
 * @returns The body.
 */
function ModuleSubject(
	props: ModelPanelSubjectProps & { readonly module: Model["modules"][number] },
): JSX.Element {
	const { module, model, projection, selection } = props;
	const source = moduleSource(model, projection, module.id);
	const inspection = useMemo(() => moduleInterface(projection, module.id), [projection, module.id]);
	return (
		<ModelPanel.Body slot="module-details" moduleId={module.id}>
			<ModuleHead {...props} model={source} />
			<ModelInterfaceLine {...props.line} inspection={inspection} projection={projection} />
			<ModelCodeDetails reading={props.code} selected={selection.ids} scope={props.scope} />
			<ModelChangesWith
				vault={props.vault}
				model={source}
				module={module}
				onSelect={selection.select}
			/>
			<ModelSubjectStanding model={model} subject={module.id} reference={projection.reference} />
			<ModuleOpenReferences
				paneId={props.paneId}
				vault={props.vault}
				model={source}
				module={module}
				onNotice={props.onCodeTargetNotice}
			/>
			<ModuleLines {...props} model={source} id={module.id} />
			{props.context}
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
			<LineList {...props} title="Sends to" slot="model-panel-sends" lines={sends} way="onward" />
			<LineList
				{...props}
				title="Receives from"
				slot="model-panel-receives"
				lines={receives}
				way="back"
			/>
		</>
	);
}

/** One direction of a module's lines. */
interface LineListProps extends ModelPanelSubjectProps {
	readonly id: string;
	readonly title: string;
	readonly slot: string;
	readonly lines: readonly Connection[];
	/** Which way a trace of these lines goes. */
	readonly way: Way;
}

/**
 * One direction of a module's lines, and the control that traces how far it reaches.
 * @param props The module and the lines.
 * @returns The list, or nothing when it has no line.
 */
function LineList(props: LineListProps): JSX.Element | null {
	const { id, way, lines, model, projection } = props;
	const { parts } = useMemo(() => pictureReach(projection, id, way), [projection, id, way]);
	const name = moduleName(model, id, projection.reference);
	const trace = useMemo(
		() => <TraceToggle part={id} name={name} way={way} parts={parts} />,
		[id, name, way, parts],
	);
	if (lines.length === 0) return null;
	return (
		<ModelPanel.Section title={props.title} count={lines.length} slot={props.slot} action={trace}>
			<ModelPanel.Rows items={lines}>
				{(connection) => <LineRow key={connection.line.id} {...props} connection={connection} />}
			</ModelPanel.Rows>
		</ModelPanel.Section>
	);
}

/**
 * One line of a module: the module at its other end, and what it joins. It selects the line.
 * @param props The module, the line and its reading.
 * @returns A row of the panel.
 */
function LineRow(
	props: ModelPanelSubjectProps & {
		readonly id: string;
		readonly connection: Connection;
	},
): JSX.Element {
	const { connection, id, model, projection, selection } = props;
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
			name={moduleName(model, line.from === id ? line.to : line.from, projection.reference)}
			detail={joins.length === 1 ? kinds : `${joins.length} · ${kinds}`}
		/>
	);
}

/**
 * The actions that take the reader from a module: into it, out of or into this picture, and to its
 * code.
 * @param props The module and its reading.
 * @returns The actions that apply.
 */
function ModuleActions(
	props: ModelPanelSubjectProps & { readonly module: Model["modules"][number] },
): JSX.Element {
	const { module, projection } = props;
	return (
		<>
			{opensAsModule(props.model, projection, props.scope, module.id) && (
				<OpenModule id={module.id} onOpen={props.onOpen} />
			)}
			<ToggleModule
				id={module.id}
				toggle={toggleOf(projection, module.id)}
				onToggle={props.onToggle}
			/>
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

export { ModelPanelActions, ModelPanelScope, ModelPanelSubject };
