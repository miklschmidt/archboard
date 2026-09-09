// The pane bar: one flat tab per pane, its status inline after its name, and
// the controls that add, close and present panes. The focused tab carries a
// two-pixel cobalt rule along its bottom edge; nothing else is drawn.

import { RiAddLine, RiCloseLine, RiFullscreenLine } from "@remixicon/react";
import { useCallback, useMemo } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/ui/components/toggle-group";
import type { ShellActions, ShellPane } from "@/ui/shell/types/contracts";
import { IconButton } from "@/ui/shell/components/IconButton";
import { paneLetter } from "@/ui/shell/lib/navigator-entries";
import { presentShortcutLabel } from "@/ui/shell/lib/shortcuts";
import { StatusDot } from "@/ui/shell/components/StatusDot";
import { clockTime } from "@/ui/shell/lib/time";

/**
 * "Pane A · board": the pane's place in reading order and what it holds.
 * @param pane The pane.
 * @param index Its position in reading order.
 * @returns The label.
 */
function paneLabel(pane: ShellPane, index: number): string {
	const board = pane.status.board?.board ?? "no board";
	return `Pane ${paneLetter(index)} · ${board}`;
}

/** Inputs for one pane's status line. */
interface PaneStatusLineProps {
	pane: ShellPane;
}

/**
 * What a pane reports: connection, element count, last change, and whether
 * its board has stopped saving or was written elsewhere.
 * @param props The pane.
 * @returns The status line.
 */
function PaneStatusLine(props: PaneStatusLineProps): React.JSX.Element {
	const { status } = props.pane;
	return (
		<span className="text-technical text-muted-foreground flex items-center gap-1.5 font-normal">
			<StatusDot tone={status.connected ? "live" : "idle"} />
			{status.connected ? "Connected" : "Offline"}
			<span aria-hidden="true">·</span>
			<span className="font-mono">{status.elementCount}</span> elements
			{status.lastChangeAt !== null && (
				<>
					<span aria-hidden="true">·</span>
					<time dateTime={status.lastChangeAt} className="font-mono">
						{clockTime(status.lastChangeAt)}
					</time>
				</>
			)}
			{status.hold && <span className="text-warning-foreground">· not saving</span>}
			{status.writtenElsewhere && (
				<span className="text-warning-foreground">· written elsewhere</span>
			)}
		</span>
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
function PaneControls(props: PaneControlsProps): React.JSX.Element {
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
			<IconButton
				label={`Close pane ${activePaneId}`}
				onClick={handleClose}
				disabled={paneCount <= 1}
			>
				<RiCloseLine />
			</IconButton>
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
	actions: ShellActions;
}

/**
 * The pane chooser: a single-choice toggle group naming each pane, with the
 * focused pane underlined and each pane's status inline after its name.
 * @param props The panes, the active pane and the actions.
 * @returns The 36px pane bar with its one-pixel bottom rule.
 */
function PaneBar(props: PaneBarProps): React.JSX.Element {
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
		<div className="border-border bg-background flex h-9 shrink-0 items-stretch border-b">
			<ToggleGroup
				value={value}
				onValueChange={handleChange}
				spacing={0}
				aria-label="Pane"
				className="min-w-0 items-stretch rounded-none"
			>
				{panes.map((pane, index) => (
					<ToggleGroupItem
						key={pane.status.paneId}
						value={pane.status.paneId}
						aria-current={pane.status.paneId === activePaneId ? "true" : undefined}
						className="border-border hover:bg-sidebar-accent aria-pressed:border-b-primary aria-pressed:text-foreground text-muted-foreground h-auto min-w-0 gap-3 rounded-none! border-r border-b-2 border-b-transparent px-4 focus-visible:ring-inset aria-pressed:bg-transparent"
					>
						<span className="truncate">{paneLabel(pane, index)}</span>
						<PaneStatusLine pane={pane} />
					</ToggleGroupItem>
				))}
			</ToggleGroup>
			<span className="flex-1" />
			<PaneControls activePaneId={activePaneId} paneCount={panes.length} actions={actions} />
		</div>
	);
}

export { PaneBar, paneLabel, type PaneBarProps };
