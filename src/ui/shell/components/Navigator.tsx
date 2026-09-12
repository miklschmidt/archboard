// The left navigator: one collapsible group per board with its variants, and
// the listing's refresh and error line. Each list is one tab stop: the arrow
// keys move between its rows (`use-roving-list.ts`), Enter and Space open a row.
//
// Nothing here makes a board. A person reads an architecture an agent wrote
// (ADR 0023), so the navigator is a way of choosing which one to look at.

import { RiArrowDownSLine, RiRefreshLine } from "@remixicon/react";
import {
	useCallback,
	useMemo,
	useState,
	type ComponentPropsWithRef,
	type JSX,
	type KeyboardEvent,
} from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/components/collapsible";
import {
	Sidebar,
	SidebarContent,
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
import { Skeleton } from "@/ui/components/skeleton";
import { StatusDot } from "@/ui/shell/components/StatusDot";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/components/tooltip";
import type { ShellActions, ShellView } from "@/ui/shell/types/contracts";
import {
	groupBoards,
	type NavigatorEntry,
	type NavigatorGroup,
} from "@/ui/shell/lib/navigator-entries";
import {
	useRovingList,
	type RovingItemProps,
	type RovingList,
} from "@/ui/shell/hooks/use-roving-list";
import type { AgentActivityEntry } from "@/ui/types";

/** A section label row: the group label already carries the kicker role. */
const KICKER_CLASS = "text-muted-foreground h-8 rounded-none px-3";

/** A small technical mark beside a name: two-pixel corners, mono, 16px tall. */
const MARK_CLASS =
	"text-technical border-border inline-flex h-4 shrink-0 items-center rounded-[2px] border px-1 font-mono";

/** Inputs shared by the pieces that select an entry. */
interface SelectableProps {
	selectedKey: string | null;
	actions: ShellActions;
}

/** Inputs for the small markers beside a name. */
interface EntryMarkersProps {
	entry: NavigatorEntry;
}

/**
 * What the live marker says of an agent's work on a board (ADR 0022).
 * @param activity The agent's activity on the board.
 * @returns The accessible name: the claim and its reason, or a passing write.
 */
function activityLabel(activity: AgentActivityEntry): string {
	if (activity.claim === null) {
		return "Agent writing this board";
	}
	const reason = activity.claim.reason;
	return reason === undefined ? "Agent claimed this board" : `Agent claimed this board: ${reason}`;
}

/**
 * The live marker beside a board an agent is working on: the lime dot the
 * header and dock use, pulsing, named for assistive technology and the pointer.
 * @param props The entry.
 * @returns The marker, or nothing while no agent is on the board.
 */
function ActivityMarker(props: EntryMarkersProps): JSX.Element | null {
	const { activity } = props.entry;
	if (activity === null) {
		return null;
	}
	const label = activityLabel(activity);
	return (
		<span
			title={label}
			data-slot="agent-activity"
			className="inline-flex h-4 shrink-0 items-center px-0.5"
		>
			<StatusDot tone="live" className="motion-safe:animate-pulse" />
			<span className="sr-only">{label}</span>
		</span>
	);
}

/**
 * The latest thing an agent said it was doing to a board, as a second line
 * under the name while the activity lingers (ADR 0022).
 * @param props The entry.
 * @returns The line, or nothing while nothing was said.
 */
function DoingLine(props: EntryMarkersProps): JSX.Element | null {
	const doing = props.entry.activity?.doing ?? null;
	if (doing === null) {
		return null;
	}
	return (
		<span
			data-slot="agent-doing"
			className="text-muted-foreground text-technical line-clamp-1 min-w-0 whitespace-normal!"
		>
			{doing.doing}
		</span>
	);
}

/**
 * Draft and on-screen markers, right-aligned on the name line.
 * @param props The entry.
 * @returns The markers, or nothing when the entry is plain.
 */
function EntryMarkers(props: EntryMarkersProps): JSX.Element | null {
	const { draft, onScreen, activity } = props.entry;
	if (!draft && onScreen === null && activity === null) {
		return null;
	}
	return (
		<span className="flex shrink-0 gap-1">
			<ActivityMarker entry={props.entry} />
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

/** Inputs for one variant row. */
interface VariantRowProps extends SelectableProps, RovingItemProps {
	entry: NavigatorEntry;
	/** The row's name: the variant under its board group. */
	label: string;
}

/**
 * A button element for the render prop of sub-menu entries, which default to
 * anchors. Hoisted so the same function identity is reused across renders.
 * @param props The merged props Base UI hands to the rendered element.
 * @returns A plain button.
 */
function renderButton(props: ComponentPropsWithRef<"button">): JSX.Element {
	return <button type="button" {...props} />;
}

/**
 * One row: the name and its markers. The selected row carries a one-pixel
 * cobalt ring; hover tints the row.
 * @param props The entry, its label, the selected key, the actions and its roving place.
 * @returns The sub-menu row.
 */
function VariantRow(props: VariantRowProps): JSX.Element {
	const { entry, actions } = props;
	const selected = entry.key === props.selectedKey;
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
				{...props.roving}
			>
				<span className="flex items-start justify-between gap-2">
					<span className="line-clamp-2 min-w-0 whitespace-normal!">{props.label}</span>
					<EntryMarkers entry={entry} />
				</span>
				<DoingLine entry={entry} />
			</SidebarMenuSubButton>
		</SidebarMenuSubItem>
	);
}

/**
 * The collapsible trigger for a board group, in the menu button's place.
 * @param props The merged props Base UI hands to the rendered element.
 * @returns The trigger element.
 */
function renderCollapsibleTrigger(props: ComponentPropsWithRef<"button">): JSX.Element {
	return <CollapsibleTrigger {...props} />;
}

/** Inputs for one board group. */
interface BoardGroupProps extends SelectableProps {
	group: NavigatorGroup;
	list: RovingList;
}

/**
 * A board group: the plain board name as a collapsible trigger with a
 * twelve-pixel chevron, then its variants indented beneath. ArrowRight opens
 * the group and ArrowLeft closes it, as in a tree.
 * @param props The group, the selected key, the actions and the list.
 * @returns The group as a menu item.
 */
function BoardGroup(props: BoardGroupProps): JSX.Element {
	const { group, list } = props;
	const [open, setOpen] = useState(true);
	const groupId = `group:${group.board}`;
	const handleKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
			event.preventDefault();
			setOpen(event.key === "ArrowRight");
		}
	}, []);
	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<SidebarMenuItem>
				<SidebarMenuButton
					render={renderCollapsibleTrigger}
					size="sm"
					className="h-auto min-h-7 items-start gap-1.5 rounded-[2px] px-2 py-1.5 font-medium [&_svg]:size-3 [&>span:last-child]:line-clamp-2 [&>span:last-child]:whitespace-normal!"
					onKeyDown={handleKeyDown}
					{...list.item(groupId)}
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
								actions={props.actions}
								roving={list.item(`row:${entry.key}`)}
							/>
						))}
					</SidebarMenuSub>
				</CollapsibleContent>
			</SidebarMenuItem>
		</Collapsible>
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
 * The listing's loading state: two rows of the shape a board takes, greyed,
 * with the words for assistive technology.
 * @returns The skeleton.
 */
