// About: every long list of a reading, on a page over the picture so that the picture keeps its
// camera. The page says which subject it describes: the open scope, or what is selected.

import {
	RiArrowLeftRightLine,
	RiBox3Line,
	RiFlowChart,
	RiGitBranchLine,
	RiGroupLine,
	RiInputMethodLine,
	RiListOrdered2,
	RiMapPinLine,
	RiPlayCircleLine,
} from "@remixicon/react";
import { useMemo, type JSX, type ReactNode } from "react";
import { ModelAboutSelection } from "#ui/components/architecture-model/ModelAboutSelection.tsx";
import { ModelAboutWalkthroughs } from "#ui/components/architecture-model/ModelAboutWalkthroughs.tsx";
import {
	AboutFacts,
	AboutSubject,
	aboutSection,
	ModelAboutFrame,
	shownSections,
	type AboutPageSection,
	type AboutPlace,
} from "#ui/components/architecture-model/ModelAboutFrame.tsx";
import { ModelCodeWarnings } from "#ui/components/architecture-model/ModelCodeFindings.tsx";
import { ModelConnectionTable } from "#ui/components/architecture-model/ModelConnectionTable.tsx";
import { ModelFlowDetails } from "#ui/components/architecture-model/ModelFlowDetails.tsx";
import { ModelGroups } from "#ui/components/architecture-model/ModelGroups.tsx";
import { ModelInterface } from "#ui/components/architecture-model/ModelInterface.tsx";
import { ModelModuleList } from "#ui/components/architecture-model/ModelModuleList.tsx";
import {
	SelectedSubjects,
	scopeModel,
	type ModelSelectionDetailsProps,
} from "#ui/components/architecture-model/ModelSelectionDetails.tsx";
import { ModelSubjectStanding } from "#ui/components/architecture-model/ModelStateDetails.tsx";
import { ModelStateTimeline } from "#ui/components/architecture-model/ModelStateTimeline.tsx";
import type { useModelCodeFindings } from "#ui/hooks/architecture-model/use-model-code-findings.ts";
import type { Reader } from "#ui/hooks/architecture-model/use-reader.ts";
import { useStateTimeline } from "#ui/hooks/architecture-model/use-state-timeline.ts";
import { modulePlaces } from "#ui/rules/architecture-model/module-places.ts";
import type { StateTimeline } from "#ui/rules/architecture-model/state-timeline.ts";
import { kindLookOf } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";

/** Inputs for the page. */
interface ModelAboutProps extends ModelSelectionDetailsProps {
	readonly subject: Reader["aboutSubject"];
	readonly onSubject: Reader["onAbout"];
	/** What the reading's state says of itself, which the first surface leaves out. */
	readonly overview: ReactNode;
	readonly code: ReturnType<typeof useModelCodeFindings>["reading"];
	/** Select a subject and show it on the diagram, or let go for a warning about the model. */
	readonly onShow: (id: string | null) => void;
	/** What the picture draws each subject with, for the marks of the lists. */
	readonly appearances: Parameters<typeof kindLookOf>[1];
	/** What can be done with the selection. */
	readonly children: ReactNode;
	/** The walkthroughs of the open scope. */
	readonly walkthroughs: Reader["walkthroughs"];
	readonly tree: Reader["tree"];
	readonly place: AboutPlace;
	readonly onReveal: () => void;
	readonly reducedMotion: boolean;
}

/**
 * The page.
 * @param props The reading, its selection and which of the two the page describes.
 * @returns The page.
 */
function ModelAbout(props: ModelAboutProps): JSX.Element {
	const { subject, model, selection, onShow } = props;
	const timeline = useStateTimeline(props.vault, model);
	const look = useMemo(
		() => kindLookOf(model.policy, props.appearances),
		[model.policy, props.appearances],
	);
	const state = timeline.entries.find((entry) => entry.state.id === model.selectedState?.id);
	const tools = (
		<>
			<AboutSubject
				subject={subject}
				onSubject={props.onSubject}
				selecting={selection.ids.size > 0}
			/>
			<ModelCodeWarnings reading={props.code} onSelect={onShow} />
			{props.children}
		</>
	);
	return (
		<article
			data-slot="model-about"
			data-subject={subject}
			className="bg-background absolute inset-0 z-20 flex min-h-0 flex-col"
		>
			{subject === "selection" ? (
				<ModelAboutSelection {...props} look={look} state={state} tools={tools} />
			) : (
				<ScopePage {...props} look={look} state={state} tools={tools} timeline={timeline} />
			)}
		</article>
	);
}

/** What the page of the open scope reads. */
interface ScopePageProps extends ModelAboutProps {
	readonly look: ReturnType<typeof kindLookOf>;
	readonly state: Parameters<typeof AboutFacts>[0]["state"];
	readonly tools: ReactNode;
	readonly timeline: StateTimeline;
}

/**
 * Each long list of the open scope. A section with nothing to show is absent.
 * @param props The page's inputs.
 * @returns The sections, in the order a reader asks.
 */
