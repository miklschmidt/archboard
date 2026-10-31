// About on a selection: the anatomy of the open scope, around whatever is selected. A module has
// the whole of its record here, because the right panel holds none of it.

import {
	RiArrowLeftRightLine,
	RiArrowRightLine,
	RiBox3Line,
	RiDoorOpenLine,
	RiFileCodeLine,
	RiHistoryLine,
	RiInputMethodLine,
	RiPlayCircleLine,
	RiPuzzleLine,
} from "@remixicon/react";
import { useMemo, type JSX, type ReactNode } from "react";
import { doorEndpoints, type Model } from "@archboard/board/content";
import {
	aboutSection,
	moduleHead,
	ModelAboutFrame,
	shownSections,
	type AboutHead,
	type AboutPlace,
} from "#ui/components/architecture-model/ModelAboutFrame.tsx";
import { ModelAboutWalkthroughs } from "#ui/components/architecture-model/ModelAboutWalkthroughs.tsx";
import { ModelConnectionTable } from "#ui/components/architecture-model/ModelConnectionTable.tsx";
import {
	ConnectionDetails,
	kindNames,
	LineTitle,
} from "#ui/components/architecture-model/ModelConnections.tsx";
import { ModelCollectionDetails } from "#ui/components/architecture-model/ModelCollectionDetails.tsx";
import { ModelDoorEndpoints } from "#ui/components/architecture-model/ModelDoorEndpoints.tsx";
import { ModelFlowDetails } from "#ui/components/architecture-model/ModelFlowDetails.tsx";
import { ModelHiddenSelection } from "#ui/components/architecture-model/ModelHiddenSelection.tsx";
import { ModelHistory } from "#ui/components/architecture-model/ModelHistory.tsx";
import { ModelInterface } from "#ui/components/architecture-model/ModelInterface.tsx";
import { ModelModuleList } from "#ui/components/architecture-model/ModelModuleList.tsx";
import {
	OpenModule,
	SelectedSubjects,
	type ModelSelectionDetailsProps,
} from "#ui/components/architecture-model/ModelSelectionDetails.tsx";
import { ModelSubjectStanding } from "#ui/components/architecture-model/ModelStateDetails.tsx";
import {
	ModuleDefinition,
	ModuleEvidence,
	RelationshipEvidence,
} from "#ui/components/architecture-model/ModuleDetails.tsx";
import { ModuleNavigation } from "#ui/components/architecture-model/ModuleNavigation.tsx";
import type { Reader } from "#ui/hooks/architecture-model/use-reader.ts";
import { modulePlaces } from "#ui/rules/architecture-model/module-places.ts";
import { walkthroughsAbout } from "#ui/rules/architecture-model/relevance.ts";
import {
	isRemoved,
	moduleSource,
	relationshipsOf,
	selectedSubject,
	type Connection,
	type SelectedSubject,
} from "#ui/rules/architecture-model/selected-subject.ts";
import type { TimelineEntry } from "#ui/rules/architecture-model/state-timeline.ts";
import type { KindLook } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";

type Module = Model["modules"][number];
type Relationship = Connection["joins"][number];

/** What a page about a selection reads. */
interface ModelAboutSelectionProps extends ModelSelectionDetailsProps {
	readonly look: KindLook;
	readonly state: TimelineEntry | undefined;
	readonly tools: ReactNode;
	readonly tree: Reader["tree"];
	readonly place: AboutPlace;
	readonly reducedMotion: boolean;
	readonly onShow: (id: string) => void;
	readonly onReveal: () => void;
}

/**
 * What the page says of the selection.
 * @param props The page's inputs.
 * @returns Everything the reading holds about the selected subject.
 */
function ModelAboutSelection(props: ModelAboutSelectionProps): JSX.Element {
	const subject = selectedSubject({ ...props, ids: props.selection.ids });
	if (subject.kind === "module") return <ModulePage {...props} module={subject.module} />;
	return <OtherPage {...props} subject={subject} />;
}

/**
 * Whether a selection is hidden from the reading, and how to bring it in.
 * @param props The page's inputs.
 * @returns The note, when one is needed.
 */
function HiddenNote(props: ModelAboutSelectionProps): JSX.Element {
	return (
		<ModelHiddenSelection
			projection={props.projection}
			selected={props.selection.ids}
			onReveal={props.onReveal}
			onRevealFlow={props.onRevealFlow}
		/>
	);
}

