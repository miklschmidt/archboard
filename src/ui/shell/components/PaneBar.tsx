// The pane bar: the panes' tabs when there are two, and the controls that add,
// close and present them. A tab names its pane by letter and the board it
// shows; the focused tab carries a two-pixel cobalt rule along its bottom
// edge. With one pane there is nothing to choose between, so there are no
// tabs, and the header already names what it shows.

import { RiAddLine, RiCloseLine, RiFullscreenLine } from "@remixicon/react";
import { useCallback, useMemo, type JSX } from "react";

import { listedBoard } from "@/ui/board-catalog";
import { ToggleGroup, ToggleGroupItem } from "@/ui/components/toggle-group";
import { boardAddressOf } from "@/ui/semantic-board-canvas";
import type { ShellActions, ShellPane } from "@/ui/shell/types/contracts";
import { IconButton } from "@/ui/shell/components/IconButton";
import { paneLetter } from "@/ui/shell/lib/pane-letters";
import { presentShortcutLabel } from "@/ui/shell/lib/shortcuts";
import { StatusDot } from "@/ui/shell/components/StatusDot";
import type { BoardListing } from "@/ui/types";

/**
 * The name of the board a pane shows, as the vault lists it.
 * @param pane The pane.
 * @param listing The listing.
 * @returns The name, or null while the pane shows none.
 */
function paneBoardName(pane: ShellPane, listing: BoardListing): string | null {
	const board = boardAddressOf(pane.status.boardKey)?.board ?? null;
	if (board === null) return null;
	return listedBoard(listing, board)?.name ?? board;
}

/** Inputs for one tab. */
interface PaneTabProps {
	pane: ShellPane;
	index: number;
	active: boolean;
	listing: BoardListing;
}

/**
 * One pane's tab: its letter, the board it shows, and trouble when its socket is down.
 * @param props The pane, its place, whether it is focused and the listing.
 * @returns The tab.
 */
function PaneTab(props: PaneTabProps): JSX.Element {
	const { pane, index, active } = props;
	const letter = paneLetter(index);
	const name = paneBoardName(pane, props.listing);
	return (
		<ToggleGroupItem
			value={pane.status.paneId}
			aria-label={`Pane ${letter}${name === null ? "" : ` · ${name}`}`}
			aria-current={active ? "true" : undefined}
			className="border-border hover:bg-sidebar-accent aria-pressed:border-b-primary aria-pressed:text-foreground text-muted-foreground h-auto max-w-96 min-w-0 gap-2 rounded-none! border-r border-b-2 border-b-transparent px-3 focus-visible:ring-inset aria-pressed:bg-transparent"
		>
			<span
				aria-hidden="true"
				className="bg-foreground text-background inline-flex size-4 shrink-0 items-center justify-center rounded-[2px] font-mono text-[10px] font-medium"
			>
				{letter}
			</span>
			<span className="truncate">{name ?? "No board"}</span>
			{!pane.status.connected && (
				<span className="text-technical flex shrink-0 items-center gap-1 font-normal">
					<StatusDot tone="warning" />
					offline
				</span>
			)}
		</ToggleGroupItem>
	);
}

/** Inputs for the pane controls. */
interface PaneControlsProps {
	activePaneId: string;
	paneCount: number;
	actions: ShellActions;
}

/**
 * Add, close and present panes.
 * @param props The active pane, the pane count and the actions.
 * @returns Three icon controls.
 */
function PaneControls(props: PaneControlsProps): JSX.Element {
	const { activePaneId, paneCount, actions } = props;
	const handleAdd = useCallback(() => actions.addPane(), [actions]);
	const handleClose = useCallback(() => actions.closePane(activePaneId), [actions, activePaneId]);
	const handlePresent = useCallback(
		() => actions.present({ kind: "live", paneId: activePaneId }),
		[actions, activePaneId],
	);
	return (
		<span className="flex shrink-0 items-center gap-1 px-2">
			<IconButton label="Add pane" onClick={handleAdd} disabled={paneCount >= 2}>
				<RiAddLine />
			</IconButton>
			{paneCount > 1 && (
				<IconButton label={`Close pane ${activePaneId}`} onClick={handleClose}>
					<RiCloseLine />
				</IconButton>
			)}
			<IconButton
				label={`Present pane ${activePaneId} fullscreen`}
				shortcut={presentShortcutLabel()}
				onClick={handlePresent}
				disabled={activePaneId === ""}
			>
				<RiFullscreenLine />
			</IconButton>
		</span>
	);
}

/** Inputs for the pane bar. */
interface PaneBarProps {
	panes: readonly ShellPane[];
	activePaneId: string;
	listing: BoardListing;
	actions: ShellActions;
}

/**
 * The pane bar.
 * @param props The panes, the active pane, the listing and the actions.
 * @returns The 36px pane bar with its one-pixel bottom rule.
 */
function PaneBar(props: PaneBarProps): JSX.Element {
	const { actions, activePaneId, panes } = props;
	const value = useMemo(() => [activePaneId], [activePaneId]);
	const handleChange = useCallback(
		(next: unknown[]) => {
			const [paneId] = next;
			if (typeof paneId === "string") {
				actions.selectPane(paneId);
			}
		},
		[actions],
	);
	return (
		<div className="border-border bg-sidebar flex h-9 shrink-0 items-stretch border-b">
			{panes.length > 1 && (
				<ToggleGroup
					value={value}
					onValueChange={handleChange}
					spacing={0}
					aria-label="Pane"
					className="min-w-0 items-stretch rounded-none"
				>
					{panes.map((pane, index) => (
						<PaneTab
							key={pane.status.paneId}
							pane={pane}
							index={index}
							active={pane.status.paneId === activePaneId}
							listing={props.listing}
						/>
					))}
				</ToggleGroup>
			)}
			<span className="flex-1" />
			<PaneControls activePaneId={activePaneId} paneCount={panes.length} actions={actions} />
		</div>
	);
}

export { PaneBar, type PaneBarProps };
