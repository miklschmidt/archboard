// The anatomy of About, for the open scope and for a selection alike: the name in the display
// face, a line of facts, what the subject is responsible for in reading size, then an outline
// beside the sections. The end of the title holds what the page is about and what can be done.

import type { RemixiconComponentType } from "@remixicon/react";
import { useCallback, useMemo, useState, type JSX, type ReactNode } from "react";
import { ModelSwitch } from "#ui/components/architecture-model/ModelSwitch.tsx";
import { ModelStateFact } from "#ui/components/architecture-model/ModelStateTimeline.tsx";
import { KindIcon } from "#ui/components/semantic-board-canvas/KindMarks.tsx";
import {
	ABOUT_COLUMNS,
	ABOUT_PAGE,
	ABOUT_SHEET,
	ABOUT_TITLE,
	AboutOutline,
	AboutSectionFrame,
	scrollToSection,
	type AboutSection,
} from "#ui/components/architecture-model/ModelAboutOutline.tsx";
import type { Reader } from "#ui/hooks/architecture-model/use-reader.ts";
import { useSectionSpy } from "#ui/hooks/architecture-model/use-section-spy.ts";
import type { TimelineEntry } from "#ui/rules/architecture-model/state-timeline.ts";
import type { KindLook } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";

/** One section of the page: its mark, and what it holds when it holds anything. */
interface AboutPageSection extends AboutSection {
	readonly body: ReactNode;
}

/** Where a page was scrolled to, which it opens at and keeps. */
interface AboutPlace {
	readonly recall: () => number;
	readonly keep: (top: number) => void;
}

