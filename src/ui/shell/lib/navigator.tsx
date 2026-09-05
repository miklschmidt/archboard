// The left navigator: one collapsible group per board with its variants, a
// separate group for scratch boards, the listing's refresh and error line,
// and the "New board" action.

import { RiAddLine, RiArrowDownSLine, RiRefreshLine } from "@remixicon/react";
import { useCallback, useMemo, useState } from "react";

import { BoardPreviewCache, PreviewRequestGate } from "@/ui/board-preview";
import { PreviewCard } from "@/ui/board-preview/preview-card";
import { Badge } from "@/ui/components/badge";
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
 * Draft and on-screen markers.
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
			{draft && <Badge variant="outline">Draft</Badge>}
			{onScreen !== null && (
				<Badge variant="secondary" className="font-mono">
					<span className="sr-only">on screen in pane </span>
					{onScreen}
				</Badge>
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
 * The affordance for a scratch board that has no name yet.
 * @param props The entry key and the actions.
 * @returns A small button.
 */
function NeedsName(props: NeedsNameProps): React.JSX.Element {
	const { entryKey, actions } = props;
	const handleClick = useCallback(() => actions.nameBoard(entryKey), [actions, entryKey]);
	return (
		<Button variant="outline" size="xs" className="self-start" onClick={handleClick}>
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
 * One row: the name, its markers and its lazy preview.
 * @param props The entry, its label, the selected key, the theme and the actions.
 * @returns The sub-menu row.
 */
function VariantRow(props: VariantRowProps): React.JSX.Element {
	const { entry, actions, theme } = props;
	const selected = entry.key === props.selectedKey;
	const gate = useMemo(() => new PreviewRequestGate(), []);
	const handleClick = useCallback(() => actions.selectBoard(entry.key), [actions, entry.key]);
	return (
		<SidebarMenuSubItem className="flex flex-col gap-1">
			<SidebarMenuSubButton
				render={renderButton}
				isActive={selected}
				aria-current={selected ? "true" : undefined}
				onClick={handleClick}
				className="data-active:ring-primary h-auto flex-col items-stretch gap-1 py-1 data-active:ring-1"
			>
				<span className="flex items-start justify-between gap-1">
					<span className="line-clamp-2 whitespace-normal!">{props.label}</span>
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
 * A board group: the plain board name as a collapsible trigger, then its
 * variants indented beneath.
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
					className="h-auto min-h-8 items-start gap-1.5 [&>span:last-child]:line-clamp-2 [&>span:last-child]:whitespace-normal!"
				>
					<RiArrowDownSLine className="mt-0.5 -rotate-90 transition-transform group-data-panel-open/menu-button:rotate-0" />
					<span className="font-medium">{group.board}</span>
				</SidebarMenuButton>
				<CollapsibleContent>
					<SidebarMenuSub className="gap-1">
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
		<SidebarGroup>
			<SidebarGroupLabel>Scratch</SidebarGroupLabel>
			<SidebarMenu>
				<SidebarMenuSub className="mx-0 gap-1 border-l-0 px-0">
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
		<SidebarGroup>
			<SidebarGroupLabel>Boards</SidebarGroupLabel>
			<SidebarGroupAction
				aria-label="Refresh boards"
				title="Refresh boards"
				onClick={handleRefresh}
			>
				<RiRefreshLine />
			</SidebarGroupAction>
			{props.error !== null && (
				<p className="text-destructive px-2 py-1 text-xs" aria-live="polite">
					{props.error}
				</p>
			)}
			<SidebarMenu>
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
			<SidebarFooter className="border-border border-t">
				<Button variant="ghost" size="sm" className="justify-start" onClick={handleNew}>
					<RiAddLine data-icon="inline-start" />
					New board
				</Button>
			</SidebarFooter>
		</Sidebar>
	);
}

export { Navigator, type NavigatorProps };
