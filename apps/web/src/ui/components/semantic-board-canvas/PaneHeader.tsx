// A pane's one header row, the top row of its column: where the board on
// screen sits at the start, and at the end the ways to read it and the shell's
// controls, a rule between them.
//
//   [A] ◇ Archboard › ▣ Archboard server › ◷ TASK-373          Diagram About | [▯] [⛶] [×]
//
// The pane's letter (while two panes share the centre) and its controls are
// the shell's (`usePaneChrome`); the rest is the board's. Where the board sits
// is one breadcrumb: the boards above, each with its level's mark and each a
// way to it in this pane, then the board in bold, full ink, then the variant
// when it is not the one the name opens. The boards above are the navigator's
// own placing of the board, and after a drill-down they end with the boards the
// reader came down through, each a way back (`use-drill-places.ts`).
// The two tabs switch what the area under the row shows: the picture, or the
// About page, which is everything the board says about itself on one page
// (TASK-475). While the row is narrow (two panes), the tab that is not open
// keeps only its mark and the middle of the breadcrumb folds behind one
// control, never the board itself. The first of the controls at the end is the
// pane's: it shows and hides the sidebar, which is the pane's too. A pane the
// server has pointed at no board keeps the same row: it says so, and keeps the
// shell's letter, controls and notice.

import {
	RiArrowRightSLine,
	RiFileTextLine,
	RiFlowChart,
	RiMoreLine,
	type RemixiconComponentType,
} from "@remixicon/react";
import { useCallback, type JSX, type ReactNode } from "react";

import { cn, DropdownMenu, RepositoryName, Tabs } from "@archboard/ui-kit/components";
import { usePaneChrome } from "#ui/hooks/semantic-board-canvas/use-pane-chrome.ts";
import {
	PaneHeaderRow as HeaderRow,
	PaneHeaderStart as HeaderStart,
	PaneHeaderEnd as HeaderEnd,
} from "#ui/components/semantic-board-canvas/PaneHeaderFrame.tsx";
import { LevelMark } from "#ui/components/semantic-board-canvas/LevelMark.tsx";
import { usePaneVault } from "#ui/hooks/semantic-board-canvas/use-pane-vault.ts";
import { SidebarToggle } from "#ui/components/semantic-board-canvas/SidebarToggle.tsx";
import type { Sidebar } from "#ui/hooks/semantic-board-canvas/use-sidebar.ts";
import type { OfferedVariant } from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import { VariantMark } from "#ui/components/variant-lifecycle/VariantMark.tsx";

/** What the pane is read as: the picture, or the About page. */
type BoardTab = "diagram" | "about";

/** What each tab is called and drawn with. */
const TABS: readonly {
	readonly tab: BoardTab;
	readonly label: string;
	readonly icon: RemixiconComponentType;
}[] = [
	{ tab: "diagram", label: "Diagram", icon: RiFlowChart },
	{ tab: "about", label: "About", icon: RiFileTextLine },
];

/** A board above the one on screen, as the navigator places it or as the reader came down from it. */
interface BoardPlace {
	readonly name: string;
	/** Its level, as it states it. */
	readonly level: string | undefined;
	/** Show it in this pane. */
	readonly open: () => void;
	/** The vault it is in, when it is not the pane's own (ADR 0050). */
	readonly vault?: string;
	/** Its repository, named where a trail across repositories enters it. */
	readonly repository?: string;
}

/**
 * The repository a crumb names, muted, where a trail across repositories enters
 * it: on GitHub by its owner and name beside GitHub's mark. It gives way before
 * the board's name does, its whole name shows on hover, and assistive
 * technology hears it whole and apart from the board's name.
 * @param props The repository.
 * @param props.repository Its name, or undefined when the crumb names none.
 * @returns The name, or nothing.
 */
function RepositoryOf(props: { readonly repository: string | undefined }): JSX.Element | null {
	if (props.repository === undefined) return null;
	return (
		<>
			<RepositoryName
				identity={props.repository}
				data-slot="pane-crumb-repository"
				className="text-muted-foreground/80 text-control max-w-48 min-w-0 shrink-[8] font-normal"
			/>
			<span className="sr-only">, </span>
		</>
	);
}

