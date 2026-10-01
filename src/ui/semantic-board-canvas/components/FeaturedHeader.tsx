// The head of a pane, above its picture: where the board sits, its name in
// tall condensed capitals, what it says about itself, and the tabs that read
// it as a diagram, as parts, as relationships, as variants and as
// walkthroughs. Nothing else is in it: which version, which variant and which
// level are the navigator's to say.

import type { JSX, ReactNode } from "react";

import { cn } from "@/ui/components/class-names";

/** What the pane is read as. */
type BoardTab = "diagram" | "parts" | "relationships" | "variants" | "walkthroughs";

/** One place in the breadcrumb. */
interface Crumb {
	/** What it is called. */
	readonly name: string;
	/** Go there, when it is somewhere a reader can go; absent for the board on screen. */
	readonly open?: (() => void) | undefined;
}

/**
 * A thin line icon on a 24 grid, in the one grammar the five tabs share.
 * @param props The strokes.
 * @param props.children The icon's shapes.
 * @returns The icon.
 */
function TabIcon(props: { readonly children: ReactNode }): JSX.Element {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{props.children}
		</svg>
	);
}

/** What each tab is called and drawn with. */
const TABS: readonly {
	readonly tab: BoardTab;
	readonly label: string;
	readonly icon: ReactNode;
}[] = [
	{
		tab: "diagram",
		label: "Diagram",
		icon: (
			<TabIcon>
				<circle cx="5.5" cy="6" r="1.6" />
				<circle cx="18.5" cy="6" r="1.6" />
				<circle cx="12" cy="18" r="1.6" />
				<path d="M7 6.4l3.6 10M17 6.4l-3.6 10M7.2 6h9.6" />
			</TabIcon>
		),
	},
	{
		tab: "parts",
		label: "Parts",
		icon: (
			<TabIcon>
				<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
				<path d="M12 12l8-4.5M12 12L4 7.5M12 12v9" />
			</TabIcon>
		),
	},
	{
		tab: "relationships",
		label: "Relationships",
		icon: (
			<TabIcon>
				<circle cx="12" cy="5.5" r="2.2" />
				<circle cx="5.5" cy="18" r="2.2" />
				<circle cx="18.5" cy="18" r="2.2" />
				<path d="M10.8 7.5L6.7 16M13.2 7.5l4.1 8.5M7.7 18h8.6" />
			</TabIcon>
		),
	},
	{
		tab: "variants",
		label: "Variants",
		icon: (
			<TabIcon>
				<circle cx="6" cy="5.5" r="2" />
				<circle cx="6" cy="18.5" r="2" />
				<circle cx="18" cy="9" r="2" />
				<path d="M6 7.5v9M18 11c0 4-6 3-11 6" />
			</TabIcon>
		),
	},
	{
		tab: "walkthroughs",
		label: "Walkthroughs",
		icon: (
			<TabIcon>
				<circle cx="12" cy="12" r="9" />
				<path d="M10 8.5l5.5 3.5-5.5 3.5v-7z" />
			</TabIcon>
		),
	},
];

/** Inputs for the featured header. */
interface FeaturedHeaderProps {
	/** The boards above the one on screen, outermost first; the board itself is last. */
	readonly crumbs: readonly Crumb[];
	/** The board's name. */
	readonly name: string;
	/**
	 * The board's own statement of its scope, when it makes one. One line, so two
	 * panes' pictures start on one line whatever each board says; the whole of it
	 * is the tooltip, and the variants page.
	 */
	readonly summary: string | undefined;
	/** The tab that is open. */
	readonly tab: BoardTab;
	/**
	 * The person chose a tab.
	 * @param tab The tab.
	 */
	readonly onTab: (tab: BoardTab) => void;
	/** How many of the things a tab lists, where a number says something. */
	readonly counts: Readonly<Partial<Record<BoardTab, number | undefined>>>;
}

/**
 * The breadcrumb: the boards above, in tracked capitals, then the board.
 * @param props The crumbs.
 * @param props.crumbs The places, outermost first.
 * @returns The breadcrumb.
 */
