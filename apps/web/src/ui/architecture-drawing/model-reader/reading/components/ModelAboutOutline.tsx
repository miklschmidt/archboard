// The parts of a page about a subject that scrolls: an outline of its sections and the frame
// of one section. About is laid out with them. The outline stands at the top of the right panel,
// and on the page itself only where the panel hides.

import type { RemixiconComponentType } from "@remixicon/react";
import { createContext, useCallback, useId, type JSX, type ReactNode } from "react";

/** The page that scrolls, and that its sections are measured against. */
const ABOUT_PAGE =
	"relative z-0 overflow-x-hidden overflow-y-auto outline-none [container:about/size]";

/** The column of the page. */
const ABOUT_COLUMNS =
	"mx-auto flex max-w-[1096px] flex-col px-6 pt-8 pb-16 wrap-break-word @min-[1040px]/about:px-10";

/** Where the name of the subject stands in that column. */
const ABOUT_TITLE = "flex min-w-0 flex-col gap-3 pb-10";

/** Where the sections stand in that column. */
const ABOUT_SHEET = "@container/sheet flex min-w-0 flex-col gap-14";

/** Where About puts its outline. */
interface AboutOutlinePlace {
	/** The slot at the top of the right panel, once the panel is there. */
	readonly panel: HTMLElement | null;
	/**
	 * Whether the panel hides in a narrow reading, as it does while nothing is selected. The page
	 * then shows the outline itself, as a bar over its sections.
	 */
	readonly hidesNarrow: boolean;
}

/** Where About puts its outline, which the reading that holds the page and the panel provides. */
const AboutOutlineContext = createContext<AboutOutlinePlace>({ panel: null, hidesNarrow: true });

/** One section of a page, as the outline lists it. */
interface AboutSection<Key extends string = string> {
	readonly key: Key;
	readonly label: string;
	readonly icon: RemixiconComponentType;
	/** How many it lists, when it is a list. */
	readonly count?: number | undefined;
}

/**
 * Bring a section's heading to the top of the page, clear of the outline's bar
 * while the page has one, and give the heading focus, so the keyboard reads
 * on from there.
 * @param page The page that scrolls.
 * @param key The section.
 * @param reducedMotion Whether the reader asked for no motion.
 */
function scrollToSection(page: HTMLElement, key: string, reducedMotion: boolean): void {
	const section = page.querySelector<HTMLElement>(`[data-about-section="${key}"]`);
	if (section === null) return;
	const top = section.getBoundingClientRect().top - page.getBoundingClientRect().top;
	const margin = Number.parseFloat(getComputedStyle(section).scrollMarginTop);
	page.scrollTo({
		top: page.scrollTop + top - (Number.isFinite(margin) ? margin : 0),
		behavior: reducedMotion ? "instant" : "smooth",
	});
	section.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
}

/** How the outline lies in each of its places. */
const OUTLINE_LOOK = {
	// A column of rows whose words stand on the panel's 16px edges, as its other rows' do.
	panel: { nav: "-mx-2", list: "flex flex-col" },
	// A bar that stays over the sections. A bar too narrow for every entry scrolls sideways rather
	// than grow taller, so a jump still lands clear of it. It shows only in a reading too narrow for
	// the panel.
	bar: {
		nav: "bg-background border-border sticky top-0 z-10 -mx-6 mb-8 border-b @min-[900px]/reading:hidden",
		list: "flex gap-1 overflow-x-auto px-5 py-1.5",
	},
} as const;

/**
 * The outline: each section with its count, which goes to it, and the mark on
 * the one being read.
 * @param props The sections, the one being read, the way to go to one and where it lies.
 * @param props.sections The sections.
 * @param props.current The key of the one being read, or null.
 * @param props.onGo Go to a section.
 * @param props.place At the top of the right panel, or in a bar over the sections.
 * @returns The outline, or nothing while there are no sections.
 */
function AboutOutline<Key extends string>(props: {
	readonly sections: readonly AboutSection<Key>[];
	readonly current: string | null;
	readonly onGo: (key: Key) => void;
	readonly place: keyof typeof OUTLINE_LOOK;
}): JSX.Element | null {
	if (props.sections.length === 0) return null;
	const look = OUTLINE_LOOK[props.place];
	return (
		<nav
			aria-label="Sections of this page"
			data-slot="about-outline"
			data-place={props.place}
			className={look.nav}
		>
			<ol className={look.list}>
				{props.sections.map((section) => (
					<OutlineEntry
						key={section.key}
						section={section}
						current={props.current === section.key}
						onGo={props.onGo}
					/>
				))}
			</ol>
		</nav>
	);
}

/**
 * One section in the outline: its mark, its name and its count.
 * @param props The section, whether it is being read and the way to go to it.
 * @param props.section The section.
 * @param props.current Whether it is the one being read.
 * @param props.onGo Go to a section.
 * @returns The entry.
 */
function OutlineEntry<Key extends string>(props: {
	readonly section: AboutSection<Key>;
	readonly current: boolean;
	readonly onGo: (key: Key) => void;
}): JSX.Element {
	const { section, current, onGo } = props;
	const Icon = section.icon;
	const go = useCallback((): void => {
		onGo(section.key);
	}, [onGo, section.key]);
	return (
		<li>
			<button
				type="button"
				aria-current={current ? "location" : undefined}
				data-slot="about-outline-entry"
				data-section={section.key}
				onClick={go}
				className="text-control text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=location]:text-foreground aria-[current=location]:bg-muted rounded-control relative flex h-8 w-full items-center gap-2 px-2 whitespace-nowrap"
			>
				<Icon aria-hidden="true" className="size-4 shrink-0" />
				<span className="flex-1 text-left">{section.label}</span>
				{section.count !== undefined && (
					<span className="text-technical text-muted-foreground font-mono tabular-nums">
						{section.count}
					</span>
				)}
			</button>
		</li>
	);
}

/**
 * One section: its heading, which a jump from the outline gives focus to, and
 * what it lists. The last section is as tall as the page's room, so a jump
 * brings any section to the top.
 * @param props The section and what it lists.
 * @param props.section The section.
 * @param props.children What it lists.
 * @returns The section.
 */
function AboutSectionFrame(props: {
	readonly section: AboutSection;
	readonly children: ReactNode;
}): JSX.Element {
	const heading = useId();
	return (
		<section
			aria-labelledby={heading}
			data-about-section={props.section.key}
			className="flex min-w-0 scroll-mt-16 flex-col gap-4 last:min-h-[calc(100cqh-6rem)] @min-[900px]/reading:scroll-mt-8"
		>
			<h3 id={heading} tabIndex={-1} className="text-section outline-none">
				{props.section.label}
			</h3>
			{props.children}
		</section>
	);
}

export {
	ABOUT_COLUMNS,
	ABOUT_PAGE,
	ABOUT_SHEET,
	ABOUT_TITLE,
	AboutOutline,
	AboutOutlineContext,
	AboutSectionFrame,
	scrollToSection,
	type AboutOutlinePlace,
	type AboutSection,
};