/** Inputs for the header. */
interface PaneHeaderProps {
	/** A board-specific control between the breadcrumb and the page tabs. */
	readonly children?: ReactNode;
	/** The board on screen. */
	readonly name: string;
	/** Its level, when the board states one. */
	readonly level: string | undefined;
	/** Its repository, named where a trail across repositories enters it. */
	readonly repository?: string;
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
	const paneVault = usePaneVault();
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
				className={cn(
					"text-muted-foreground hover:text-foreground hover:bg-sidebar-accent text-control rounded-control -mx-1 flex h-7 min-w-0 items-center gap-1.5 px-1 font-medium",
					// A crumb that names its repository keeps room for the board's name too.
					place.repository === undefined ? "max-w-44" : "max-w-96",
				)}
			>
				<RepositoryOf repository={place.repository} />
				<LevelMark level={place.level} vault={place.vault ?? paneVault} />
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
	const paneVault = usePaneVault();
	if (props.places.length === 0) return null;
	return (
		<li className="flex shrink-0 items-center gap-1 @min-[880px]/pane-header:hidden">
			<DropdownMenu>
				<DropdownMenu.Trigger
					aria-label="Boards above"
					className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent rounded-control flex size-7 items-center justify-center"
				>
					<RiMoreLine className="size-4" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start" sideOffset={6} className="w-56">
					{props.places.map(({ place, key }) => (
						<DropdownMenu.Item key={key} onClick={place.open} className="gap-2">
							<RepositoryOf repository={place.repository} />
							<LevelMark level={place.level} vault={place.vault ?? paneVault} />
							{place.name}
						</DropdownMenu.Item>
					))}
				</DropdownMenu.Content>
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
	const vault = usePaneVault();
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
					<RepositoryOf repository={props.repository} />
					<LevelMark level={level} vault={vault} />
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
 * @param props The open tab and the choice.
 * @returns The tab list.
 */
function PageTabs(props: Pick<PaneHeaderProps, "tab" | "onTab">): JSX.Element {
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
			<Tabs.List
				variant="underline"
				aria-label="Ways to read this board"
				className="h-full! border-b-0"
			>
				{TABS.map((entry) => (
					<PageTab key={entry.tab} entry={entry} open={props.tab === entry.tab} />
				))}
			</Tabs.List>
		</Tabs>
	);
}

/**
 * One tab: its mark and its name. While the header is narrow, a tab that is
 * not open keeps only its mark, named by its tooltip and to assistive
 * technology, so the breadcrumb keeps the board's name whole.
 *
 * The open tab's line lies on the header's rule, which is the header's own last
 * row, so it ends at the header's edge. A line that hung below the edge, as one
 * on a tab list's rule does, would lie under the sidebar's column, which starts
 * at that edge and is drawn after the header (TASK-476).
 * @param props The tab, and whether it is open.
 * @param props.entry The tab.
 * @param props.open Whether it is the one open.
 * @returns The tab.
 */
function PageTab(props: {
	readonly entry: (typeof TABS)[number];
	readonly open: boolean;
}): JSX.Element {
	const { entry, open } = props;
	const Icon = entry.icon;
	return (
		<Tabs.Trigger
			value={entry.tab}
			data-slot="board-tab"
			data-tab={entry.tab}
			title={entry.label}
			className="text-control data-active:[&_svg]:text-primary-mark gap-1.5 px-2 group-data-[variant=underline]/tabs-list:after:bottom-0!"
		>
			<Icon aria-hidden="true" className="size-4" />
			<span className={open ? "" : "sr-only @min-[880px]/pane-header:not-sr-only"}>
				{entry.label}
			</span>
		</Tabs.Trigger>
	);
}

/**
 * The header of one pane, and under it what the shell says about the pane.
 * @param props The board, where the reader came from and the tabs.
 * @returns The header row.
 */
function PaneHeader(props: PaneHeaderProps): JSX.Element {
	const { controls } = usePaneChrome();
	return (
		<HeaderRow>
			<HeaderStart>
				<Breadcrumb {...props} />
			</HeaderStart>
			<HeaderEnd>
				{props.children}
				<PageTabs tab={props.tab} onTab={props.onTab} />
				<span aria-hidden="true" className="bg-border h-4 w-px shrink-0" />
				<span className="flex shrink-0 items-center gap-1">
					<SidebarToggle sidebar={props.sidebar} />
					{controls}
				</span>
			</HeaderEnd>
		</HeaderRow>
	);
}

/**
 * The header of a pane the server has pointed at no board, as in a vault with
 * none: it says so, and keeps the shell's controls and what the shell says.
 * @returns The header row.
 */
function NoBoardHeader(): JSX.Element {
	const { controls } = usePaneChrome();
	return (
		<HeaderRow>
			<HeaderStart>
				<h2 className="text-muted-foreground truncate text-[13px] leading-[18px] font-[650]">
					No board
				</h2>
			</HeaderStart>
			<HeaderEnd>{controls}</HeaderEnd>
		</HeaderRow>
	);
}

export { NoBoardHeader, PaneHeader, TABS, type BoardPlace, type BoardTab, type PaneHeaderProps };
