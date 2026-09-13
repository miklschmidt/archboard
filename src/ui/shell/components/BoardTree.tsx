// Every variant keeps its place in ancestry when its lifecycle changes.
import { RiArrowDownSLine } from "@remixicon/react";
import { useCallback, useId, type JSX } from "react";
import {
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubItem,
} from "@/ui/components/sidebar";
import { EntryMarkers, DoingLine } from "@/ui/shell/components/NavigatorMarkers";
import { useTreeRow } from "@/ui/shell/hooks/use-tree-row";
import type { RovingList } from "@/ui/shell/hooks/use-roving-list";
import type { NavigatorBranch, NavigatorGroup } from "@/ui/shell/lib/navigator-entries";
import type { ShellActions } from "@/ui/shell/types/contracts";

/** Keep a 21px ancestry step; each branch draws its own terminating guide. */
const BRANCH_GROUP_CLASS = "mx-0 ml-3 translate-x-0 gap-0 border-l-0 py-0 pr-0 pl-[9px]";

/** Short names for the board's authored architecture level. */
const LEVEL_LABELS = { system: "System", service: "Service", module: "Module" } as const;

/** Selection and roving focus shared by one tree. */
interface TreeProps {
	selectedKey: string | null;
	actions: ShellActions;
	list: RovingList;
	position: number;
	count: number;
}
/** One named board and its variant roots. */
interface BoardTreeProps extends TreeProps {
	group: NavigatorGroup;
}

/**
 * A board's name opens its ancestry, without changing the selected variant.
 * @param props The board and the tree's selection and focus.
 * @returns The board row and its variant roots.
 */
function BoardTree(props: BoardTreeProps): JSX.Element {
	const { group, list } = props;
	const id = `group:${group.board}`;
	const childrenId = useId();
	const first = group.roots[0];
	const { open, toggle, onKeyDown, ref } = useTreeRow(
		undefined,
		first === undefined ? undefined : `row:${first.entry.key}`,
	);
	return (
		<SidebarMenuItem role="none">
			<SidebarMenuButton
				role="treeitem"
				aria-level={1}
				aria-posinset={props.position}
				aria-setsize={props.count}
				aria-expanded={open}
				aria-owns={childrenId}
				ref={ref}
				onKeyDown={onKeyDown}
				onClick={toggle}
				{...list.item(id)}
				className="h-auto min-h-8 items-start gap-0 rounded-[2px] py-2 pr-2 pl-0 font-semibold"
			>
				<span className="flex h-4 w-6 shrink-0 items-center justify-center">
					<Chevron open={open} />
				</span>
				<span className="min-w-0 flex-1 wrap-anywhere whitespace-normal!">{group.board}</span>
				{group.level !== undefined && (
					<span className="text-technical text-muted-foreground border-border ml-2 inline-flex h-4 shrink-0 items-center rounded-[2px] border px-1 font-normal">
						{levelLabel(group.level)}
					</span>
				)}
			</SidebarMenuButton>
			{/* An ARIA tree requires a list group; a fieldset would change the list semantics. */}
			<SidebarMenuSub
				// eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- ARIA tree groups must preserve list semantics.
				role="group"
				id={childrenId}
				hidden={!open}
				className={BRANCH_GROUP_CLASS}
			>
				{group.roots.map((branch, index) => (
					<VariantBranch
						key={branch.entry.key}
						branch={branch}
						parentId={id}
						depth={2}
						selectedKey={props.selectedKey}
						actions={props.actions}
						list={list}
						position={index + 1}
						count={group.roots.length}
					/>
				))}
			</SidebarMenuSub>
		</SidebarMenuItem>
	);
}

/** A row's place in its board's ancestry. */
interface VariantBranchProps extends TreeProps {
	branch: NavigatorBranch;
	parentId: string;
	depth: number;
}

/**
 * A selectable variant, with expansion distinct from selection.
 * @param props The variant, its ancestry and shared tree controls.
 * @returns The row and its descendants.
 */
