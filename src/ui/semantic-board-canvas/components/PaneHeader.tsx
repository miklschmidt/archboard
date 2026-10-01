// A pane's one header row, the top row of its column: which board is on screen
// and the ways to read it, with the shell's parts of the row at either end.
//
//   [A] ‹ Archboard / ARCHBOARD SERVER  Service   Diagram Parts … Walkthroughs 1   [⛶] [×]
//
// The pane's letter (while two panes share the centre) and its controls are
// the shell's (`usePaneChrome`); the rest is the board's. The board's name is
// set in the display face, the one place a pane says what it shows; the
// navigator says where the board sits. Once the reader has followed a
// drill-down, the board it came from sits before the name as the way back.
// The tabs switch what the area under the row shows: the picture, or one of
// the board's pages. While the row is narrow (two panes), the tabs drop their
// icons, the level drops out and the way back keeps only its arrow, so the
// name and the tabs stay whole.

import {
	RiArrowLeftRightLine,
	RiArrowLeftSLine,
	RiBox3Line,
	RiFlowChart,
	RiGitBranchLine,
	RiPlayCircleLine,
	type RemixiconComponentType,
} from "@remixicon/react";
import { useCallback, type JSX } from "react";

import { usePaneChrome } from "@/ui/components/PaneChrome";
import { Tabs, TabsList, TabsTrigger } from "@/ui/components/tabs";
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

/** Inputs for the header. */
interface PaneHeaderProps {
	/** The board on screen. */
	readonly name: string;
	/** Its level, when the board states one. */
	readonly level: string | undefined;
	/** The variant on screen, when it is not the one the board's name opens. */
	readonly variant: OfferedVariant | null;
	/** Nothing the board describes is built: it has no current variant. */
	readonly unbuilt: boolean;
	/** The board the reader drilled down from, by its name; undefined on the pane's own board. */
	readonly from: string | undefined;
	/** Go back one level. */
	readonly onBack: () => void;
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
 * The way back to the board the reader drilled down from, before the name.
 * @param props The board and the way back.
 * @param props.from The board the reader came from, or undefined.
 * @param props.onBack Go back one level.
 * @returns The way back, or nothing on the pane's own board.
 */
function WayBack(props: {
	readonly from: string | undefined;
	readonly onBack: () => void;
}): JSX.Element | null {
	const { from } = props;
	if (from === undefined) return null;
	return (
		<span className="flex max-w-40 min-w-0 shrink-[4] items-center gap-1">
			<button
				type="button"
				data-slot="semantic-board-trail"
				data-board={from}
				onClick={props.onBack}
				aria-label={`Back to ${from}`}
				title={`Back to ${from}`}
				className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent text-control rounded-control -ml-1.5 flex h-7 min-w-0 items-center gap-0.5 pr-1.5 pl-0.5 font-medium"
			>
				<RiArrowLeftSLine aria-hidden="true" className="size-4 shrink-0" />
				<span className="hidden truncate @min-[880px]/pane-header:inline">{from}</span>
			</button>
			<span
				aria-hidden="true"
				className="text-muted-foreground/70 text-control hidden @min-[880px]/pane-header:inline"
			>
				/
			</span>
		</span>
	);
}

/**
 * What is on screen: the board's name, its level, the variant when it is not
 * the one the name opens, and whether anything it describes is built.
 * @param props The header's inputs.
 * @returns The identity.
 */
function Identity(props: PaneHeaderProps): JSX.Element {
	const { name, level, variant } = props;
	return (
		<div className="flex min-w-0 shrink items-center gap-2.5">
			<WayBack from={props.from} onBack={props.onBack} />
			<h2
				data-slot="pane-board-name"
				title={level === undefined ? name : `${name} · ${level}`}
				className="title-name min-w-0 truncate"
			>
				{name}
			</h2>
			{level !== undefined && (
				<span className="text-body text-muted-foreground hidden shrink-0 capitalize @min-[880px]/pane-header:inline">
					{level}
				</span>
			)}
			{variant !== null && (
				<span
					data-slot="board-state"
					className="text-control flex min-w-0 shrink items-center gap-1 font-medium"
				>
					<VariantMark lifecycle={variant.lifecycle} />
					<span className="sr-only">showing the {variant.lifecycle} </span>
					<span className="truncate">{variant.name}</span>
				</span>
			)}
			{props.unbuilt && (
				<span
					data-slot="board-not-built"
					className="text-technical text-muted-foreground border-muted-foreground/60 rounded-chip inline-flex h-5 shrink-0 items-center border border-dashed px-1.5 font-mono"
				>
					not built
				</span>
			)}
		</div>
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
				{TABS.map((entry) => {
					const count = props.counts[entry.tab];
					const Icon = entry.icon;
					return (
						<TabsTrigger
							key={entry.tab}
							value={entry.tab}
							data-slot="board-tab"
							data-tab={entry.tab}
							className="text-control data-active:[&_svg]:text-primary-text gap-1.5 px-2"
						>
							<Icon aria-hidden="true" className="hidden size-4 @min-[880px]/pane-header:block" />
							{entry.label}
							{count !== undefined && (
								<span className="text-technical text-muted-foreground font-mono">{count}</span>
							)}
						</TabsTrigger>
					);
				})}
			</TabsList>
		</Tabs>
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
				className="border-border bg-sidebar h-chrome @container/pane-header flex shrink-0 items-center gap-5 border-b pr-2 pl-4 in-data-presenting:hidden"
			>
				<div className="flex min-w-0 shrink items-center gap-3">
					{chrome.letter}
					<Identity {...props} />
				</div>
				<PageTabs tab={props.tab} onTab={props.onTab} counts={props.counts} />
				<span className="min-w-0 flex-1" />
				{chrome.controls}
			</header>
			{chrome.notice}
		</>
	);
}

export { PaneHeader, TABS, type BoardTab, type PaneHeaderProps };
