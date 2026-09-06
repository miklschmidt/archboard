// The left navigator: one collapsible group per board with its variants, a
// separate group for scratch boards, the listing's refresh and error line,
// and the "New board" action.

import { RiAddLine, RiArrowDownSLine, RiRefreshLine } from "@remixicon/react";
import { useCallback, useMemo, useState } from "react";

import { BoardPreviewCache, PreviewRequestGate } from "@/ui/board-preview";
import { PreviewCard } from "@/ui/board-preview/preview-card";
import { Button } from "@/ui/components/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/components/collapsible";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupAction,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "@/ui/components/sidebar";
import type { ShellActions, ShellView, ThemeChoice } from "@/ui/shell/lib/contracts";
import {
	groupBoards,
	scratchEntries,
	type NavigatorEntry,
	type NavigatorGroup,
} from "@/ui/shell/lib/navigator-entries";

/** One cache for every preview the navigator shows; it revokes what it drops. */
const PREVIEW_CACHE = new BoardPreviewCache(16);

/** The focusable navigator parts, for arrow-key movement. */
const FOCUSABLE = '[data-sidebar="menu-button"], [data-sidebar="menu-sub-button"], button';

/** A section label row: the group label already carries the kicker role. */
const KICKER_CLASS = "text-muted-foreground h-8 rounded-none px-3";

/** A small technical mark beside a name: two-pixel corners, mono, 16px tall. */
const MARK_CLASS =
	"text-technical border-border inline-flex h-4 shrink-0 items-center rounded-[2px] border px-1 font-mono";

/**
 * Move focus to the previous or next navigator control on ArrowUp/ArrowDown.
 * Tab order is the official parts' own; this only adds the arrows.
 * @param event The key event on the sidebar content.
 */
function handleArrowKeys(event: React.KeyboardEvent<HTMLDivElement>): void {
	if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
		return;
	}
	const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)];
	const index = controls.findIndex((control) => control === document.activeElement);
	if (index === -1) {
		return;
	}
	const next = controls[index + (event.key === "ArrowDown" ? 1 : -1)];
	if (next) {
		event.preventDefault();
		next.focus();
	}
}

/** Inputs shared by the pieces that select an entry. */
interface SelectableProps {
	selectedKey: string | null;
	theme: ThemeChoice;
	actions: ShellActions;
}

/** Inputs for the small markers beside a name. */
interface EntryMarkersProps {
	entry: NavigatorEntry;
}

/**
 * Draft and on-screen markers, right-aligned on the name line.
 * @param props The entry.
 * @returns The markers, or nothing when the entry is plain.
 */
function EntryMarkers(props: EntryMarkersProps): React.JSX.Element | null {
	const { draft, onScreen } = props.entry;
	if (!draft && onScreen === null) {
		return null;
	}
	return (
		<span className="flex shrink-0 gap-1">
			{draft && <span className={`${MARK_CLASS} text-muted-foreground`}>Draft</span>}
			{onScreen !== null && (
				<span
					className={`${MARK_CLASS} bg-foreground text-background border-foreground font-medium`}
				>
					<span className="sr-only">on screen in pane </span>
					{onScreen}
				</span>
			)}
		</span>
	);
}

/** Inputs for the placeholder affordance. */
interface NeedsNameProps {
	entryKey: string;
	actions: ShellActions;
}

/**
 * The affordance for a scratch board that has no name yet: a small
 * primary-outline chip on the name line, not a floating button.
 * @param props The entry key and the actions.
 * @returns A chip-sized button.
 */
function NeedsName(props: NeedsNameProps): React.JSX.Element {
	const { entryKey, actions } = props;
	const handleClick = useCallback(() => actions.nameBoard(entryKey), [actions, entryKey]);
	return (
		<Button
			variant="outline"
			size="xs"
			className="border-primary text-primary hover:bg-primary/10 hover:text-primary absolute top-0.5 right-1 rounded-[2px] px-1.5 font-medium"
			onClick={handleClick}
		>
			Needs a name
		</Button>
	);
}

/** Inputs for one variant row. */
interface VariantRowProps extends SelectableProps {
	entry: NavigatorEntry;
	/** The row's name: the variant under a board group, the board name for scratch. */
	label: string;
}

/**
 * A button element for the render prop of sub-menu entries, which default to
 * anchors. Hoisted so the same function identity is reused across renders.
 * @param props The merged props Base UI hands to the rendered element.
 * @returns A plain button.
 */