function Breadcrumb(props: { readonly crumbs: readonly Crumb[] }): JSX.Element {
	const last = props.crumbs.length - 1;
	return (
		<nav
			aria-label="Where this board sits"
			className="text-muted-foreground flex h-5 min-w-0 items-center gap-2.5 text-[14px] leading-none tracking-[0.12em] uppercase"
		>
			{props.crumbs.map((crumb, index) => (
				<span key={`${index}-${crumb.name}`} className="flex min-w-0 items-center gap-2">
					{index > 0 && <span aria-hidden="true">/</span>}
					{index === last ? (
						<span aria-current="page" className="text-foreground truncate font-medium">
							{crumb.name}
						</span>
					) : (
						<button
							type="button"
							onClick={crumb.open}
							disabled={crumb.open === undefined}
							className="hover:text-foreground truncate rounded-[2px] uppercase"
						>
							{crumb.name}
						</button>
					)}
				</span>
			))}
		</nav>
	);
}

/**
 * The board's name in tall condensed capitals: the face is set wide and drawn
 * four fifths as wide, so the name stands tall, and what it is cut off at is
 * where the picture ends.
 * @param props The name.
 * @param props.name The board's name.
 * @returns The title.
 */
function Title(props: { readonly name: string }): JSX.Element {
	return (
		<h2
			data-slot="featured-title"
			className="font-display mt-1.5 h-14 overflow-hidden text-[56px] leading-[56px] font-medium tracking-[0.115em] whitespace-nowrap uppercase @min-[960px]/pane:h-[79px] @min-[960px]/pane:text-[79px] @min-[960px]/pane:leading-[79px]"
		>
			{/* A fifth of the width is taken off by the scale, so the box is a fifth wider. */}
			<span className="block w-[125%] origin-left scale-x-80 truncate">{props.name}</span>
		</h2>
	);
}

/**
 * One tab.
 * @param props The tab, whether it is open and how to open it.
 * @param props.entry The tab.
 * @param props.open Whether it is the one open.
 * @param props.count How many it lists, when that says something.
 * @param props.onTab Open it.
 * @returns The tab.
 */
function BoardTabButton(props: {
	readonly entry: (typeof TABS)[number];
	readonly open: boolean;
	readonly count: number | undefined;
	readonly onTab: (tab: BoardTab) => void;
}): JSX.Element {
	const { entry, open, count } = props;
	return (
		<button
			type="button"
			role="tab"
			aria-selected={open}
			data-slot="board-tab"
			data-tab={entry.tab}
			onClick={() => props.onTab(entry.tab)}
			className={cn(
				"inline-flex h-9 items-center gap-2.5 rounded-[7px] border px-4 text-[14.5px] whitespace-nowrap [&_svg]:size-[18px]",
				open
					? "border-primary/70 bg-primary/10 text-foreground [&_svg]:text-primary-text"
					: "text-foreground/75 hover:text-foreground border-transparent",
			)}
		>
			{entry.icon}
			{entry.label}
			{count !== undefined && (
				<span className="text-muted-foreground text-body -ml-0.5">{count}</span>
			)}
		</button>
	);
}

/**
 * The featured header of one pane.
 * @param props The board, where it sits and the tabs.
 * @returns The header.
 */
function FeaturedHeader(props: FeaturedHeaderProps): JSX.Element {
	return (
		<header
			data-slot="featured-header"
			className="border-border bg-sidebar @container/pane flex shrink-0 flex-col border-b px-6 pt-4 pb-3 in-data-presenting:hidden"
		>
			<Breadcrumb crumbs={props.crumbs} />
			<Title name={props.name} />
			{props.summary !== undefined && (
				<p
					title={props.summary}
					className="text-foreground/90 mt-1.5 line-clamp-1 max-w-[62em] text-[17px] leading-6"
				>
					{props.summary}
				</p>
			)}
			<div role="tablist" aria-label="Ways to read this board" className="mt-3 -ml-4 flex gap-3">
				{TABS.map((entry) => (
					<BoardTabButton
						key={entry.tab}
						entry={entry}
						open={props.tab === entry.tab}
						count={props.counts[entry.tab]}
						onTab={props.onTab}
					/>
				))}
			</div>
		</header>
	);
}

export { FeaturedHeader, TABS, type BoardTab, type Crumb, type FeaturedHeaderProps };
