// The About page: everything the board says about itself, on one page laid
// over the picture while its tab is open (TASK-475). It is for reading a board
// and finding one's way in it, in the order a reader asks
// (docs/design/pane-sidebar-hierarchy.md): what the board is, how its author
// reads it, what it holds, how that is wired, and how it has changed.
//
// The title says what the board is: its name, its level, the variant on screen
// with where it stands, and the variant's own summary. Then come the sections,
// each only when it has something to show: the walkthroughs step by step, the
// parts in their containment, the relationships, and the variants. An outline
// beside them lists each section with its count, goes to one, and marks the one
// being read. While the page is narrow, as it is in a pane that shares the
// centre, the outline stands in a bar over the sections instead.
//
// The page reads the board document the pane already holds, and writes
// nothing (ADR 0023). Choosing a row picks its subject in the pane, so the
// sidebar explains it; a variant is read in the pane; a step presents its
// walkthrough over the picture.

import {
	RiArrowLeftRightLine,
	RiBox3Line,
	RiGitBranchLine,
	RiPlayCircleLine,
} from "@remixicon/react";
import { useCallback, useMemo, useState, type JSX } from "react";

import {
	AboutOutline,
	AboutSectionFrame,
	ABOUT_COLUMNS,
	ABOUT_PAGE,
	ABOUT_SHEET,
	ABOUT_TITLE,
	scrollToSection,
	type AboutSection,
} from "#ui/components/semantic-board-canvas/AboutOutline.tsx";
import {
	AboutParts,
	AboutRelationships,
} from "#ui/components/semantic-board-canvas/AboutParts.tsx";
import {
	AboutVariants,
	VariantStanding,
} from "#ui/components/semantic-board-canvas/AboutVariants.tsx";
import { AboutWalkthroughs } from "#ui/components/semantic-board-canvas/AboutWalkthroughs.tsx";
import { LevelMark } from "#ui/components/semantic-board-canvas/LevelMark.tsx";
import { usePaneVault } from "#ui/hooks/semantic-board-canvas/use-pane-vault.ts";
import { useSectionSpy } from "#ui/hooks/semantic-board-canvas/use-section-spy.ts";
import type { PagePlace } from "#ui/hooks/semantic-board-canvas/use-stage-tab.ts";
import type { VariantContent } from "@archboard/board/content";
import type { VariantReading } from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import type { GroupNames } from "#ui/rules/semantic-board-canvas/board/groups.ts";
import type { KindLook } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";
import type { WalkthroughNarration } from "#ui/rules/semantic-board-canvas/walkthrough/narration.ts";
import {
	variantTimeline,
	type VariantTimeline,
} from "#ui/rules/semantic-board-canvas/board/variant-timeline.ts";

/** Inputs for the page. */
interface AboutPageProps {
	/** The board on screen, by name. */
	readonly board: string;
	/** What the board says about itself, or null while it has not arrived. */
	readonly reading: VariantReading | null;
	readonly look: KindLook;
	/** What the vault calls each group, and its colour. */
	readonly groups: GroupNames;
	/** What is picked out, or null. */
	readonly selection: string | null;
	/**
	 * Pick a subject out, or let it go.
	 * @param id The semantic id, or null.
	 */
	readonly onPick: (id: string | null) => void;
	/**
	 * Pick a subject out and show it on the diagram.
	 * @param id The semantic id.
	 */
	readonly onShow: (id: string) => void;
	/** Read another variant in the pane, or the current one with null; undefined when the pane cannot. */
	readonly onVariant: ((variant: string | null) => void) | undefined;
	/**
	 * Present a walkthrough from one of its steps.
	 * @param walkthrough The walkthrough's id.
	 * @param beat Which step, counted from zero.
	 */
	readonly onPresent: (walkthrough: string, beat: number) => void;
	/** Narrating a walkthrough aloud, when the shell can. */
	readonly narration: WalkthroughNarration | undefined;
	/** Whether the reader asked for no motion, which lands a jump to a section at once. */
	readonly reducedMotion: boolean;
	/** Where the page was scrolled to on this board, which it opens at and keeps. */
	readonly place: PagePlace;
}