function renderButton(props: React.ComponentPropsWithRef<"button">): React.JSX.Element {
	return <button type="button" {...props} />;
}

/**
 * One row: the name, its markers and its lazy preview. The selected row
 * carries a one-pixel cobalt ring; hover tints the row.
 * @param props The entry, its label, the selected key, the theme and the actions.
 * @returns The sub-menu row.
 */
function VariantRow(props: VariantRowProps): React.JSX.Element {
	const { entry, actions, theme } = props;
	const selected = entry.key === props.selectedKey;
	const gate = useMemo(() => new PreviewRequestGate(), []);
	const handleClick = useCallback(() => actions.selectBoard(entry.key), [actions, entry.key]);
	return (
		<SidebarMenuSubItem className="relative">
			<SidebarMenuSubButton
				render={renderButton}
				isActive={selected}
				aria-current={selected ? "true" : undefined}
				data-board-key={entry.key}
				onClick={handleClick}
				className="data-active:ring-primary data-active:bg-accent hover:bg-sidebar-accent h-auto w-full translate-x-0 flex-col items-stretch gap-1.5 rounded-[2px] px-2 py-1.5 data-active:ring-1 data-active:ring-inset"
			>
				<span
					className={`flex items-start justify-between gap-2 ${entry.placeholder ? "pr-24" : ""}`}
				>
					<span className="line-clamp-2 min-w-0 whitespace-normal!">{props.label}</span>
					<EntryMarkers entry={entry} />
				</span>
				<PreviewCard
					board={entry.identity.board}
					snapshot={entry.preview}
					theme={theme}
					cache={PREVIEW_CACHE}
					gate={gate}
				/>
			</SidebarMenuSubButton>
			{entry.placeholder && <NeedsName entryKey={entry.key} actions={actions} />}
		</SidebarMenuSubItem>
	);
}

/**
 * The collapsible trigger for a board group, in the menu button's place.
 * @param props The merged props Base UI hands to the rendered element.
 * @returns The trigger element.
 */
function renderCollapsibleTrigger(props: React.ComponentPropsWithRef<"button">): React.JSX.Element {
	return <CollapsibleTrigger {...props} />;
}

/** Inputs for one board group. */
interface BoardGroupProps extends SelectableProps {
	group: NavigatorGroup;
}

/**
 * A board group: the plain board name as a collapsible trigger with a
 * twelve-pixel chevron, then its variants indented beneath.
 * @param props The group, the selected key, the theme and the actions.
 * @returns The group as a menu item.
 */
function BoardGroup(props: BoardGroupProps): React.JSX.Element {
	const { group } = props;
	const [open, setOpen] = useState(true);
	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<SidebarMenuItem>
				<SidebarMenuButton
					render={renderCollapsibleTrigger}
					size="sm"
					className="h-auto min-h-7 items-start gap-1.5 rounded-[2px] px-2 py-1.5 font-medium [&_svg]:size-3 [&>span:last-child]:line-clamp-2 [&>span:last-child]:whitespace-normal!"
				>
					<RiArrowDownSLine className="text-muted-foreground mt-0.5 -rotate-90 transition-transform group-data-panel-open/menu-button:rotate-0" />
					<span>{group.board}</span>
				</SidebarMenuButton>
				<CollapsibleContent>
					<SidebarMenuSub className="mx-0 translate-x-0 gap-1 border-l-0 py-0 pr-0 pl-3">
						{group.variants.map((entry) => (
							<VariantRow
								key={entry.key}
								entry={entry}
								label={entry.identity.variant}
								selectedKey={props.selectedKey}
								theme={props.theme}
								actions={props.actions}
							/>
						))}
					</SidebarMenuSub>
				</CollapsibleContent>
			</SidebarMenuItem>
		</Collapsible>
	);
}

/** Inputs for the scratch group. */
interface ScratchGroupProps extends SelectableProps {
	entries: NavigatorEntry[];
}

/**
 * The scratch group: boards with a note but no chosen name.
 * @param props The entries, the selected key, the theme and the actions.
 * @returns The group, or nothing when there is no scratch board.
 */
