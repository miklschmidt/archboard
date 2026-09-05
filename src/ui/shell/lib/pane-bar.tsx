// The pane bar: one tab per pane, each with a status line beneath its name,
// and the controls that add, close and present panes.

import { RiAddLine, RiCloseLine, RiFullscreenLine } from "@remixicon/react";
import { useCallback, useMemo } from "react";

import { buttonVariants } from "@/ui/components/button";
import { ToggleGroup, ToggleGroupItem } from "@/ui/components/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/components/tooltip";
import type { ShellActions, ShellPane } from "@/ui/shell/lib/contracts";
import { paneLetter } from "@/ui/shell/lib/navigator-entries";
import { StatusDot } from "@/ui/shell/lib/status-dot";
import { clockTime } from "@/ui/shell/lib/time";

const ICON_BUTTON_CLASS = buttonVariants({ variant: "ghost", size: "icon-sm" });

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
		<span className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-normal">
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
			{status.hold && <span className="text-destructive">· not saving</span>}
			{status.writtenElsewhere && <span className="text-destructive">· written elsewhere</span>}
		</span>
	);
}

/** Inputs for an icon control. */
interface IconControlProps {
	label: string;
	onClick: () => void;
	disabled: boolean;
	children: React.ReactNode;
}

/**
 * An icon control with a tooltip that doubles as its accessible name.
 * @param props The label, icon and click handler.
 * @returns The tooltip-wrapped button.
 */
function IconControl(props: IconControlProps): React.JSX.Element {
	return (
		<Tooltip>
			<TooltipTrigger
				className={ICON_BUTTON_CLASS}
				aria-label={props.label}
				onClick={props.onClick}
				disabled={props.disabled}
			>
				{props.children}
			</TooltipTrigger>
			<TooltipContent>{props.label}</TooltipContent>
		</Tooltip>
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
		<span className="flex shrink-0 items-center gap-0.5">
			<IconControl label="Add pane" onClick={handleAdd} disabled={paneCount >= 2}>
				<RiAddLine />
			</IconControl>
			<IconControl
				label={`Close pane ${activePaneId}`}
				onClick={handleClose}
				disabled={paneCount <= 1}
			>
				<RiCloseLine />
			</IconControl>
			<IconControl
				label={`Present pane ${activePaneId} fullscreen`}
				onClick={handlePresent}
				disabled={activePaneId === ""}
			>
				<RiFullscreenLine />
			</IconControl>
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
 * focused pane marked and each pane's status beneath its name.
 * @param props The panes, the active pane and the actions.
 * @returns The pane bar.
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
		<div className="border-border bg-background flex h-12 shrink-0 items-center gap-2 border-b px-2">
			<ToggleGroup
				value={value}
				onValueChange={handleChange}
				variant="outline"
				size="sm"
				spacing={0}
				aria-label="Pane"
				className="min-w-0"
			>
				{panes.map((pane, index) => (
					<ToggleGroupItem
						key={pane.status.paneId}
						value={pane.status.paneId}
						aria-current={pane.status.paneId === activePaneId ? "true" : undefined}
						className="aria-pressed:ring-primary h-auto flex-col items-start gap-0 px-3 py-1 aria-pressed:ring-1 aria-pressed:ring-inset"
					>
						<span className="font-medium">{paneLabel(pane, index)}</span>
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