/** What a page of one module reads. */
interface ModulePageProps extends ModelAboutSelectionProps {
	readonly module: Module;
	/** The model that defines the module. */
	readonly source: Model;
}

/**
 * One relationship as a row of a table of lines.
 * @param edge The relationship.
 * @returns The row's connection.
 */
function relationshipLine(edge: Relationship): Connection {
	return { line: edge, joins: [edge] };
}

/**
 * What a row of a module's relationships adds under its cells.
 * @param connection The row.
 * @returns The relationship's account and evidence.
 */
function relationshipDetail(connection: Connection): ReactNode {
	return <RelationshipEvidence edge={connection.joins[0]} />;
}

/** The tables of a module light nothing: the module on the page stands at the end of every row. */
const NOTHING_LIT: ReadonlySet<string> = new Set();

/**
 * Each list of one module. A section with nothing to show is absent.
 * @param props The module and its reading.
 * @returns The sections, in the order a reader asks.
 */
function useModuleSections(props: ModulePageProps) {
	const { module, source, model, projection, selection, tree, look, scope, onShow } = props;
	const { id } = module;
	const { depicted, reference } = projection;
	const places = useMemo(() => {
		const parts = depicted.nodes.filter((node) => node.parent === id);
		return modulePlaces(parts, tree, new Map(depicted.nodes.map((node) => [node.id, node])), true);
	}, [depicted.nodes, id, tree]);
	const walkthroughs = useMemo(() => walkthroughsAbout(source, id), [source, id]);
	const { outgoing, incoming } = useMemo(
		() => relationshipsOf(source, projection, id),
		[source, projection, id],
	);
	const table = {
		model: source,
		reference,
		selected: NOTHING_LIT,
		look,
		onSelect: selection.select,
		onShow,
		detail: relationshipDetail,
	};
	const sends = useMemo(() => outgoing.map(relationshipLine), [outgoing]);
	const receives = useMemo(() => incoming.map(relationshipLine), [incoming]);
	return shownSections([
		aboutSection(
			"walkthroughs",
			"Walkthroughs",
			RiPlayCircleLine,
			walkthroughs.length,
			<ModelAboutWalkthroughs
				model={source}
				walkthroughs={walkthroughs}
				selection={selection}
				look={look}
			/>,
		),
		aboutSection(
			"parts",
			"Parts",
			RiBox3Line,
			places.length,
			<ModelModuleList
				model={model}
				projection={projection}
				places={places}
				selection={selection}
				look={look}
				head="Part"
				slot="module-parts"
				onShow={onShow}
			/>,
		),
		aboutSection(
			"sends",
			"Sends to",
			RiArrowRightLine,
			sends.length,
			<ModelConnectionTable {...table} connections={sends} />,
		),
		aboutSection(
			"receives",
			"Receives from",
			RiArrowLeftRightLine,
			receives.length,
			<ModelConnectionTable {...table} connections={receives} />,
		),
		aboutSection(
			"endpoints",
			"Endpoints",
			RiDoorOpenLine,
			doorEndpoints(projection, id).length,
			<ModelDoorEndpoints
				door={id}
				model={source}
				projection={projection}
				onSelect={selection.select}
				whole
			/>,
		),
		id === scope
			? aboutSection(
					"interface",
					"Interface",
					RiInputMethodLine,
					undefined,
					<ModelInterface model={source} projection={projection} onSelect={selection.select} />,
				)
			: null,
		aboutSection("code", "Code and evidence", RiFileCodeLine, undefined, <ModuleCode {...props} />),
		module.binding === undefined
			? null
			: aboutSection(
					"history",
					"Code history",
					RiHistoryLine,
					undefined,
					<ModelHistory
						vault={props.vault}
						model={source}
						module={module}
						onSelect={selection.select}
					/>,
				),
	]);
}

/**
 * Where a module's explanation comes from, and the way to its code.
 * @param props The module and its reading.
 * @returns The section's body.
 */
function ModuleCode(props: ModulePageProps): JSX.Element {
	const { module, source } = props;
	return (
		<div className="flex flex-col gap-6">
			<ModuleEvidence module={module} model={source} />
			<ModuleNavigation
				paneId={props.paneId}
				vault={props.vault}
				model={source}
				module={module}
				onNotice={props.onCodeTargetNotice}
			/>
			<ModuleDefinition module={module} />
		</div>
	);
}