/** Inputs for the page. */
interface ModelAboutFrameProps {
	/** The name of the subject. */
	readonly name: ReactNode;
	/** The line of facts under the name. */
	readonly facts: ReactNode;
	/** What the subject is responsible for. */
	readonly lead?: string | undefined;
	/** The longer account of it. */
	readonly description?: string | undefined;
	/** What the page is about and what can be done. */
	readonly tools: ReactNode;
	/** How the subject stands: its warnings, and how it differs from what it is read against. */
	readonly standing?: ReactNode;
	readonly sections: readonly AboutPageSection[];
	readonly place: AboutPlace;
	readonly reducedMotion: boolean;
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
function aboutSection(
	key: string,
	label: string,
	icon: RemixiconComponentType,
	count: number | undefined,
	body: ReactNode,
): AboutPageSection {
	return { key, label, icon, count, body };
}

/**
 * The sections with something to show.
 * @param sections The sections a subject can have.
 * @returns Those it has, in the order a reader asks.
 */
function shownSections(sections: readonly (AboutPageSection | null)[]): AboutPageSection[] {
	return sections.filter((entry): entry is AboutPageSection => entry !== null && entry.count !== 0);
}

/**
 * The page. It opens where the reader left it, and an outline of one section says nothing.
 * @param props The subject and its sections.
 * @returns The page.
 */
function ModelAboutFrame(props: ModelAboutFrameProps): JSX.Element {
	const { sections, place, reducedMotion } = props;
	const [page, setPage] = useState<HTMLElement | null>(null);
	const attach = useCallback(
		(element: HTMLElement | null): void => {
			if (element !== null) element.scrollTop = place.recall();
			setPage(element);
		},
		[place],
	);
	const keep = useCallback((): void => {
		if (page !== null) place.keep(page.scrollTop);
	}, [page, place]);
	const keys = useMemo(() => sections.map((entry) => entry.key), [sections]);
	const current = useSectionSpy(page, keys);
	const goTo = useCallback(
		(key: string): void => {
			if (page !== null) scrollToSection(page, key, reducedMotion);
		},
		[page, reducedMotion],
	);
	return (
		<div ref={attach} onScroll={keep} className={`${ABOUT_PAGE} min-h-0 flex-1`}>
			<div className={ABOUT_COLUMNS}>
				<AboutTitle {...props} />
				{sections.length > 1 && <AboutOutline sections={sections} current={current} onGo={goTo} />}
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

/**
 * What the subject is: its name, the page's tools at the end of that line, its facts, what it is
 * responsible for, and how it stands.
 * @param props The subject.
 * @returns The title.
 */
function AboutTitle(props: ModelAboutFrameProps): JSX.Element {
	const { lead, description } = props;
	return (
		<header data-slot="model-about-title" className={ABOUT_TITLE}>
			<div className="flex min-w-0 items-start justify-between gap-6">
				<h2 className="title-figure min-w-0 [overflow-wrap:anywhere] uppercase">{props.name}</h2>
				<div className="flex shrink-0 items-center gap-2 pt-2">{props.tools}</div>
			</div>
			{props.facts}
			{lead !== undefined && lead !== "" && (
				<p className="text-reading text-foreground/90 max-w-[68ch] text-pretty">{lead}</p>
			)}
			{description !== undefined && description !== "" && (
				<p className="text-body text-muted-foreground max-w-[68ch] whitespace-pre-wrap">
					{description}
				</p>
			)}
			{props.standing}
		</header>
	);
}

/** The two subjects of the page. */
const SUBJECTS = [
	{ value: "scope", label: "Open scope" },
	{ value: "selection", label: "Selected subject" },
] as const;

/**
 * Which subject the page describes, with the way to the other one while there is one.
 * @param props The subject and the way to change it.
 * @param props.subject The subject of the page.
 * @param props.onSubject Describe the other one.
 * @param props.selecting Whether anything is selected.
 * @returns The switch, or the name of the one subject.
 */
function AboutSubject(props: {
	readonly subject: Reader["aboutSubject"];
	readonly onSubject: Reader["onAbout"];
	readonly selecting: boolean;
}): JSX.Element {
	if (!props.selecting)
		return (
			<p data-slot="model-about-subject" className="text-control text-muted-foreground">
				{SUBJECTS[0].label}
			</p>
		);
	return (
		<ModelSwitch
			label="About describes"
			slot="model-about-subject"
			choices={SUBJECTS}
			value={props.subject}
			onChange={props.onSubject}
		/>
	);
}

/**
 * The line of facts: the kind's mark and name, the code path and where the reading's state stands.
 * @param props The facts that hold.
 * @param props.look How the vault's kinds look.
 * @param props.kind The subject's kind, when it has one.
 * @param props.kindName What a subject with no vocabulary kind is.
 * @param props.path The subject's code path, when it has one.
 * @param props.state The reading's state on the timeline, or undefined for a reading with none.
 * @returns The line.
 */
function AboutFacts(props: {
	readonly look: KindLook;
	readonly kind?: string | undefined;
	readonly kindName?: string | undefined;
	readonly path?: string | undefined;
	readonly state: TimelineEntry | undefined;
}): JSX.Element {
	const { look, kind, path, state } = props;
	return (
		<p
			data-slot="model-about-facts"
			className="text-control flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1"
		>
			{kind !== undefined && (
				<span className="flex items-center gap-1.5">
					<KindIcon look={look} kind={kind} className="text-muted-foreground size-4" />
					<span className="text-foreground">{look.nodeName(kind)}</span>
				</span>
			)}
			{props.kindName !== undefined && <span className="text-foreground">{props.kindName}</span>}
			{path !== undefined && (
				<code
					data-slot="model-about-path"
					className="text-technical text-muted-foreground font-mono"
				>
					{path}
				</code>
			)}
			{state === undefined ? (
				<span className="text-muted-foreground">No implemented state</span>
			) : (
				<ModelStateFact entry={state} />
			)}
		</p>
	);
}

export {
	AboutFacts,
	AboutSubject,
	aboutSection,
	ModelAboutFrame,
	shownSections,
	type AboutPageSection,
	type AboutPlace,
};
