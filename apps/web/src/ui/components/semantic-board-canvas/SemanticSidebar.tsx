// The one column on the right of a semantic diagram: the search for a part at
// its top, level with the navigator's search for a board, then the board, and
// whatever is selected on it. Docked, it takes its width beside the picture;
// floating, its panel is laid over the picture's edge; away, it is nowhere, and
// the control in the pane's header brings it back (use-sidebar.ts says when each
// holds, and where it comes back to).
//
// One panel, held at the pane's edge at one width whichever tab is open and
// whether the column around it is docked or not, because the pane refits its
// picture when it changes size: a panel that came and went with a pick would
// move the diagram under the pointer that picked. Only hiding and showing a
// docked sidebar changes the pane's width, and that is the person asking for
// the room. It eases (use-sidebar-slide.ts, app.css): the column its width, with
// the panel sliding in under the pane's edge and never reflowing; a floating
// panel its place and its opacity, from the edge it is laid against.
//
// Its width is the shell's, so the pane a drawing's fit is measured against is
// the pane a reader actually has. A pane presented fullscreen is the picture
// alone, so the sidebar steps out of it for as long as the presentation lasts;
// so does a presented walkthrough, which is the picture and its caption.

import { RiCloseLine, RiPushpinLine } from "@remixicon/react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	type CSSProperties,
	type JSX,
	type ReactNode,
	type RefObject,
} from "react";

import { SIDEBAR_WIDTH } from "@archboard/renderer/shell-geometry";
import { SIDEBAR_MS } from "@archboard/timing";
import { cn, IconButton, Tabs } from "@archboard/ui-kit/components";
import {
	SearchRequestContext,
	useSearchRequest,
} from "#ui/hooks/semantic-board-canvas/use-search-request.ts";
import type { Sidebar, SidebarTab } from "#ui/hooks/semantic-board-canvas/use-sidebar.ts";
import {
	useSidebarSlide,
	type Place,
	type Slide,
} from "#ui/hooks/semantic-board-canvas/use-sidebar-slide.ts";

/** Inputs for the sidebar. */
interface SemanticSidebarProps {
	/** Which tab is open, where the sidebar is, and how to change either. */
	readonly sidebar: Sidebar;
	/** The tabs' panels, each a `SidebarPanel`. */
	readonly children: ReactNode;
	/** Let go of the selection, offered on the selection tab while there is one; null otherwise. */
	readonly onClearSelection: (() => void) | null;
	/** The search over every board's parts, at the top: what it finds is explained below it. */
	readonly search?: ReactNode;
	/** The name of the complete reading, while retained legacy panes keep Board. */
	readonly overviewLabel?: string;
	/** Reading controls shared by both tabs. */
	readonly controls?: ReactNode;
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
		<Tabs.Content
			value={props.tab}
			// A panel that scrolls is a tab stop, so the keys can scroll it: it shows where it is.
			className="focus-visible:ring-ring flex min-h-0 flex-col overflow-x-hidden overflow-y-auto focus-visible:ring-2 focus-visible:ring-inset"
		>
			{props.children}
		</Tabs.Content>
	);
}

/**
 * What the stylesheet eases the column with: its width when docked and the
 * durations the shell owns. The width itself is the stylesheet's (app.css), so
 * that the column can start from none when it opens.
 */
const COLUMN_STYLE: CSSProperties = {
	"--sidebar-width": `${SIDEBAR_WIDTH}px`,
	"--sidebar-dock-ms": `${SIDEBAR_MS.dock}ms`,
	"--sidebar-float-in-ms": `${SIDEBAR_MS.floatIn}ms`,
	"--sidebar-float-out-ms": `${SIDEBAR_MS.floatOut}ms`,
	"--sidebar-subject-in-ms": `${SIDEBAR_MS.subjectIn}ms`,
};

/** The panel's width, whatever the column around it is doing. */
const PANEL_STYLE: CSSProperties = { width: SIDEBAR_WIDTH };

/** The two tabs, in order. */
const TABS: readonly { readonly tab: SidebarTab; readonly label: string }[] = [
	{ tab: "board", label: "Board" },
	{ tab: "selection", label: "Selection" },
];

