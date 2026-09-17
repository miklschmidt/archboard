// The one column beside a semantic diagram: the board, and whatever is selected
// on it.
//
// One column rather than a key on one side and details on the other, and at
// one width whichever tab is open, because the pane refits its picture when it
// changes size: a column that came and went with a pick would move the diagram
// under the pointer that picked. Only collapsing and expanding it changes the
// pane's width, and that is the person asking for the room.
//
// Its width is the shell's, so the pane a drawing's fit is measured against is
// the pane a reader actually has. A pane presented fullscreen is the picture
// alone, so the sidebar steps out of it for as long as the presentation lasts;
// so does a presented walkthrough, which is the picture and its caption.

import {
	RiCloseLine,
	RiCursorLine,
	RiNodeTree,
	RiSidebarFoldLine,
	RiSidebarUnfoldLine,
} from "@remixicon/react";
import { useCallback, type CSSProperties, type JSX, type ReactNode } from "react";

import { SIDEBAR_WIDTH } from "@/shared/shell-geometry/index";
import { Button } from "@/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/components/tabs";
import type { Sidebar, SidebarTab } from "@/ui/semantic-board-canvas/hooks/use-sidebar";

/** Inputs for the sidebar. */
interface SemanticSidebarProps {
	/** Which tab is open, whether the sidebar is collapsed, and how to change either. */
	readonly sidebar: Sidebar;
	/** The tabs' panels, each a `SidebarPanel`. */
	readonly children: ReactNode;
	/** Let go of the selection, offered on the selection tab while there is one; null otherwise. */
	readonly onClearSelection: (() => void) | null;
}

/**
 * What one tab shows.
 * @param props The tab and its content.
 * @param props.tab Which tab.
 * @param props.children What it shows.
 * @returns The panel.
 */
function SidebarPanel(props: {
	readonly tab: SidebarTab;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<TabsContent
			value={props.tab}
			className="flex min-h-0 flex-col overflow-x-hidden overflow-y-auto"
		>
			{props.children}
		</TabsContent>
	);
}

/** The sidebar's width while open. */
const OPEN_STYLE: CSSProperties = { width: SIDEBAR_WIDTH };

/** What each tab is called and drawn with. */
const TABS: readonly {
	readonly tab: SidebarTab;
	readonly label: string;
	readonly icon: ReactNode;
}[] = [
	{ tab: "board", label: "Board", icon: <RiNodeTree /> },
	{ tab: "selection", label: "Selection", icon: <RiCursorLine /> },
];

/**
 * One tab's icon while the sidebar is collapsed, which opens it.
 * @param props The tab, whether it is the open one, and the sidebar.
 * @param props.entry The tab.
 * @param props.sidebar The sidebar.
 * @returns The button.
 */
function RailButton(props: {
	readonly entry: (typeof TABS)[number];
	readonly sidebar: Sidebar;
}): JSX.Element {
	const { entry, sidebar } = props;
	const { open } = sidebar;
	const choose = useCallback((): void => {
		open(entry.tab);
	}, [open, entry.tab]);
	return (
		<Button
			type="button"
			variant={sidebar.tab === entry.tab ? "secondary" : "ghost"}
			size="icon-sm"
			aria-label={`Open ${entry.label.toLowerCase()}`}
			aria-pressed={sidebar.tab === entry.tab}
			data-slot="semantic-sidebar-rail-tab"
			data-tab={entry.tab}
			onClick={choose}
		>
			{entry.icon}
		</Button>
	);
}

/**
 * The sidebar folded to its tab icons.
 * @param props The sidebar.
 * @param props.sidebar Its state and controls.
 * @returns The rail.
 */
function SidebarRail(props: { readonly sidebar: Sidebar }): JSX.Element {
	const { sidebar } = props;
	const { open, tab } = sidebar;
	const expand = useCallback((): void => {
		open(tab);
	}, [open, tab]);
	return (
		<div className="flex flex-col items-center gap-1 py-2">
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label="Expand sidebar"
				data-slot="semantic-sidebar-toggle"
				onClick={expand}
			>
				<RiSidebarUnfoldLine />
			</Button>
			{TABS.map((entry) => (
				<RailButton key={entry.tab} entry={entry} sidebar={sidebar} />
			))}
		</div>
	);
}

/**
 * What the selection tab says while nothing is selected.
 * @returns The sentence.
 */
function NothingSelected(): JSX.Element {
	return (
		<p className="text-muted-foreground text-body px-4 py-4">
			Pick something out of the diagram to see what the board says about it.
		</p>
	);
}

/**
 * The row above the open sidebar: its tabs, letting go of the selection while
 * that tab is open, and collapsing.
 * @param props The sidebar, and how to let go of the selection.
 * @param props.sidebar The sidebar.
 * @param props.onClearSelection Let go of the selection, or null when there is none.
 * @returns The row.
 */
function SidebarHeader(props: {
	readonly sidebar: Sidebar;
	readonly onClearSelection: (() => void) | null;
}): JSX.Element {
	const { sidebar } = props;
	const clear = sidebar.tab === "selection" ? props.onClearSelection : null;
	return (
		<div className="border-border flex h-10 shrink-0 items-center gap-1 border-b pr-2">
			<TabsList variant="underline" className="h-full border-b-0">
				{TABS.map((entry) => (
					<TabsTrigger
						key={entry.tab}
						value={entry.tab}
						data-slot="semantic-sidebar-tab"
						data-tab={entry.tab}
						className="text-control px-3"
					>
						{entry.label}
					</TabsTrigger>
				))}
			</TabsList>
			<span className="ml-auto" />
			{clear !== null && (
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label="Clear selection"
					data-slot="semantic-selection-clear"
					onClick={clear}
				>
					<RiCloseLine />
				</Button>
			)}
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label="Collapse sidebar"
				data-slot="semantic-sidebar-toggle"
				onClick={sidebar.collapse}
			>
				<RiSidebarFoldLine />
			</Button>
		</div>
	);
}

/**
 * The column beside the diagram.
 * @param props The sidebar state and what each tab shows.
 * @returns The sidebar.
 */
function SemanticSidebar(props: SemanticSidebarProps): JSX.Element {
	const { sidebar } = props;
	const { open } = sidebar;
	const choose = useCallback(
		(value: unknown): void => {
			if (value === "board" || value === "selection") {
				open(value);
			}
		},
		[open],
	);
	return (
		<aside
			aria-label="Board sidebar"
			data-slot="semantic-sidebar"
			data-tab={sidebar.tab}
			data-collapsed={sidebar.collapsed}
			className="border-border bg-sidebar flex min-h-0 shrink-0 flex-col border-r in-data-presenting:hidden in-data-walkthrough:hidden"
			style={sidebar.collapsed ? undefined : OPEN_STYLE}
		>
			{sidebar.collapsed ? (
				<SidebarRail sidebar={sidebar} />
			) : (
				<Tabs value={sidebar.tab} onValueChange={choose} className="min-h-0 flex-1 gap-0">
					<SidebarHeader sidebar={sidebar} onClearSelection={props.onClearSelection} />
					{props.children}
				</Tabs>
			)}
		</aside>
	);
}

export { NothingSelected, SemanticSidebar, SidebarPanel, type SemanticSidebarProps };
