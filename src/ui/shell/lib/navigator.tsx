// The left navigator: one collapsible group per board with its variants, a
// separate group for scratch boards, and the "New board" action.

import { RiAddLine, RiArrowDownSLine } from "@remixicon/react";
import { useCallback, useState } from "react";

import { Button } from "@/ui/components/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/components/collapsible";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "@/ui/components/sidebar";
import type { ScratchBoardEntry, ShellActions, ShellView } from "@/ui/shell/lib/contracts";
import type { BoardIdentity, BoardPreviewSnapshot } from "@/ui/types";

/** One selectable navigator entry. */
interface NavigatorEntry {
	key: string;
	identity: BoardIdentity;
	preview: BoardPreviewSnapshot | null;
}

/** A named board and its variants, in listing order. */
interface NavigatorGroup {
	board: string;
	variants: NavigatorEntry[];
}

/**
 * Group the persisted listing by board name.
 * @param view The shell view holding the listing and the previews.
 * @returns Groups in first-seen order.
 */
function groupBoards(view: ShellView): NavigatorGroup[] {
	const groups = new Map<string, NavigatorGroup>();
	for (const board of view.boards.boards) {
		const group = groups.get(board.identity.board) ?? {
			board: board.identity.board,
			variants: [],
		};
		group.variants.push({
			key: board.key,
			identity: board.identity,
			preview: view.previews[board.key] ?? null,
		});
		groups.set(board.identity.board, group);
	}
	return [...groups.values()];
}

/**
 * Scratch boards as navigator entries.
 * @param view The shell view holding the scratch list and the previews.
 * @returns One entry per scratch board.
 */
function scratchEntries(view: ShellView): NavigatorEntry[] {
	return view.scratch.map((entry: ScratchBoardEntry) => ({
		key: entry.key,
		identity: entry.identity,
		preview: view.previews[entry.key] ?? null,
	}));
}

/** Inputs for the preview slot. */
interface PreviewSlotProps {
	board: string;
	preview: BoardPreviewSnapshot | null;
}

/**
 * The lazy preview slot: a bordered 16:9 box that names the board and, once
 * a snapshot exists, its element count. It never invents scene content.
 * @param props The board name and its snapshot, if any.
 * @returns The preview box.
 */
function PreviewSlot(props: PreviewSlotProps): React.JSX.Element {
	const { board, preview } = props;
	return (
		<span className="border-border bg-background text-muted-foreground flex aspect-video w-full items-end justify-end rounded-sm border p-1 font-mono text-[10px]">
			<span className="sr-only">
				{preview ? `Preview of ${board}` : `No preview yet for ${board}`}
			</span>
			{preview && `${preview.elements.length} elements`}
		</span>
	);
}

/** Inputs shared by the pieces that select an entry. */
interface SelectableProps {
	selectedKey: string | null;
	onSelect: (key: string) => void;
}

/** Inputs for one variant row. */
interface VariantRowProps extends SelectableProps {
	entry: NavigatorEntry;
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
 * One variant row: the variant name and its preview slot.
 * @param props The entry, the selected key and the select action.
 * @returns The sub-menu row.
 */
function VariantRow(props: VariantRowProps): React.JSX.Element {
	const { entry, onSelect } = props;
	const selected = entry.key === props.selectedKey;
	const handleClick = useCallback(() => onSelect(entry.key), [onSelect, entry.key]);
	return (
		<SidebarMenuSubItem>
			<SidebarMenuSubButton
				render={renderButton}
				isActive={selected}
				aria-current={selected ? "true" : undefined}
				onClick={handleClick}
				className="data-active:ring-primary h-auto flex-col items-stretch gap-1 py-1 data-active:ring-1"
			>
				<span className="line-clamp-2 whitespace-normal!">{entry.identity.variant}</span>
				<PreviewSlot board={entry.identity.board} preview={entry.preview} />
			</SidebarMenuSubButton>
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
 * @param props The group, the selected key and the select action.
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
								selectedKey={props.selectedKey}
								onSelect={props.onSelect}
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
 * @param props The entries, the selected key and the select action.
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
							selectedKey={props.selectedKey}
							onSelect={props.onSelect}
						/>
					))}
				</SidebarMenuSub>
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
	const handleSelect = useCallback((key: string) => actions.selectBoard(key), [actions]);
	const handleNew = useCallback(() => actions.createBoard(), [actions]);
	return (
		<Sidebar collapsible="none" className="border-border shrink-0 border-r">
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Boards</SidebarGroupLabel>
					<SidebarMenu>
						{groupBoards(view).map((group) => (
							<BoardGroup
								key={group.board}
								group={group}
								selectedKey={view.selectedBoardKey}
								onSelect={handleSelect}
							/>
						))}
					</SidebarMenu>
				</SidebarGroup>
				<ScratchGroup
					entries={scratchEntries(view)}
					selectedKey={view.selectedBoardKey}
					onSelect={handleSelect}
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

export { Navigator, type NavigatorProps, type NavigatorEntry, type NavigatorGroup };
