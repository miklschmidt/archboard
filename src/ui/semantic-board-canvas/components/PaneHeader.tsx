// A pane's one header row, the top row of its column: where the board on
// screen sits at the start, and at the end the ways to read it and the shell's
// controls, a rule between them.
//
//   [A] ◇ Archboard › ▣ Archboard server › ◷ TASK-373      Diagram Parts … Walkthroughs 1 | [▯] [⛶] [×]
//
// The pane's letter (while two panes share the centre) and its controls are
// the shell's (`usePaneChrome`); the rest is the board's. Where the board sits
// is one breadcrumb: the boards above, each with its level's mark and each a
// way to it in this pane, then the board in bold, full ink, then the variant
// when it is not the one the name opens. The boards above are the navigator's
// own placing of the board, and after a drill-down they end with the boards the
// reader came down through, each a way back (`use-drill-places.ts`).
// The tabs switch what the area under the row shows: the picture, or one of
// the board's pages. While the row is narrow (two panes), the tabs that are not
// open keep only their marks and the middle of the breadcrumb folds behind one
// control, never the board itself. The first of the controls at the end is the
// pane's: it shows and hides the sidebar, which is the pane's too.

import {
	RiArrowLeftRightLine,
	RiArrowRightSLine,
	RiBox3Line,
	RiFlowChart,
	RiGitBranchLine,
	RiMoreLine,
	RiPlayCircleLine,
	type RemixiconComponentType,
} from "@remixicon/react";
import { useCallback, type JSX } from "react";

import { cn } from "@/ui/components/class-names";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/ui/components/dropdown-menu";
import { usePaneChrome } from "@/ui/components/PaneChrome";
import { Tabs, TabsList, TabsTrigger } from "@/ui/components/tabs";
import { LevelMark } from "@/ui/semantic-board-canvas/components/LevelMark";
import { SidebarToggle } from "@/ui/semantic-board-canvas/components/SidebarToggle";
import type { Sidebar } from "@/ui/semantic-board-canvas/hooks/use-sidebar";
import type { OfferedVariant } from "@/ui/semantic-board-canvas/lib/board-document";
import { VariantMark } from "@/ui/variant-lifecycle";

/** What the pane is read as. */
type BoardTab = "diagram" | "parts" | "relationships" | "variants" | "walkthroughs";

/** What each tab is called and drawn with: the navigator's own marks where it has one. */
const TABS: readonly {
	readonly tab: BoardTab;
	readonly label: string;
	readonly icon: RemixiconComponentType;
}[] = [
	{ tab: "diagram", label: "Diagram", icon: RiFlowChart },
	{ tab: "parts", label: "Parts", icon: RiBox3Line },
	{ tab: "relationships", label: "Relationships", icon: RiArrowLeftRightLine },
	{ tab: "variants", label: "Variants", icon: RiGitBranchLine },
	{ tab: "walkthroughs", label: "Walkthroughs", icon: RiPlayCircleLine },
];

/** A board above the one on screen, as the navigator places it or as the reader came down from it. */
interface BoardPlace {
	readonly name: string;
	/** Its level, as it states it. */
	readonly level: string | undefined;
	/** Show it in this pane. */
	readonly open: () => void;
}

/** Inputs for the header. */
interface PaneHeaderProps {
	/** The board on screen. */
	readonly name: string;
	/** Its level, when the board states one. */
	readonly level: string | undefined;
	/** The boards above it, outermost first. */
	readonly ancestors: readonly BoardPlace[];
	/** The variant on screen, when it is not the one the board's name opens. */
	readonly variant: OfferedVariant | null;
	/** Nothing the board describes is built: it has no current variant. */
	readonly unbuilt: boolean;
	/** The tab that is open. */
	readonly tab: BoardTab;
	/**
	 * The person chose a tab.
	 * @param tab The tab.
	 */
	readonly onTab: (tab: BoardTab) => void;
	/** How many of the things a tab lists, where a number says something. */
	readonly counts: Readonly<Partial<Record<BoardTab, number | undefined>>>;
	/** The pane's sidebar, which the first of the controls at the end shows and hides. */
	readonly sidebar: Sidebar;
}

/** One place of the breadcrumb, and what tells it apart from the others. */
interface KeyedPlace {
	readonly place: BoardPlace;
	readonly key: string;
}

