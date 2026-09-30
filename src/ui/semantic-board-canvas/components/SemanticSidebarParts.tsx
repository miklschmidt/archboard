// The sidebar's own small vocabulary, shared by both of its tabs: a region, a
// section under its heading, and a list of choices.
//
// One place decides the column every tab is set in (TASK-383,
// docs/design/pane-sidebar-hierarchy.md). Text starts 16 px in from either
// edge, and a choice's fill reaches 8 px past that line so the words do not
// move when it lights. A region answers one question and has a rule above it;
// the sections of one region are set apart by space alone, so a rule always
// means a new question. A heading is sentence case in the body size, never a
// small uppercase label over something else.

import { Children, type ComponentProps, type JSX, type ReactNode } from "react";

import { Button } from "@/ui/components/button";
import { cn } from "@/ui/components/class-names";

/**
 * A section's heading: the body size, semibold and quiet, so it is scanned
 * rather than read.
 * @param props The words, and where the heading sits in the tab's outline.
 * @param props.level 2 for a section of the tab, 3 for one under a title of its own.
 * @param props.children What the section holds.
 * @returns The heading.
 */
function SidebarHeading(props: {
	readonly level?: 2 | 3;
	readonly children: ReactNode;
}): JSX.Element {
	const Heading = props.level === 3 ? "h3" : "h2";
	return (
		<Heading className="text-body text-muted-foreground font-semibold">{props.children}</Heading>
	);
}

/**
 * One question the tab answers, under a rule when another region is above it.
 * @param props What it holds.
 * @param props.slot Where tests and styles find it.
 * @param props.children Its sections.
 * @returns The region, or nothing when no section has anything to show.
 */
function SidebarRegion(props: {
	readonly slot: string;
	readonly children: ReactNode;
}): JSX.Element | null {
	// A section with nothing to show is not there, so a region of such sections
	// is not either, rule and all.
	if (Children.toArray(props.children).length === 0) {
		return null;
	}
	return (
		<div
			data-slot={props.slot}
			className="border-border flex flex-col gap-4 border-t px-4 py-4 first:border-t-0"
		>
			{props.children}
		</div>
	);
}

/**
 * One section of a region: its heading, then what it holds.
 * @param props The heading and the content.
 * @param props.title The heading.
 * @param props.slot Where tests and styles find it.
 * @param props.children The content.
 * @returns The section.
 */
function SidebarSection(props: {
	readonly title: string;
	readonly slot: string;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<section data-slot={props.slot} aria-label={props.title} className="flex flex-col gap-1">
			<SidebarHeading>{props.title}</SidebarHeading>
			{props.children}
		</section>
	);
}

/**
 * A list of choices, reaching 8 px past the text column on either side so each
 * choice's fill does.
 * @param props The list's accessible name and its choices.
 * @param props.label What choosing in it does, for assistive technology.
 * @param props.slot Where tests and styles find it.
 * @param props.children The choices.
 * @returns The list.
 */
function SidebarChoices(props: {
	readonly label: string;
	readonly slot: string;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<fieldset
			data-slot={props.slot}
			aria-label={props.label}
			// A fieldset is as wide as its widest line unless told otherwise, and a
			// long name would then run out of the sidebar instead of wrapping.
			className="-mx-2 flex min-w-0 flex-col items-stretch gap-0.5 border-0 p-0"
		>
			{props.children}
		</fieldset>
	);
}

/** Inputs for one choice: the button's own, less what the list decides for it. */
type SidebarChoiceProps = Omit<
	ComponentProps<typeof Button>,
	"variant" | "size" | "type" | "className"
> & {
	/** Whether it is the one on screen. */
	readonly pressed: boolean;
};

/**
 * One choice of a list: a row the width of the list whose words start on the
 * text column, with its fill on while it is the one on screen. Its children
 * are its parts, in order: a `SidebarGlyph` when the list has one for every
 * row, a `SidebarLabel`, and a `SidebarMeta` when there is a quiet fact to add.
 * @param props The choice, and the attributes that say which one it is.
 * @returns The row.
 */
function SidebarChoice(props: SidebarChoiceProps): JSX.Element {
	const { pressed, ...rest } = props;
	return (
		<Button
			type="button"
			variant={pressed ? "secondary" : "ghost"}
			size="sm"
			aria-pressed={pressed}
			// The button's 1 px border and 7 px of padding put the words on the text
			// column, 8 px in from the list's edge; 28 px high on one line.
			className="h-auto min-h-7 w-full min-w-0 items-start justify-start gap-2 px-[7px] py-[4px] text-left whitespace-normal"
			{...rest}
		/>
	);
}

/**
 * A choice's name. A long one wraps rather than being cut off.
 * @param props The name.
 * @param props.children The name.
 * @returns The name.
 */
function SidebarLabel(props: { readonly children: ReactNode }): JSX.Element {
	return (
		<span data-slot="sidebar-label" className="min-w-0 flex-1 [overflow-wrap:anywhere]">
			{props.children}
		</span>
	);
}

/**
 * The mark before a row's words, centred in a 16 px slot on their first line,
 * so the words of every row with a mark start on one line, whatever the mark.
 * @param props The mark.
 * @param props.children The mark.
 * @returns The mark, in its slot.
 */
function SidebarGlyph(props: { readonly children: ReactNode }): JSX.Element {
	return (
		<span aria-hidden="true" className="flex h-[18px] w-4 shrink-0 items-center justify-center">
			{props.children}
		</span>
	);
}

/**
 * A quiet fact about a row: at its end on the first line, or on a line of its
 * own under the name when it is put inside the `SidebarLabel`.
 * @param props The fact.
 * @param props.technical Whether it is a technical token, set in the mono face.
 * @param props.children The fact.
 * @returns The fact.
 */
function SidebarMeta(props: {
	readonly technical?: boolean;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<span
			// On the line box of the name beside it, whatever its own size.
			className={cn(
				"text-muted-foreground shrink-0 font-normal in-data-[slot=sidebar-label]:block",
				props.technical === true ? "text-technical font-mono" : "text-body",
				"leading-[18px] in-data-[slot=sidebar-label]:leading-4",
			)}
		>
			{props.children}
		</span>
	);
}

export {
	SidebarChoice,
	SidebarChoices,
	SidebarGlyph,
	SidebarHeading,
	SidebarLabel,
	SidebarMeta,
	SidebarRegion,
	SidebarSection,
};
