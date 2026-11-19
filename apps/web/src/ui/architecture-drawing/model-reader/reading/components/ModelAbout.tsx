// About: every long list of a reading, on a page over the picture so that the picture keeps its
// camera. It describes the open scope. The right panel stays beside it, with the page's outline at
// its top, then what is selected, and what can be done at its foot.

import {
	RiArrowLeftRightLine,
	RiBox3Line,
	RiFlowChart,
	RiGitBranchLine,
	RiInputMethodLine,
	RiListOrdered2,
	RiMapPinLine,
	RiPlayCircleLine,
} from "@remixicon/react";
import { useMemo, type JSX, type ReactNode } from "react";
import { ModelAboutWalkthroughs } from "#ui/architecture-drawing/model-reader/reading/components/ModelAboutWalkthroughs.tsx";
import {
	aboutSection,
	moduleHead,
	ModelAboutFrame,
	shownSections,
	type AboutHead,
	type AboutPageSection,
	type AboutPlace,
} from "#ui/architecture-drawing/model-reader/reading/components/ModelAboutFrame.tsx";
import { ModelConnectionTable } from "#ui/architecture-drawing/model-reader/reading/components/ModelConnectionTable.tsx";
import { ModelFlowDetails } from "#ui/architecture-drawing/model-reader/reading/components/ModelFlowDetails.tsx";
import { ModelInterface } from "#ui/architecture-drawing/model-reader/reading/components/ModelInterface.tsx";
import { ModelModuleList } from "#ui/architecture-drawing/model-reader/reading/components/ModelModuleList.tsx";
import {
	SelectedSubjects,
	scopeModel,
	type ModelSelectionDetailsProps,
} from "#ui/architecture-drawing/model-reader/reading/components/ModelSelectionDetails.tsx";
import { ModelSubjectStanding } from "#ui/architecture-drawing/model-reader/reading/components/ModelStateDetails.tsx";
import { ModelStateTimeline } from "#ui/architecture-drawing/model-reader/reading/components/ModelStateTimeline.tsx";
import type { Reader } from "#ui/architecture-drawing/model-reader/hooks/use-reader.ts";
import { useStateTimeline } from "#ui/architecture-drawing/model-reader/reading/hooks/use-state-timeline.ts";
import { modulePlaces } from "#ui/architecture-drawing/model-reader/reading/rules/module-places.ts";
import type { StateTimeline } from "#ui/architecture-drawing/model-reader/reading/rules/state-timeline.ts";
import { kindLookOf } from "#ui/architecture-drawing/canvas/picture/rules/kind-look.ts";

/** Inputs for the page. */
interface ModelAboutProps extends Pick<
	ModelSelectionDetailsProps,
	"vault" | "paneId" | "model" | "scope" | "projection" | "selection"
> {
	/** What the reading's state says of itself, which the first surface leaves out. */
	readonly overview: ReactNode;
	/** Select a subject and show it on the diagram. */
	readonly onShow: (id: string | null) => void;
	/** What the picture draws each subject with, for the marks of the lists. */
	readonly appearances: Parameters<typeof kindLookOf>[1];
	/** The walkthroughs of the open scope. */
	readonly walkthroughs: readonly ModelSelectionDetailsProps["model"]["walkthroughs"][number][];
	readonly tree: Reader["tree"];
	readonly place: AboutPlace;
	readonly reducedMotion: boolean;
}

/**
 * The page.
 * @param props The reading of the open scope.
 * @returns The page.
 */
function ModelAbout(props: ModelAboutProps): JSX.Element {
	const { model } = props;
	const timeline = useStateTimeline(props.vault, model);
	const look = useMemo(
		() => kindLookOf(model.policy, props.appearances),
		[model.policy, props.appearances],
	);
	const state = timeline.entries.find((entry) => entry.state.id === model.selectedState?.id);
	return (
		// The page lies on the picture's own sheet, with its four rounded corners.
		<article
			data-slot="model-about"
			className="picture-corners bg-background absolute inset-0 z-20 flex min-h-0 flex-col"
		>
			<ScopePage {...props} look={look} state={state} timeline={timeline} />
		</article>
	);
}

/** What the page of the open scope reads. */
interface ScopePageProps extends ModelAboutProps {
	readonly look: ReturnType<typeof kindLookOf>;
	readonly state: StateTimeline["entries"][number] | undefined;
	readonly timeline: StateTimeline;
}

/**
 * Where the lists of the open scope put their modules.
 * @param props The page's inputs.
 * @returns The rows of the parts and of the nearby modules.
 */
