// The left navigator: one collapsible group per board with its variants, and
// the listing's refresh and error line. Each list is one tab stop: the arrow
// keys move between its rows (`use-roving-list.ts`), Enter and Space open a row.
//
// Nothing here makes a board. A person reads an architecture an agent wrote
// (ADR 0023), so the navigator is a way of choosing which one to look at.

import { RiRefreshLine } from "@remixicon/react";
import { useCallback, useMemo, type ComponentPropsWithRef, type JSX } from "react";

import { BoardTree } from "@/ui/shell/components/BoardTree";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupAction,
	SidebarGroupLabel,
	SidebarMenu,
} from "@/ui/components/sidebar";
import { Skeleton } from "@/ui/components/skeleton";
import { StatusDot } from "@/ui/shell/components/StatusDot";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/components/tooltip";
import type { ShellActions, ShellView } from "@/ui/shell/types/contracts";
import { groupBoards, type NavigatorGroup } from "@/ui/shell/lib/navigator-entries";
import { useRovingList } from "@/ui/shell/hooks/use-roving-list";
import { listedBoardKey } from "@/ui/board-catalog";

/** A section label row: the group label already carries the kicker role. */
const KICKER_CLASS = "text-muted-foreground h-8 rounded-none px-3";

/** Inputs shared by board selection controls. */
interface SelectableProps {
	selectedKey: string | null;
	actions: ShellActions;
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
			<SidebarMenu
				role="tree"
				aria-label="Boards and variants"
				className="gap-1"
				onKeyDown={list.onKeyDown}
			>
				{groups.map((group, index) => (
					<BoardTree
						key={group.board}
						position={index + 1}
						count={groups.length}
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
					selectedKey={listedBoardKey(view.boards, view.selectedBoardKey)}
					actions={actions}
				/>
			</SidebarContent>
		</Sidebar>
	);
}

export { Navigator, type NavigatorProps };