function ScratchGroup(props: ScratchGroupProps): React.JSX.Element | null {
	if (props.entries.length === 0) {
		return null;
	}
	return (
		<SidebarGroup className="border-border border-t p-2 pt-1">
			<SidebarGroupLabel className={KICKER_CLASS}>Scratch</SidebarGroupLabel>
			<SidebarMenu>
				<SidebarMenuSub className="mx-0 translate-x-0 gap-1 border-l-0 p-0">
					{props.entries.map((entry) => (
						<VariantRow
							key={entry.key}
							entry={entry}
							label={entry.identity.board}
							selectedKey={props.selectedKey}
							theme={props.theme}
							actions={props.actions}
						/>
					))}
				</SidebarMenuSub>
			</SidebarMenu>
		</SidebarGroup>
	);
}

/** Inputs for the boards group. */
interface BoardsGroupProps extends SelectableProps {
	groups: NavigatorGroup[];
	error: string | null;
	/** True before the first listing has arrived. */
	loading: boolean;
}

/** Inputs for the line shown when there is no group to list. */
interface ListingStateProps {
	loading: boolean;
	error: string | null;
	empty: boolean;
}

/**
 * What the group says while it has no board to list: that the vault is
 * being read, why the listing failed, or that no named board exists yet.
 * @param props The listing state.
 * @returns One line, or nothing while boards are listed.
 */
function ListingState(props: ListingStateProps): React.JSX.Element | null {
	if (props.error !== null) {
		return (
			<p className="text-destructive text-body px-2 py-1" aria-live="polite">
				{props.error}
			</p>
		);
	}
	if (!props.empty) {
		return null;
	}
	return (
		<p className="text-muted-foreground text-body px-2 py-1" aria-live="polite">
			{props.loading ? "Reading the vault…" : "No named boards yet."}
		</p>
	);
}

/**
 * The persisted boards with the refresh action and, when the listing failed, why.
 * @param props The groups, the error, the selected key, the theme and the actions.
 * @returns The group.
 */
function BoardsGroup(props: BoardsGroupProps): React.JSX.Element {
	const { actions } = props;
	const handleRefresh = useCallback(() => actions.refreshBoards(), [actions]);
	return (
		<SidebarGroup className="p-2 pt-1">
			<SidebarGroupLabel className={KICKER_CLASS}>Boards</SidebarGroupLabel>
			<SidebarGroupAction
				aria-label="Refresh boards"
				title="Refresh boards"
				className="text-muted-foreground hover:text-sidebar-accent-foreground hit-area top-1.5 right-2 size-6 rounded-[2px] [&>svg]:size-3.5"
				onClick={handleRefresh}
			>
				<RiRefreshLine />
			</SidebarGroupAction>
			<ListingState loading={props.loading} error={props.error} empty={props.groups.length === 0} />
			<SidebarMenu className="gap-1">
				{props.groups.map((group) => (
					<BoardGroup
						key={group.board}
						group={group}
						selectedKey={props.selectedKey}
						theme={props.theme}
						actions={actions}
					/>
				))}
			</SidebarMenu>
		</SidebarGroup>
	);
}

/** Inputs for the navigator. */
interface NavigatorProps {
	view: ShellView;
	actions: ShellActions;
}

/**
 * The board navigator.
 * @param props The shell view and actions.
 * @returns The sidebar.
 */
function Navigator(props: NavigatorProps): React.JSX.Element {
	const { view, actions } = props;
	const handleNew = useCallback(() => actions.createBoard(), [actions]);
	return (
		<Sidebar collapsible="none" className="border-border shrink-0 border-r">
			<SidebarContent onKeyDown={handleArrowKeys}>
				<BoardsGroup
					groups={groupBoards(view)}
					error={view.boardsError}
					loading={view.boards.vault === ""}
					selectedKey={view.selectedBoardKey}
					theme={view.theme}
					actions={actions}
				/>
				<ScratchGroup
					entries={scratchEntries(view)}
					selectedKey={view.selectedBoardKey}
					theme={view.theme}
					actions={actions}
				/>
			</SidebarContent>
			<SidebarFooter className="border-border border-t p-0">
				<Button
					variant="ghost"
					className="h-9 w-full justify-start rounded-none px-3 has-data-[icon=inline-start]:pl-3"
					onClick={handleNew}
				>
					<RiAddLine data-icon="inline-start" />
					New board
				</Button>
			</SidebarFooter>
		</Sidebar>
	);
}

export { Navigator, type NavigatorProps };