function useScopePlaces(props: ScopePageProps) {
	const { tree } = props;
	const { flow, focused, children, context, depicted, expanded, opened } = props.projection;
	return useMemo(() => {
		const all = new Map(depicted.nodes.map((node) => [node.id, node]));
		return {
			// The picture can open other modules beside this one, and the page stays with this one.
			parts: modulePlaces(
				expanded.length === 0
					? children
					: children.filter(({ parent }) => (parent ?? null) === opened),
				tree,
				all,
				flow === null && focused === null,
			),
			nearby: modulePlaces(context, tree, all, false),
		};
	}, [children, context, tree, depicted.nodes, flow, focused, expanded, opened]);
}

/**
 * The steps of a flow reading.
 * @param props The page's inputs.
 * @returns The section, or null for any other reading.
 */
function flowSection(props: ScopePageProps): AboutPageSection | null {
	const { model, selection } = props;
	const { flow, reference } = props.projection;
	if (flow === null) return null;
	return aboutSection(
		"flow",
		"Steps",
		RiListOrdered2,
		flow.steps.length,
		<ModelFlowDetails model={model} flow={flow} reference={reference} selection={selection} bare />,
	);
}

/**
 * The subjects a focused reading draws.
 * @param props The page's inputs.
 * @returns The section, or null for a reading with no focus.
 */
function focusSection(props: ScopePageProps): AboutPageSection | null {
	const { focused, reference } = props.projection;
	if (focused === null) return null;
	return aboutSection(
		"focus",
		"Focus",
		RiMapPinLine,
		focused.size,
		<SelectedSubjects
			model={props.model}
			reference={reference}
			selected={focused}
			slot="model-focused-subjects"
		/>,
	);
}

/**
 * What the open module offers to the rest of the model.
 * @param props The page's inputs.
 * @returns The section, or null for a scope that holds no parts.
 */
function interfaceSection(props: ScopePageProps): AboutPageSection | null {
	const { model, projection, selection } = props;
	if (projection.inspection?.holdsParts !== true) return null;
	return aboutSection(
		"interface",
		"Interface",
		RiInputMethodLine,
		undefined,
		<ModelInterface
			model={model}
			complete={projection.complete}
			inspection={projection.inspection}
			onSelect={selection.select}
		/>,
	);
}

/**
 * Each long list of the open scope. A section with nothing to show is absent.
 * @param props The page's inputs.
 * @returns The sections, in the order a reader asks.
 */
function useScopeSections(props: ScopePageProps): readonly AboutPageSection[] {
	const { model, projection, selection, look, onShow, walkthroughs } = props;
	const { connections, reference } = projection;
	const places = useScopePlaces(props);
	const list = { model, projection, selection, look, onShow };
	return shownSections([
		flowSection(props),
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
		focusSection(props),
		aboutSection(
			"parts",
			projection.flow === null ? "Parts" : "Participants",
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
			connections.length,
			<ModelConnectionTable
				model={model}
				connections={connections}
				reference={reference}
				selected={selection.ids}
				look={look}
				onSelect={selection.select}
				onShow={onShow}
			/>,
		),
		interfaceSection(props),
		aboutSection(
			"states",
			"States",
			RiGitBranchLine,
			props.timeline.entries.length || undefined,
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
 * What the head of the page says: a flow reading is about its flow, a scope about its module. The
 * roots have no responsibility of their own, so the state on screen says what they are. The current
 * state is the model as it is, so the model names it. Any other state, such as a proposal, is named
 * for itself, so that its name stands over its own summary.
 * @param props The page's inputs.
 * @returns The head.
 */
function scopeHead(
	props: Pick<ScopePageProps, "model" | "scope" | "tree" | "projection">,
): AboutHead {
	const { model, scope, tree } = props;
	const { flow } = props.projection;
	if (flow !== null) return { name: flow.name, kindName: "Flow", lead: flow.summary };
	const module = scopeModel(props).modules.find((entry) => entry.id === scope);
	if (module !== undefined) return moduleHead(module, tree);
	const state = model.selectedState;
	const named = state != null && state.lifecycle !== "current";
	return { name: named ? state.name : model.manifest.name, lead: state?.summary };
}

/**
 * What the page says of the open scope: what it is, then its long lists.
 * @param props The page's inputs.
 * @returns The page.
 */
function ScopePage(props: ScopePageProps): JSX.Element {
	const sections = useScopeSections(props);
	const { model, scope, look, state } = props;
	return (
		<ModelAboutFrame
			head={scopeHead(props)}
			look={look}
			state={state}
			sections={sections}
			place={props.place}
			reducedMotion={props.reducedMotion}
		>
			<ModelSubjectStanding model={model} subject={scope} />
		</ModelAboutFrame>
	);
}

export { ModelAbout, scopeHead };