function useScopeSections(props: ScopePageProps): readonly AboutPageSection[] {
	const { model, projection, selection, look, tree, onShow, walkthroughs } = props;
	const { flow, focused, children, context, listed, reference, inspection, depicted } = projection;
	const { select } = selection;
	const places = useMemo(() => {
		const all = new Map(depicted.nodes.map((node) => [node.id, node]));
		return {
			parts: modulePlaces(children, tree, all, flow === null && focused === null),
			nearby: modulePlaces(context, tree, all, false),
		};
	}, [children, context, tree, depicted.nodes, flow, focused]);
	const list = { model, projection, selection, look, onShow };
	return shownSections([
		flow === null
			? null
			: aboutSection(
					"flow",
					"Steps",
					RiListOrdered2,
					flow.steps.length,
					<ModelFlowDetails model={model} flow={flow} reference={reference} selection={selection} />,
				),
		aboutSection(
			"walkthroughs",
			"Walkthroughs",
			RiPlayCircleLine,
			walkthroughs.length,
			<ModelAboutWalkthroughs
				model={model}
				walkthroughs={walkthroughs}
				selection={selection}
				look={look}
			/>,
		),
		focused === null
			? null
			: aboutSection(
					"focus",
					"Focus",
					RiMapPinLine,
					focused.size,
					<SelectedSubjects
						model={model}
						reference={reference}
						selected={focused}
						title="Focused subjects"
						slot="model-focused-subjects"
					/>,
				),
		aboutSection(
			"parts",
			flow === null ? "Parts" : "Participants",
			RiBox3Line,
			places.parts.length,
			<ModelModuleList {...list} places={places.parts} head="Part" slot="module-list" />,
		),
		aboutSection(
			"nearby",
			"Nearby modules",
			RiFlowChart,
			places.nearby.length,
			<ModelModuleList {...list} places={places.nearby} head="Module" slot="module-context" />,
		),
		aboutSection(
			"connections",
			"Connections",
			RiArrowLeftRightLine,
			listed.length,
			<ModelConnectionTable
				model={model}
				connections={listed}
				reference={reference}
				selected={selection.ids}
				look={look}
				onSelect={select}
				onShow={onShow}
			/>,
		),
		inspection?.holdsParts === true
			? aboutSection(
					"interface",
					"Interface",
					RiInputMethodLine,
					undefined,
					<ModelInterface model={model} projection={projection} onSelect={select} />,
				)
			: null,
		aboutSection(
			"groups",
			"Groups",
			RiGroupLine,
			Object.keys(model.policy.groups).length,
			<ModelGroups model={model} selection={selection} />,
		),
		aboutSection(
			"states",
			"States",
			RiGitBranchLine,
			undefined,
			<ScopeStates {...props} />,
		),
	]);
}

/**
 * The states of the model on their timeline, with the prose of the one on screen inside its entry.
 * @param props The page's inputs.
 * @returns The section's body.
 */
function ScopeStates(props: ScopePageProps): JSX.Element {
	const { timeline, model, paneId, overview } = props;
	const { entries } = timeline;
	const listed = entries.length > 0 && model.migrationPreview === undefined;
	return (
		<>
			{listed ? (
				<ModelStateTimeline
					timeline={timeline}
					showing={model.selectedState?.id ?? null}
					paneId={paneId}
				>
					{overview}
				</ModelStateTimeline>
			) : (
				overview
			)}
			<ModelOwnership />
		</>
	);
}

/**
 * Why a model stays with its repository, which a reader asks only when they try to move it.
 * @returns A closed note.
 */
function ModelOwnership(): JSX.Element {
	return (
		<details className="text-body text-muted-foreground">
			<summary>Model ownership</summary>
			<p data-slot="model-transfer-unavailable" className="mt-3 max-w-[68ch]">
				Moving architecture ownership to another repository is unavailable. Export a portable model
				to share an exact reading.
			</p>
		</details>
	);
}

/**
 * What the page says of the open scope: what it is, then its long lists. The roots have no
 * responsibility of their own, so the state on screen says what they are.
 * @param props The page's inputs.
 * @returns The page.
 */
function ScopePage(props: ScopePageProps): JSX.Element {
	const sections = useScopeSections(props);
	const { model, scope, look, state, tree } = props;
	const module = scopeModel(props).modules.find((entry) => entry.id === scope);
	const name = module?.name ?? model.manifest.name;
	const path = scope === null ? undefined : tree.owner.get(scope)?.path;
	return (
		<ModelAboutFrame
			name={name}
			facts={<AboutFacts look={look} kind={module?.kind} path={path} state={state} />}
			lead={module === undefined ? (model.selectedState?.summary ?? undefined) : module.responsibility}
			description={module?.description}
			tools={props.tools}
			standing={<ModelSubjectStanding model={model} subject={scope} />}
			sections={sections}
			place={props.place}
			reducedMotion={props.reducedMotion}
		/>
	);
}

export { ModelAbout, type ModelAboutProps };