/** Inputs for the row above the open sidebar. */
interface SidebarTabsProps {
	readonly overviewLabel?: string | undefined;
	readonly sidebar: Sidebar;
	readonly onClearSelection: (() => void) | null;
}

/**
 * The row above the open sidebar: its tabs, the way to let go of the selection
 * right after the selection tab while that tab is open, and at the far end the
 * way to dock a panel that floats. Showing and hiding the sidebar is not here:
 * it is one control, in the pane's header, which is there when the sidebar is not.
 * @param props The sidebar, and how to let go of the selection.
 * @param props.sidebar The sidebar.
 * @param props.onClearSelection Let go of the selection, or null when there is none.
 * @returns The row.
 */
function SidebarTabs(props: SidebarTabsProps): JSX.Element {
	const { sidebar, onClearSelection } = props;
	const clear = sidebar.tab === "selection" ? onClearSelection : null;
	const { selectionTabId } = sidebar;
	// The control goes with the selection it lets go of, so focus is given to the
	// tab beside it first, and the keyboard is not left on the page's body.
	const letGo = useCallback((): void => {
		document.getElementById(selectionTabId)?.focus();
		clear?.();
	}, [clear, selectionTabId]);
	return (
		// The labels' words start on the column the tab's content starts on, 16 px
		// in, with each underline reaching 8 px past its words.
		<div className="border-border h-band flex shrink-0 items-center gap-1 border-b pr-2">
			<Tabs.List variant="underline" className="h-full w-auto flex-none border-b-0 pl-2">
				{TABS.map((entry) => (
					<Tabs.Trigger
						key={entry.tab}
						id={entry.tab === "selection" ? selectionTabId : undefined}
						value={entry.tab}
						data-slot="semantic-sidebar-tab"
						data-tab={entry.tab}
						className="text-control px-2"
					>
						{entry.tab === "board" ? (props.overviewLabel ?? entry.label) : entry.label}
					</Tabs.Trigger>
				))}
			</Tabs.List>
			{clear !== null && (
				<IconButton label="Clear selection" slot="semantic-selection-clear" onClick={letGo}>
					<RiCloseLine />
				</IconButton>
			)}
			{sidebar.floating && (
				<IconButton
					label="Pin the sidebar beside the picture"
					slot="semantic-sidebar-pin"
					className="ml-auto"
					onClick={sidebar.pin}
				>
					<RiPushpinLine />
				</IconButton>
			)}
		</div>
	);
}

/**
 * Put a floating panel away when Escape is pressed inside it, and give focus to
 * the control that shows it. It goes by where the key was pressed, and not by
 * where focus is now, so a field that lets go of focus on the same key does not
 * keep the panel or leave the keyboard on the page's body.
 * @param panel The panel's element.
 * @param sidebar The sidebar.
 */