function VariantBranch(props: VariantBranchProps): JSX.Element {
	const { branch, actions, list } = props;
	const { entry, children } = branch;
	const selected = entry.key === props.selectedKey;
	const childrenId = useId();
	const first = children[0];
	const { open, toggle, onKeyDown, ref } = useTreeRow(
		props.parentId,
		first === undefined ? undefined : `row:${first.entry.key}`,
	);
	const select = useCallback(() => actions.selectBoard(entry.key), [actions, entry.key]);
	return (
		<SidebarMenuSubItem
			role="none"
			className="before:border-muted-foreground/40 after:border-muted-foreground/40 relative before:absolute before:top-0 before:bottom-0 before:-left-[9px] before:border-l after:absolute after:top-4 after:-left-[9px] after:w-[9px] after:border-t first:before:-top-2 last:before:bottom-[calc(100%-1rem)]"
		>
			<div className="relative">
				{children.length > 0 && (
					<button
						type="button"
						tabIndex={-1}
						aria-label={`${open ? "Collapse" : "Expand"} ${entry.identity.variant}`}
						onClick={toggle}
						className="text-muted-foreground hover:text-foreground absolute top-1 left-0 z-10 flex size-6 items-center justify-center rounded-[2px]"
					>
						<Chevron open={open} />
					</button>
				)}
				<SidebarMenuButton
					role="treeitem"
					aria-level={props.depth}
					aria-posinset={props.position}
					aria-setsize={props.count}
					aria-expanded={children.length > 0 ? open : undefined}
					aria-owns={childrenId}
					aria-selected={selected}
					aria-current={selected}
					isActive={selected}
					data-board-key={entry.key}
					title={entry.error}
					ref={ref}
					onKeyDown={onKeyDown}
					onClick={select}
					{...list.item(`row:${entry.key}`)}
					className="data-active:ring-primary data-active:bg-accent hover:bg-sidebar-accent h-auto min-h-8 w-full flex-col items-stretch gap-1 rounded-[2px] py-2 pr-2 pl-6 data-active:ring-1 data-active:ring-inset"
				>
					<span className="flex min-w-0 items-start gap-2 whitespace-normal!">
						<span className="min-w-0 flex-1 wrap-anywhere">{entry.identity.variant}</span>
						<EntryMarkers entry={entry} />
					</span>
					<DoingLine entry={entry} />
				</SidebarMenuButton>
			</div>
			<SidebarMenuSub
				// eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- ARIA tree groups must preserve list semantics.
				role="group"
				id={childrenId}
				hidden={!open}
				className={BRANCH_GROUP_CLASS}
			>
				{children.map((child, index) => (
					<VariantBranch
						key={child.entry.key}
						branch={child}
						parentId={`row:${entry.key}`}
						depth={props.depth + 1}
						selectedKey={props.selectedKey}
						actions={actions}
						list={list}
						position={index + 1}
						count={children.length}
					/>
				))}
			</SidebarMenuSub>
		</SidebarMenuSubItem>
	);
}

interface ChevronProps {
	open: boolean;
}

/**
 * Standard levels have display names; project-specific levels retain their wording.
 * @param level The board's authored abstraction level.
 * @returns The compact badge label.
 */
function levelLabel(level: NonNullable<NavigatorGroup["level"]>): string {
	return Object.hasOwn(LEVEL_LABELS, level)
		? LEVEL_LABELS[level as keyof typeof LEVEL_LABELS]
		: level;
}

/**
 * The direction in which a row's children are open.
 * @param props Whether its descendants are visible.
 * @returns The disclosure mark.
 */
function Chevron(props: ChevronProps): JSX.Element {
	return (
		<RiArrowDownSLine
			className={`text-muted-foreground size-3! shrink-0 ${props.open ? "" : "-rotate-90"}`}
		/>
	);
}

export { BoardTree };