/**
 * The places of the breadcrumb, each with a key of its own. A reader can pass
 * one board more than once on the way down, so a name does not tell its places
 * apart: the key also counts how often the name came before.
 * @param places The places, outermost first.
 * @returns The places, keyed.
 */
function keyed(places: readonly BoardPlace[]): readonly KeyedPlace[] {
	const seen = new Map<string, number>();
	return places.map((place) => {
		const before = seen.get(place.name) ?? 0;
		seen.set(place.name, before + 1);
		return { place, key: `${place.name}#${before}` };
	});
}

/**
 * The step between two places of the breadcrumb.
 * @returns The chevron.
 */
function Step(): JSX.Element {
	return (
		<RiArrowRightSLine aria-hidden="true" className="text-muted-foreground/70 size-3.5 shrink-0" />
	);
}

/**
 * One board above the one on screen: its level's mark and its name, which
 * shows it in this pane.
 * @param props The board, and whether it gives way while the header is narrow.
 * @param props.place The board.
 * @param props.middle Whether it is one of the middle places, which a narrow header folds away.
 * @returns The place, with the step after it.
 */
function Ancestor(props: { readonly place: BoardPlace; readonly middle: boolean }): JSX.Element {
	const { place } = props;
	return (
		<li
			className={cn(
				"flex min-w-0 shrink-[4] items-center gap-1",
				props.middle && "hidden @min-[880px]/pane-header:flex",
			)}
		>
			<button
				type="button"
				data-slot="pane-crumb"
				onClick={place.open}
				title={place.level === undefined ? place.name : `${place.name} · ${place.level}`}
				className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent text-control rounded-control -mx-1 flex h-7 max-w-44 min-w-0 items-center gap-1.5 px-1 font-medium"
			>
				<LevelMark level={place.level} />
				<span className="truncate">{place.name}</span>
			</button>
			<Step />
		</li>
	);
}

/**
 * The middle places, folded behind one control while the header is narrow.
 * @param props The folded places.
 * @param props.places Every board above the nearest one, the outermost included.
 * @returns The fold, or nothing when there is nothing to fold.
 */