/** The sections of the page. */
type SectionKey = "walkthroughs" | "parts" | "relationships" | "variants";

/**
 * The About page.
 * @param props The board, what it says about itself and what a reader can do.
 * @returns The page.
 */
function AboutPage(props: AboutPageProps): JSX.Element {
	const { reading, reducedMotion, place } = props;
	const [page, setPage] = useState<HTMLElement | null>(null);
	// The page goes while the diagram is read, and opens again where the reader
	// left it, before it is painted.
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
	const sections = useMemo(() => sectionsOf(reading), [reading]);
	const keys = useMemo(() => sections.map((section) => section.key), [sections]);
	const current = useSectionSpy(page, keys);
	const timeline = useMemo(
		() =>
			reading === null
				? null
				: variantTimeline(reading.variants, reading.adoptions, reading.shelvings),
		[reading],
	);
	const goTo = useCallback(
		(key: SectionKey): void => {
			if (page !== null) scrollToSection(page, key, reducedMotion);
		},
		[page, reducedMotion],
	);
	return (
		<section
			ref={attach}
			role="tabpanel"
			aria-label={`About ${props.board}`}
			aria-busy={reading === null || undefined}
			data-slot="board-page"
			data-tab="about"
			onScroll={keep}
			className={`bg-background absolute inset-0 z-20 ${ABOUT_PAGE}`}
		>
			<div className={ABOUT_COLUMNS}>
				<AboutTitle board={props.board} reading={reading} timeline={timeline} />
				<AboutOutline sections={sections} current={current} onGo={goTo} />
				{reading !== null && timeline !== null && (
					<div className={ABOUT_SHEET}>
						{sections.map((section) => (
							<AboutSectionFrame key={section.key} section={section}>
								<SectionBody
									{...props}
									reading={reading}
									timeline={timeline}
									section={section.key}
								/>
							</AboutSectionFrame>
						))}
					</div>
				)}
			</div>
		</section>
	);
}

/** Each section, in the order a reader asks, with its mark: the marks of the pages it replaced. */
const SECTIONS: readonly Omit<AboutSection<SectionKey>, "count">[] = [
	{ key: "walkthroughs", label: "Walkthroughs", icon: RiPlayCircleLine },
	{ key: "parts", label: "Parts", icon: RiBox3Line },
	{ key: "relationships", label: "Relationships", icon: RiArrowLeftRightLine },
	{ key: "variants", label: "Variants", icon: RiGitBranchLine },
];

/**
 * The sections the board has something to show in, in the order a reader asks.
 * @param reading What the board says about itself, or null while it has not arrived.
 * @returns The sections, with what each lists.
 */
function sectionsOf(reading: VariantReading | null): readonly AboutSection<SectionKey>[] {
	if (reading === null) return [];
	const counts = countsOf(reading);
	return SECTIONS.map((section) => ({ ...section, count: counts[section.key] })).filter(
		(section) => section.count > 0,
	);
}

/**
 * How many each section lists. A board with no such variant has none of the
 * variant's walkthroughs, parts or relationships to list.
 * @param reading What the board says about itself.
 * @returns The counts.
 */
function countsOf(reading: VariantReading): Readonly<Record<SectionKey, number>> {
	const { nodes, edges } = reading.variant?.content ?? { nodes: [], edges: [] };
	return {
		walkthroughs: reading.walkthroughs.length,
		parts: nodes.length,
		relationships: edges.length,
		variants: reading.variants.length,
	};
}

/**
 * What the board is: its name, its level, the variant on screen and where it
 * stands, and what the variant says it is about. While the board has not
 * arrived it says so, and when the board has no such variant it says what to
 * do.
 * @param props The board, what it says about itself and its variants.
 * @param props.board The board on screen, by name.
 * @param props.reading What the board says about itself, or null.
 * @param props.timeline Its variants on their timeline, or null.
 * @returns The title.
 */
