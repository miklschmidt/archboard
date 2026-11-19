// The anatomy of About: the name of the open scope in the display face, a line of facts, what it is
// responsible for in reading size, then the sections. The outline of the sections stands at the top
// of the right panel, or in a bar over the page where the panel hides.

import type { RemixiconComponentType } from "@remixicon/react";
import { useCallback, useContext, useMemo, useState, type JSX, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Model } from "@archboard/model/content";
import { ModelStateFact } from "#ui/architecture-drawing/model-reader/reading/components/ModelStateTimeline.tsx";
import { KindIcon } from "#ui/architecture-drawing/canvas/presentation/components/KindMarks.tsx";
import {
	ABOUT_COLUMNS,
	ABOUT_PAGE,
	ABOUT_SHEET,
	ABOUT_TITLE,
	AboutOutline,
	AboutOutlineContext,
	AboutSectionFrame,
	scrollToSection,
	type AboutSection,
} from "#ui/architecture-drawing/model-reader/reading/components/ModelAboutOutline.tsx";
import type { Reader } from "#ui/architecture-drawing/model-reader/hooks/use-reader.ts";
import { useSectionSpy } from "#ui/architecture-drawing/model-reader/reading/hooks/use-section-spy.ts";
import type { TimelineEntry } from "#ui/architecture-drawing/model-reader/reading/rules/state-timeline.ts";
import type { KindLook } from "#ui/architecture-drawing/canvas/picture/rules/kind-look.ts";

/** One section of the page: its mark, and what it holds when it holds anything. */
interface AboutPageSection extends AboutSection {
	readonly body: ReactNode;
}

/** Where a page was scrolled to, which it opens at and keeps. */
interface AboutPlace {
	readonly recall: () => number;
	readonly keep: (top: number) => void;
	/** The section a reader asked to open at, or null. */
	readonly asked: () => string | null;
}

/** What the head of the page says of its subject. */
interface AboutHead {
	/** The name of the subject. */
	readonly name: ReactNode;
	/** Its kind, when it has one of the model's vocabulary. */
	readonly kind?: string | undefined;
	/** What a subject with no such kind is. */
	readonly kindName?: string | undefined;
	/** Its code path, when it has one. */
	readonly path?: string | undefined;
	/** What the subject is responsible for. */
	readonly lead?: string | undefined;
	/** The longer account of it. */
	readonly description?: string | undefined;
}

/** Inputs for the page. */
interface ModelAboutFrameProps {
	readonly head: AboutHead;
	readonly look: KindLook;
	/** The reading's state on the timeline, or undefined for a reading with none. */
	readonly state: TimelineEntry | undefined;
	/** How the subject stands: its warnings, and how it differs from what it is read against. */
	readonly children?: ReactNode;
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
 * What the head says of a module.
 * @param module The module.
 * @param tree The tree of the reading, which knows its code path.
 * @returns The head.
 */
function moduleHead(
	module: Pick<Model["modules"][number], "id" | "name" | "kind" | "responsibility" | "description">,
	tree: Reader["tree"],
): AboutHead {
	return {
		name: module.name,
		kind: module.kind,
		path: tree.owner.get(module.id)?.path,
		lead: module.responsibility,
		description: module.description,
	};
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
 * Bring a page to where it opens: the section a reader asked for, or else where they left it.
 * @param page The page that scrolls.
 * @param place Where it was.
 */
function openAt(page: HTMLElement, place: AboutPlace): void {
	page.scrollTop = place.recall();
	const section = place.asked();
	if (section !== null) scrollToSection(page, section, true);
}

/**
 * The page. It opens where the reader left it, and an outline of one section says nothing. The
 * outline stands at the top of the right panel, and over the sections where the panel hides.
 * @param props The subject and its sections.
 * @returns The page.
 */
function ModelAboutFrame(props: ModelAboutFrameProps): JSX.Element {
	const { sections, place, reducedMotion } = props;
	const [page, setPage] = useState<HTMLElement | null>(null);
	const attach = useCallback(
		(element: HTMLElement | null): void => {
			if (element !== null) openAt(element, place);
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
	const outline = useContext(AboutOutlineContext);
	const outlined = sections.length > 1;
	return (
		<div
			ref={attach}
			onScroll={keep}
			tabIndex={-1}
			data-slot="model-about-page"
			className={`${ABOUT_PAGE} min-h-0 flex-1`}
		>
			{outlined &&
				outline.panel !== null &&
				createPortal(
					<AboutOutline sections={sections} current={current} onGo={goTo} place="panel" />,
					outline.panel,
				)}
			{outlined && outline.hidesNarrow && (
				<AboutOutline sections={sections} current={current} onGo={goTo} place="bar" />
			)}
			<div className={ABOUT_COLUMNS}>
				<AboutTitle {...props} />
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
 * What the subject is: its name, its facts, what it is responsible for, and how it stands.
 * @param props The subject.
 * @returns The title.
 */
function AboutTitle(props: ModelAboutFrameProps): JSX.Element {
	const { head } = props;
	return (
		<header data-slot="model-about-title" className={ABOUT_TITLE}>
			<h2 className="title-figure min-w-0 [overflow-wrap:anywhere] uppercase">{head.name}</h2>
			<AboutFacts {...head} look={props.look} state={props.state} />
			{Boolean(head.lead) && (
				<p className="text-reading text-foreground/90 max-w-[68ch] text-pretty">{head.lead}</p>
			)}
			{Boolean(head.description) && (
				<p className="text-body text-muted-foreground max-w-[68ch] whitespace-pre-wrap">
					{head.description}
				</p>
			)}
			{props.children}
		</header>
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
function AboutFacts(
	props: Pick<AboutHead, "kind" | "kindName" | "path"> & {
		readonly look: KindLook;
		readonly state: TimelineEntry | undefined;
	},
): JSX.Element {
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
	aboutSection,
	moduleHead,
	ModelAboutFrame,
	shownSections,
	type AboutHead,
	type AboutPageSection,
	type AboutPlace,
};