function useEscapeAway(panel: RefObject<HTMLElement | null>, sidebar: Sidebar): void {
	const { floating, putAway, toggleId } = sidebar;
	useEffect(() => {
		if (!floating) {
			return undefined;
		}
		/**
		 * Put the panel away on Escape pressed inside it.
		 * @param event The key event.
		 */
		const onKey = (event: KeyboardEvent): void => {
			const inside = event.target instanceof Node && panel.current?.contains(event.target) === true;
			if (event.key !== "Escape" || !inside) {
				return;
			}
			event.stopPropagation();
			document.getElementById(toggleId)?.focus();
			putAway();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [floating, panel, putAway, toggleId]);
}

/**
 * Give focus back to the control that shows the sidebar when the panel is put
 * away with focus inside it, by whatever means: Escape, letting go of the pick
 * its control belongs to, or the pin. Left alone, a focused control that goes
 * inert and unmounts leaves the keyboard on the page's body. It is done before
 * the browser takes focus away from what is inert.
 * @param panel The panel's element.
 * @param leaving Whether the panel is on its way out.
 * @param toggleId The id of the control that shows the sidebar.
 */
function useFocusBackWhenLeaving(
	panel: RefObject<HTMLElement | null>,
	leaving: boolean,
	toggleId: string,
): void {
	useLayoutEffect(() => {
		if (leaving && panel.current?.contains(document.activeElement) === true) {
			document.getElementById(toggleId)?.focus();
		}
	}, [leaving, panel, toggleId]);
}

/**
 * Where the sidebar is.
 * @param sidebar The sidebar.
 * @returns Docked, floating or away.
 */
function placeOf(sidebar: Sidebar): Place {
	if (sidebar.docked) return "docked";
	return sidebar.floating ? "floating" : "away";
}

/** Inputs for the column and the panel in it. */
interface ColumnProps {
	readonly slide: Slide;
	/** Where the sidebar is now, which is not where it is drawn while it leaves. */
	readonly place: Place;
	readonly sidebar: Sidebar;
	readonly children: ReactNode;
}

/**
 * The column and the one panel in it. The column is a box that has a width, and
 * while it is docked it casts the edge's shadow onto the picture, which moves
 * with the column's edge; it is outside the clip that keeps the panel inside the
 * column. The panel has the rule, and the float's shadow while it floats, and is
 * held at the pane's edge.
 * @param props What is drawn and where.
 * @returns The column.
 */
function Column(props: ColumnProps): JSX.Element {
	const { slide, place, sidebar } = props;
	const panel = useRef<HTMLDivElement>(null);
	useEscapeAway(panel, sidebar);
	// A presented walkthrough that steps the panel aside takes focus itself.
	useFocusBackWhenLeaving(panel, slide.leaving && !sidebar.steppedAside, sidebar.toggleId);
	const floating = slide.shownAs === "floating";
	const leaving = slide.leaving ? "" : undefined;
	return (
		<aside
			aria-label="Diagram sidebar"
			data-slot="semantic-sidebar"
			data-tab={sidebar.tab}
			data-place={slide.shownAs}
			data-motion={slide.motion}
			data-docked={place === "docked" ? "" : undefined}
			data-leaving={leaving}
			style={COLUMN_STYLE}
			className={cn(
				"relative z-30 flex min-h-0 shrink-0 flex-col in-data-presenting:hidden in-data-walkthrough:hidden",
				!floating && "shadow-edge-side overflow-hidden",
			)}
		>
			<div
				ref={panel}
				id={sidebar.panelId}
				data-slot="semantic-sidebar-panel"
				data-place={slide.shownAs}
				data-motion={slide.motion}
				data-leaving={leaving}
				inert={slide.leaving}
				style={PANEL_STYLE}
				className={cn(
					"border-border bg-sidebar absolute inset-y-0 right-0 flex min-h-0 flex-col border-l",
					floating && "shadow-[var(--elevation-float),var(--elevation-edge-side)]",
				)}
			>
				{props.children}
			</div>
		</aside>
	);
}

/**
 * The column beside the diagram.
 * @param props The sidebar state and what each tab shows.
 * @returns The sidebar, or nothing while it is away.
 */
function SemanticSidebar(props: SemanticSidebarProps): JSX.Element | null {
	const { sidebar } = props;
	const place = placeOf(sidebar);
	const slide = useSidebarSlide(place);
	const request = useSearchRequest(sidebar);
	const { open } = sidebar;
	const choose = useCallback(
		(value: unknown): void => {
			if (value === "board" || value === "selection") {
				open(value);
			}
		},
		[open],
	);
	if (!slide.mounted) {
		return null;
	}
	return (
		<Column slide={slide} place={place} sidebar={sidebar}>
			<SearchRequestContext.Provider value={request}>{props.search}</SearchRequestContext.Provider>
			<Tabs value={sidebar.tab} onValueChange={choose} className="min-h-0 flex-1 gap-0">
				<SidebarTabs
					sidebar={sidebar}
					onClearSelection={props.onClearSelection}
					overviewLabel={props.overviewLabel}
				/>
				{props.controls}
				{props.children}
			</Tabs>
		</Column>
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

export { NothingSelected, SemanticSidebar, SidebarPanel, type SemanticSidebarProps };
