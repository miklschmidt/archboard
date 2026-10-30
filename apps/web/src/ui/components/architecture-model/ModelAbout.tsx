// About: every long list of a reading, on a page over the picture so that the picture keeps its
// camera. The page says which subject it describes: the open scope, or what is selected.

import {
	RiArrowLeftRightLine,
	RiBox3Line,
	RiFlowChart,
	RiGroupLine,
	RiHistoryLine,
	RiInputMethodLine,
	RiListOrdered2,
	RiMapPinLine,
	type RemixiconComponentType,
} from "@remixicon/react";
import { useCallback, useMemo, useState, type JSX, type ReactNode } from "react";
import { Button } from "@archboard/ui-kit/components";
import { ModelCodeWarnings } from "#ui/components/architecture-model/ModelCodeFindings.tsx";
import { ModelConnections } from "#ui/components/architecture-model/ModelConnections.tsx";
import { ModelFlowDetails } from "#ui/components/architecture-model/ModelFlowDetails.tsx";
import { ModelGroups } from "#ui/components/architecture-model/ModelGroups.tsx";
import { ModelHiddenSelection } from "#ui/components/architecture-model/ModelHiddenSelection.tsx";
import { ModelInterface } from "#ui/components/architecture-model/ModelInterface.tsx";
import { ModelModuleList } from "#ui/components/architecture-model/ModelModuleList.tsx";
import {
	ModelSelectionDetails,
	ScopeIntroduction,
	SelectedSubjects,
	scopeModel,
	type ModelSelectionDetailsProps,
} from "#ui/components/architecture-model/ModelSelectionDetails.tsx";
import { ModelSubjectStanding } from "#ui/components/architecture-model/ModelStateDetails.tsx";
import {
	ABOUT_COLUMNS,
	ABOUT_PAGE,
	ABOUT_SHEET,
	ABOUT_TITLE,
	AboutOutline,
	AboutSectionFrame,
	scrollToSection,
	type AboutSection,
} from "#ui/components/semantic-board-canvas/AboutOutline.tsx";
import type { useModelCodeFindings } from "#ui/hooks/architecture-model/use-model-code-findings.ts";
import type { Reader } from "#ui/hooks/architecture-model/use-reader.ts";
import { useSectionSpy } from "#ui/hooks/semantic-board-canvas/use-section-spy.ts";
import { kindLookOf } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";

/** Inputs for the page. */
interface ModelAboutProps extends ModelSelectionDetailsProps {
	readonly subject: Reader["aboutSubject"];
	readonly onSubject: Reader["onAbout"];
	/** What the reading's state says of itself, which the first surface leaves out. */
	readonly overview: ReactNode;
	readonly code: ReturnType<typeof useModelCodeFindings>["reading"];
	/** Select a warned subject, or let go for a warning about the model. */
	readonly onWarning: (id: string | null) => void;
	/** What the picture draws each subject with, for the marks of the lists. */
	readonly appearances: Parameters<typeof kindLookOf>[1];
	/** What can be done with the selection. */
	readonly children: ReactNode;
	/** What the open module is called. */
	readonly scopeName: string;
	readonly onReveal: () => void;
	readonly reducedMotion: boolean;
}

/**
 * The page.
 * @param props The reading, its selection and which of the two the page describes.
 * @returns The page.
 */
function ModelAbout(props: ModelAboutProps): JSX.Element {
	const { subject } = props;
	return (
		<article
			data-slot="model-about"
			data-subject={subject}
			className="bg-background absolute inset-0 z-20 flex min-h-0 flex-col"
		>
			<AboutBar {...props} />
			{subject === "selection" ? <SelectionPage {...props} /> : <ScopePage {...props} />}
		</article>
	);
}

/**
 * What stays while the page scrolls: which subject it describes, the way to the other one, the
 * model's warnings and what can be done with the selection.
 * @param props The page's inputs.
 * @returns The bar.
 */
function AboutBar(props: ModelAboutProps): JSX.Element {
	const { subject, onSubject, selection } = props;
	const other = subject === "scope" ? "selection" : "scope";
	const toOther = useCallback((): void => onSubject(other), [onSubject, other]);
	return (
		<div
			data-slot="model-about-bar"
			className="border-border h-band flex shrink-0 items-center gap-3 border-b px-6"
		>
			<p data-slot="model-about-subject" className="text-control shrink-0">
				{subject === "scope" ? "Open scope" : "Selected subject"}
			</p>
			{(subject === "selection" || selection.ids.size > 0) && (
				<Button
					variant="link"
					size="sm"
					data-slot="model-about-other"
					className="h-auto min-w-0 p-0"
					onClick={toOther}
				>
					<span className="truncate">
						{subject === "scope" ? "Read the selection" : `Read ${props.scopeName}`}
					</span>
				</Button>
			)}
			<span className="ml-auto flex shrink-0 items-center gap-2">
				<ModelCodeWarnings reading={props.code} onSelect={props.onWarning} />
				{props.children}
			</span>
		</div>
	);
}