function ListingSkeleton(): JSX.Element {
	return (
		<div aria-busy="true" className="flex flex-col gap-3 px-2 py-1">
			<p aria-live="polite" className="sr-only">
				Reading the vault…
			</p>
			{[0, 1].map((row) => (
				<div key={row} className="flex flex-col gap-1.5">
					<Skeleton className="h-3 w-2/5 rounded-[2px] motion-reduce:animate-none" />
					<Skeleton className="h-3 w-3/5 rounded-[2px] motion-reduce:animate-none" />
				</div>
			))}
		</div>
	);
}

/**
 * What the group says while it has no board to list: that the vault is being
 * read, why the listing failed, or that it holds no board yet.
 * @param props The listing state.
 * @returns One line, or nothing while boards are listed.
 */
function ListingState(props: ListingStateProps): JSX.Element | null {
	if (props.error !== null) {
		return (
			<p className="text-body flex items-start gap-2 px-2 py-1" aria-live="polite">
				<StatusDot tone="warning" className="mt-[5px]" />
				<span className="min-w-0">{props.error}</span>
			</p>
		);
	}
	if (!props.empty) {
		return null;
	}
	if (props.loading) {
		return <ListingSkeleton />;
	}
	return (
		<p className="text-muted-foreground text-body px-2 py-1" aria-live="polite">
			No boards yet. Ask an agent for one: <code>archboard semantic new &lt;name&gt;</code>.
		</p>
	);
}

/** Inputs for the refresh control. */
interface RefreshActionProps {
	actions: ShellActions;
}

/**
 * The sidebar group action as the tooltip's element.
 * @param props The merged props Base UI hands to the rendered element.
 * @returns The group action.
 */
function renderGroupAction(props: ComponentPropsWithRef<"button">): JSX.Element {
	return <SidebarGroupAction {...props} />;
}

/**
 * The listing's refresh control, a 24px icon in a 32px hit area.
 * @param props The actions.
 * @returns The group action with its tooltip.
 */
function RefreshAction(props: RefreshActionProps): JSX.Element {
	const { actions } = props;
	const handleRefresh = useCallback(() => actions.refreshBoards(), [actions]);
	return (
		<Tooltip>
			<TooltipTrigger
				render={renderGroupAction}
				aria-label="Refresh boards"
				className="text-muted-foreground hover:text-sidebar-accent-foreground hit-area top-1.5 right-2 size-6 rounded-[2px] [&>svg]:size-3.5"
				onClick={handleRefresh}
			>
				<RiRefreshLine />
			</TooltipTrigger>
			<TooltipContent side="right">Refresh boards</TooltipContent>
		</Tooltip>
	);
}

/**
 * The vault's boards with the refresh action and, when the listing failed, why.
 * @param props The groups, the error, the selected key and the actions.
 * @returns The group.
 */
function BoardsGroup(props: BoardsGroupProps): JSX.Element {
	const { actions, groups } = props;
	const ids = useMemo(
		() =>
			groups.flatMap((group) => [
				`group:${group.board}`,
				...group.variants.map((entry) => `row:${entry.key}`),
			]),
		[groups],
	);
	const list = useRovingList(ids);
	return (
		<SidebarGroup className="p-2 pt-1">
			<SidebarGroupLabel className={KICKER_CLASS}>Boards</SidebarGroupLabel>
			<RefreshAction actions={actions} />
			<ListingState loading={props.loading} error={props.error} empty={groups.length === 0} />
			<SidebarMenu className="gap-1" onKeyDown={list.onKeyDown}>
				{groups.map((group) => (
					<BoardGroup
						key={group.board}
						group={group}
						list={list}
						selectedKey={props.selectedKey}
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
function Navigator(props: NavigatorProps): JSX.Element {
	const { view, actions } = props;
	return (
		<Sidebar collapsible="none" className="border-border shrink-0 border-r">
			<SidebarContent>
				<BoardsGroup
					groups={groupBoards(view)}
					error={view.boardsError}
					loading={view.boardsLoading}
					selectedKey={view.selectedBoardKey}
					actions={actions}
				/>
			</SidebarContent>
		</Sidebar>
	);
}

export { Navigator, type NavigatorProps };