function AboutTitle(props: {
	readonly board: string;
	readonly reading: VariantReading | null;
	readonly timeline: VariantTimeline | null;
}): JSX.Element {
	const { reading, timeline } = props;
	return (
		<header data-slot="about-title" className={ABOUT_TITLE}>
			<h2 className="title-figure min-w-0 [overflow-wrap:anywhere] uppercase">{props.board}</h2>
			{reading === null || timeline === null ? (
				<p className="text-control text-muted-foreground font-normal">Reading the board…</p>
			) : (
				<TitleFacts reading={reading} timeline={timeline} />
			)}
		</header>
	);
}

/**
 * What the title says once the board has arrived: its level, the variant on
 * screen and where it stands, the variant's summary, and what to do when the
 * board has no such variant.
 * @param props What the board says about itself and its variants.
 * @param props.reading What the board says about itself.
 * @param props.timeline Its variants on their timeline.
 * @returns The facts.
 */
function TitleFacts(props: {
	readonly reading: VariantReading;
	readonly timeline: VariantTimeline;
}): JSX.Element {
	const { reading } = props;
	const { showing } = reading;
	const vault = usePaneVault();
	const entry = props.timeline.entries.find((one) => one.variant.id === showing?.id);
	return (
		<>
			<p className="text-control flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1">
				<span className="flex items-center gap-1.5">
					<LevelMark level={reading.level} vault={vault} />
					<span className="text-foreground">{levelWords(reading.level)}</span>
				</span>
				{entry !== undefined && <VariantStanding entry={entry} />}
			</p>
			{showing?.summary !== undefined && (
				<p className="text-reading text-foreground/90 max-w-[68ch] text-pretty">
					{showing.summary}
				</p>
			)}
			{reading.variant === null && (
				<p className="text-control font-normal">
					The board has no such variant. Choose one of its variants below to read it.
				</p>
			)}
		</>
	);
}

/**
 * What a board's level is called in its title.
 * @param level The level, as the board states it.
 * @returns The words.
 */
function levelWords(level: string): string {
	return `${level.charAt(0).toUpperCase()}${level.slice(1)} board`;
}

/** What one section lists from. */
interface SectionBodyProps extends AboutPageProps {
	readonly reading: VariantReading;
	readonly timeline: VariantTimeline;
	readonly section: SectionKey;
}

/**
 * What one section lists.
 * @param props The page's inputs, the board's reading and timeline, and the section.
 * @returns The section's list.
 */
function SectionBody(props: SectionBodyProps): JSX.Element {
	const { reading, section } = props;
	const content = reading.variant?.content;
	if (section === "variants" || content === undefined) {
		return (
			<AboutVariants
				timeline={props.timeline}
				showing={reading.variant?.id ?? null}
				onChoose={props.onVariant}
			/>
		);
	}
	return <ContentBody {...props} content={content} />;
}

/**
 * What a section of the variant's own content lists: its walkthroughs, its
 * parts or its relationships.
 * @param props The page's inputs, the variant's content and the section.
 * @returns The section's list.
 */
function ContentBody(props: SectionBodyProps & { readonly content: VariantContent }): JSX.Element {
	const { reading, section, content } = props;
	if (section === "walkthroughs") {
		return (
			<AboutWalkthroughs
				reading={reading}
				look={props.look}
				selection={props.selection}
				onPick={props.onPick}
				onPresent={props.onPresent}
				narration={props.narration}
			/>
		);
	}
	const list = {
		content,
		look: props.look,
		selection: props.selection,
		onPick: props.onPick,
		onShow: props.onShow,
	};
	return section === "parts" ? (
		<AboutParts {...list} groups={props.groups} />
	) : (
		<AboutRelationships {...list} />
	);
}

export { AboutPage, type AboutPageProps };
