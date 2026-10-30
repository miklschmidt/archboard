// The parts of a page about a subject that scrolls: an outline of its sections and the frame
// of one section. Both About pages are laid out with them.

import type { RemixiconComponentType } from "@remixicon/react";
import { useCallback, useId, type JSX, type ReactNode } from "react";

/** The page that scrolls, and that its sections are measured against. */
const ABOUT_PAGE = "overflow-x-hidden overflow-y-auto [container:about/size]";

/** The column of the page, with the outline beside the sections while there is room. */
const ABOUT_COLUMNS =
	"mx-auto grid max-w-[1320px] grid-cols-1 gap-x-12 px-6 pt-8 pb-16 wrap-break-word @min-[1040px]/about:grid-cols-[176px_minmax(0,1fr)] @min-[1040px]/about:px-10";

/** Where the name of the subject stands in those columns. */
const ABOUT_TITLE =
	"flex min-w-0 flex-col gap-3 pb-10 @min-[1040px]/about:col-start-2 @min-[1040px]/about:row-start-1";

/** Where the sections stand in those columns. */
const ABOUT_SHEET =
	"@container/sheet flex min-w-0 flex-col gap-14 @min-[1040px]/about:col-start-2 @min-[1040px]/about:row-start-2";

/** One section of a page, as the outline lists it. */
interface AboutSection<Key extends string = string> {
	readonly key: Key;
	readonly label: string;
	readonly icon: RemixiconComponentType;
	/** How many it lists. */
	readonly count: number;
}

/**
 * Bring a section's heading to the top of the page, clear of the outline's bar
 * while the page is narrow, and give the heading focus, so the keyboard reads
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

/**
 * The outline: each section with its count, which goes to it, and the mark on
 * the one being read. Beside the sections while the page is wide, and in a bar
 * that stays over them while it is narrow. A bar too narrow for every entry
 * scrolls sideways rather than grow taller, so a jump still lands clear of it.
 * @param props The sections, the one being read and the way to go to one.
 * @param props.sections The sections.
 * @param props.current The key of the one being read, or null.
 * @param props.onGo Go to a section.
 * @returns The outline, or nothing while there are no sections.
 */
function AboutOutline<Key extends string>(props: {
	readonly sections: readonly AboutSection<Key>[];
	readonly current: string | null;
	readonly onGo: (key: Key) => void;
}): JSX.Element | null {
	if (props.sections.length === 0) return null;
	return (
		<nav
			aria-label="Sections of this page"
			data-slot="about-outline"
			className="bg-background border-border sticky top-0 z-10 -mx-6 mb-8 border-b @min-[1040px]/about:top-8 @min-[1040px]/about:col-start-1 @min-[1040px]/about:row-span-2 @min-[1040px]/about:row-start-1 @min-[1040px]/about:mx-0 @min-[1040px]/about:mb-0 @min-[1040px]/about:self-start @min-[1040px]/about:border-0"
		>
			<ol className="flex [scrollbar-width:thin] gap-1 overflow-x-auto px-5 py-1.5 @min-[1040px]/about:flex-col @min-[1040px]/about:overflow-visible @min-[1040px]/about:p-0">
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
				className="text-control text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=location]:text-foreground rounded-control relative flex h-8 w-full items-center gap-2 px-2 whitespace-nowrap"
			>
				{current && (
					<span
						aria-hidden="true"
						className="bg-primary-mark absolute inset-x-2 -bottom-1.5 h-0.5 rounded-full @min-[1040px]/about:inset-x-auto @min-[1040px]/about:inset-y-1.5 @min-[1040px]/about:left-0 @min-[1040px]/about:h-auto @min-[1040px]/about:w-0.5"
					/>
				)}
				<Icon aria-hidden="true" className="size-4 shrink-0" />
				<span className="flex-1 text-left">{section.label}</span>
				<span className="text-technical text-muted-foreground font-mono tabular-nums">
					{section.count}
				</span>
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
			className="flex min-w-0 scroll-mt-16 flex-col gap-4 last:min-h-[calc(100cqh-6rem)] @min-[1040px]/about:scroll-mt-8"
		>
			<h3 id={heading} tabIndex={-1} className="text-subtitle font-semibold outline-none">
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
	AboutSectionFrame,
	scrollToSection,
	type AboutSection,
};