function Folded(props: { readonly places: readonly KeyedPlace[] }): JSX.Element | null {
	if (props.places.length === 0) return null;
	return (
		<li className="flex shrink-0 items-center gap-1 @min-[880px]/pane-header:hidden">
			<DropdownMenu>
				<DropdownMenuTrigger
					aria-label="Boards above"
					className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent rounded-control flex size-7 items-center justify-center"
				>
					<RiMoreLine className="size-4" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" sideOffset={6} className="w-56">
					{props.places.map(({ place, key }) => (
						<DropdownMenuItem key={key} onClick={place.open} className="gap-2">
							<LevelMark level={place.level} />
							{place.name}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
			<Step />
		</li>
	);
}

/**
 * Where the pane is, as one breadcrumb: the boards above, each with its
 * level's mark and each a way to it; the board on screen in bold, full ink
 * with its level's mark; and the variant on screen with its lifecycle's mark
 * when it is not the one the board's name opens. The board and the variant are
 * where the pane is, not links.
 * @param props The header's inputs.
 * @returns The breadcrumb.
 */
function Breadcrumb(props: PaneHeaderProps): JSX.Element {
	const { name, level, variant } = props;
	const ancestors = keyed(props.ancestors);
	const middle = ancestors.slice(0, -1);
	return (
		<nav aria-label="Where this board sits" className="min-w-0 shrink">
			<ol className="flex min-w-0 items-center gap-1">
				<Folded places={middle} />
				{ancestors.map(({ place, key }, index) => (
					<Ancestor key={key} place={place} middle={index < ancestors.length - 1} />
				))}
				<li className="flex min-w-24 shrink items-center gap-1.5" aria-current="page">
					<LevelMark level={level} />
					<h2
						data-slot="pane-board-name"
						title={level === undefined ? name : `${name} · ${level}`}
						className="text-foreground min-w-0 truncate text-[13px] leading-[18px] font-[650]"
					>
						{name}
					</h2>
				</li>
				{variant !== null && (
					<li data-slot="board-state" className="flex min-w-0 shrink items-center gap-1">
						<Step />
						<VariantMark lifecycle={variant.lifecycle} className="ml-0.5" />
						<span className="sr-only">showing the {variant.lifecycle} </span>
						<span className="text-control truncate font-medium">{variant.name}</span>
					</li>
				)}
				{props.unbuilt && (
					<li
						data-slot="board-not-built"
						className="text-technical text-muted-foreground border-muted-foreground/60 rounded-chip ml-1.5 inline-flex h-5 shrink-0 items-center border border-dashed px-1.5 font-mono"
					>
						not built
					</li>
				)}
			</ol>
		</nav>
	);
}

/**
 * The tabs: what the area under the row shows.
 * @param props The open tab, the counts and the choice.
 * @returns The tab list.
 */
function PageTabs(props: Pick<PaneHeaderProps, "tab" | "onTab" | "counts">): JSX.Element {
	const { onTab } = props;
	const choose = useCallback(
		(value: unknown): void => {
			const entry = TABS.find((one) => one.tab === value);
			if (entry !== undefined) onTab(entry.tab);
		},
		[onTab],
	);
	return (
		<Tabs value={props.tab} onValueChange={choose} className="h-full shrink-0 gap-0">
			<TabsList
				variant="underline"
				aria-label="Ways to read this board"
				className="h-full! border-b-0"
			>
				{TABS.map((entry) => (
					<PageTab
						key={entry.tab}
						entry={entry}
						open={props.tab === entry.tab}
						count={props.counts[entry.tab]}
					/>
				))}
			</TabsList>
		</Tabs>
	);
}

/**
 * One tab: its mark, its name and how many it lists. While the header is
 * narrow, a tab that is not open keeps only its mark, named by its tooltip
 * and to assistive technology, so the breadcrumb keeps the board's name whole.
 * @param props The tab, whether it is open and its count.
 * @param props.entry The tab.
 * @param props.open Whether it is the one open.
 * @param props.count How many it lists, when a number says something.
 * @returns The tab.
 */
function PageTab(props: {
	readonly entry: (typeof TABS)[number];
	readonly open: boolean;
	readonly count: number | undefined;
}): JSX.Element {
	const { entry, open, count } = props;
	const Icon = entry.icon;
	const folds = open ? "" : "sr-only @min-[880px]/pane-header:not-sr-only";
	return (
		<TabsTrigger
			value={entry.tab}
			data-slot="board-tab"
			data-tab={entry.tab}
			title={count === undefined ? entry.label : `${entry.label} ${count}`}
			className="text-control data-active:[&_svg]:text-primary-mark gap-1.5 px-2"
		>
			<Icon aria-hidden="true" className="size-4" />
			<span className={folds}>{entry.label}</span>
			{count !== undefined && (
				<span className={folds}>
					<span
						className={cn(
							"rounded-chip flex h-4 min-w-4 items-center justify-center px-1 font-mono text-[11px] leading-none tabular-nums",
							open
								? "bg-primary-subtle text-foreground ring-primary-mark ring-1 ring-inset"
								: "bg-foreground/10 text-foreground/80",
						)}
					>
						{count}
					</span>
				</span>
			)}
		</TabsTrigger>
	);
}

/**
 * The header of one pane, and under it what the shell says about the pane.
 * @param props The board, where the reader came from and the tabs.
 * @returns The header row.
 */
function PaneHeader(props: PaneHeaderProps): JSX.Element {
	const chrome = usePaneChrome();
	return (
		<>
			<header
				data-slot="pane-header"
				className="bg-sidebar h-chrome shadow-edge-down after:bg-border @container/pane-header relative z-30 flex shrink-0 items-center pr-2 pl-4 after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px in-data-presenting:hidden"
			>
				<div className="mr-5 flex min-w-0 shrink items-center gap-3">
					{chrome.letter}
					<Breadcrumb {...props} />
				</div>
				<div className="ml-auto flex h-full shrink-0 items-center gap-2">
					<PageTabs tab={props.tab} onTab={props.onTab} counts={props.counts} />
					<span aria-hidden="true" className="bg-border h-4 w-px shrink-0" />
					<span className="flex shrink-0 items-center gap-1">
						<SidebarToggle sidebar={props.sidebar} />
						{chrome.controls}
					</span>
				</div>
			</header>
			{chrome.notice}
		</>
	);
}

export { PaneHeader, TABS, type BoardPlace, type BoardTab, type PaneHeaderProps };