/**
 * The page of one module. A removed module reads from the comparison base, and stays read only.
 * @param props The module and its reading.
 * @returns The page.
 */
function ModulePage(props: ModelAboutSelectionProps & { readonly module: Module }): JSX.Element {
	const { module, model, projection, onOpen, scope } = props;
	const source = moduleSource(model, projection, module.id);
	const sections = useModuleSections({ ...props, source });
	const opens = !isRemoved(projection, module.id) && module.id !== scope;
	const tools = (
		<>
			{props.tools}
			{opens && <OpenModule id={module.id} onOpen={onOpen} />}
		</>
	);
	return (
		<div data-slot="module-details" data-module-id={module.id} className="contents">
			<ModelAboutFrame
				head={moduleHead(module, props.tree)}
				look={props.look}
				state={props.state}
				tools={tools}
				sections={sections}
				place={props.place}
				reducedMotion={props.reducedMotion}
			>
				{props.evidence}
				<ModelSubjectStanding
					model={model}
					subject={module.id}
					reference={props.projection.reference}
				/>
				<HiddenNote {...props} />
			</ModelAboutFrame>
		</div>
	);
}

/** What the title and the one section of any subject but a module hold. */
interface OtherSubjectPage {
	readonly head: AboutHead;
	readonly label: string;
	readonly body: ReactNode;
}

/**
 * What the page says of a line.
 * @param props The page's inputs.
 * @param connection The line.
 * @returns The page's parts.
 */
function linePage(props: ModelAboutSelectionProps, connection: Connection): OtherSubjectPage {
	const { model } = props;
	const { reference } = props.projection;
	const { joins } = connection;
	return {
		head: {
			name: <LineTitle line={connection.line} model={model} reference={reference} />,
			kindName: kindNames(model, joins),
			lead: joins.length === 1 ? (joins[0].label ?? undefined) : undefined,
		},
		label: joins.length === 1 ? "Relationship" : "Relationships",
		body: <ConnectionDetails connection={connection} model={model} reference={reference} />,
	};
}

/**
 * What the page says of anything but one module.
 * @param props The page's inputs.
 * @param subject The selected subject.
 * @returns The page's parts. A selection the reading cannot name still has its page, which says so.
 */
function otherPage(
	props: ModelAboutSelectionProps,
	subject: Exclude<SelectedSubject, { readonly kind: "module" }>,
): OtherSubjectPage {
	const { model, projection, selection } = props;
	const { reference } = projection;
	if (subject.kind === "connection") return linePage(props, subject.connection);
	if (subject.kind === "collection")
		return {
			head: { name: subject.collection.name, kindName: "Flow collection" },
			label: "Flows",
			body: <ModelCollectionDetails {...subject} onOpenFlow={props.onRevealFlow} bare />,
		};
	if (subject.kind === "flow")
		return {
			head: { name: subject.flow.name, kindName: "Flow", lead: subject.flow.summary },
			label: "Steps",
			body: (
				<ModelFlowDetails
					model={model}
					flow={subject.flow}
					reference={reference}
					selection={selection}
					bare
				/>
			),
		};
	return {
		head: { name: "Selection" },
		label: "Selected subjects",
		body: (
			<SelectedSubjects
				model={model}
				reference={reference}
				selected={selection.ids}
				slot="model-selected-subjects"
			/>
		),
	};
}

/**
 * The page of a line, a flow, a collection or several subjects.
 * @param props The selected subject and its reading.
 * @returns The page.
 */
function OtherPage(
	props: ModelAboutSelectionProps & {
		readonly subject: Exclude<SelectedSubject, { readonly kind: "module" }>;
	},
): JSX.Element {
	const page = otherPage(props, props.subject);
	const sections = useMemo(
		() => [aboutSection("subject", page.label, RiPuzzleLine, undefined, page.body)],
		[page.label, page.body],
	);
	return (
		<ModelAboutFrame
			head={page.head}
			look={props.look}
			state={props.state}
			tools={props.tools}
			sections={sections}
			place={props.place}
			reducedMotion={props.reducedMotion}
		>
			{props.subject.kind === "connection" && props.evidence}
			<HiddenNote {...props} />
		</ModelAboutFrame>
	);
}

export { ModelAboutSelection };