/**
 * What the page says of the selection.
 * @param props The page's inputs.
 * @returns Everything the reading holds about the selected subject.
 */
function SelectionPage(props: ModelAboutProps): JSX.Element {
	return (
		<div className={`${ABOUT_PAGE} min-h-0 flex-1`}>
			<div className="mx-auto flex max-w-[840px] flex-col gap-8 px-10 pt-8 pb-16">
				<ModelHiddenSelection
					projection={props.projection}
					selected={props.selection.ids}
					onReveal={props.onReveal}
					onRevealFlow={props.onRevealFlow}
				/>
				<ModelSelectionDetails {...props} />
			</div>
		</div>
	);
}

/** One section of the page: its mark, and what it holds when it holds anything. */
interface ScopeSection extends AboutSection {
	readonly body: ReactNode;
}

/**
 * One section of the page.
 * @param key Where the outline finds it.
 * @param label Its name.
 * @param icon Its mark.
 * @param count How many it lists, when it is a list.
 * @param body What it holds.
 * @returns The section.
 */
function section(
	key: string,
	label: string,
	icon: RemixiconComponentType,
	count: number | undefined,
	body: ReactNode,
): ScopeSection {
	return { key, label, icon, count, body };
}

/**
 * Each long list of the open scope. A section with nothing to show is absent.
 * @param props The page's inputs.
 * @returns The sections, in the order a reader asks.
 */
function useScopeSections(props: ModelAboutProps): readonly ScopeSection[] {
	const { model, projection, selection, appearances } = props;
	const look = useMemo(() => kindLookOf(model.policy, appearances), [model.policy, appearances]);
	const { flow, focused, children, context, listed, reference, inspection } = projection;
	const select = selection.select;
	const list = { model, projection, selection, look };
	const sections = [
		props.overview === null
			? null
			: section("state", "Reading", RiHistoryLine, undefined, props.overview),
		flow === null
			? null
			: section(
					"flow",
					"Steps",
					RiListOrdered2,
					flow.steps.length,
					<ModelFlowDetails
						model={model}
						flow={flow}
						reference={reference}
						selection={selection}
					/>,
				),
		focused === null
			? null
			: section(
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
		section(
			"parts",
			flow === null ? "Parts" : "Participants",
			RiBox3Line,
			children.length,
			<ModelModuleList {...list} modules={children} slot="module-list" />,
		),
		section(
			"nearby",
			"Nearby modules",
			RiFlowChart,
			context.length,
			<ModelModuleList {...list} modules={context} slot="module-context" />,
		),
		section(
			"connections",
			"Connections",
			RiArrowLeftRightLine,
			listed.length,
			<ModelConnections
				model={model}
				connections={listed}
				reference={reference}
				selected={selection.ids}
				onSelect={select}
			/>,
		),
		inspection?.holdsParts === true
			? section(
					"interface",
					"Interface",
					RiInputMethodLine,
					undefined,
					<ModelInterface model={model} projection={projection} onSelect={select} />,
				)
			: null,
		section(
			"groups",
			"Groups",
			RiGroupLine,
			Object.keys(model.policy.groups).length,
			<ModelGroups model={model} selection={selection} />,
		),
	];
	return sections.filter((entry): entry is ScopeSection => entry !== null && entry.count !== 0);
}

/**
 * What the page says of the open scope: what it is, then its long lists.
 * @param props The page's inputs.
 * @returns The page.
 */
function ScopePage(props: ModelAboutProps): JSX.Element {
	const [page, attach] = useState<HTMLElement | null>(null);
	const sections = useScopeSections(props);
	const keys = useMemo(() => sections.map((entry) => entry.key), [sections]);
	const current = useSectionSpy(page, keys);
	const { reducedMotion } = props;
	const goTo = useCallback(
		(key: string): void => {
			if (page !== null) scrollToSection(page, key, reducedMotion);
		},
		[page, reducedMotion],
	);
	return (
		<div ref={attach} className={`${ABOUT_PAGE} min-h-0 flex-1`}>
			<div className={ABOUT_COLUMNS}>
				<header data-slot="model-about-title" className={ABOUT_TITLE}>
					<ScopeIntroduction model={scopeModel(props)} scope={props.scope} />
					<ModelSubjectStanding model={props.model} subject={props.scope} />
				</header>
				<AboutOutline sections={sections} current={current} onGo={goTo} />
				<div className={ABOUT_SHEET}>
					{sections.map((entry) => (
						<AboutSectionFrame key={entry.key} section={entry}>
							{entry.body}
						</AboutSectionFrame>
					))}
				</div>
			</div>
		</div>
	);
}

export { ModelAbout };
