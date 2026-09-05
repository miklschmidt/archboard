// The centre: the pane bar, then one or two canvases side by side.

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useMemo } from "react";

import { ExcalidrawStage } from "@/ui/canvas/excalidraw-stage";
import { Separator } from "@/ui/components/separator";
import { ToggleGroup, ToggleGroupItem } from "@/ui/components/toggle-group";
import type { ShellActions, ShellPane, ThemeChoice } from "@/ui/shell/lib/contracts";

const PANE_LETTERS = ["A", "B"] as const;

/**
 * "Pane A · board": the pane's place in reading order and what it holds.
 * @param pane The pane.
 * @param index Its position in reading order.
 * @returns The label.
 */
function paneLabel(pane: ShellPane, index: number): string {
	const letter = PANE_LETTERS[index] ?? String(index + 1);
	const board = pane.status.board?.board ?? "no board";
	return `Pane ${letter} · ${board}`;
}

/** Inputs for the pane bar. */
interface PaneBarProps {
	panes: readonly ShellPane[];
	activePaneId: string;
	actions: ShellActions;
}

/**
 * The pane chooser: a single-choice toggle group naming each pane.
 * @param props The panes, the active pane and the actions.
 * @returns The pane bar.
 */
function PaneBar(props: PaneBarProps): React.JSX.Element {
	const { actions, activePaneId } = props;
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
		<div className="border-border bg-background flex h-9 shrink-0 items-center border-b px-2">
			<ToggleGroup
				value={value}
				onValueChange={handleChange}
				variant="outline"
				size="sm"
				spacing={0}
				aria-label="Pane"
			>
				{props.panes.map((pane, index) => (
					<ToggleGroupItem key={pane.status.paneId} value={pane.status.paneId}>
						{paneLabel(pane, index)}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</div>
	);
}

/** Inputs for the stage row. */
interface CanvasStagesProps {
	panes: readonly ShellPane[];
	theme: ThemeChoice;
	actions: ShellActions;
}

/**
 * One or two canvases side by side with a shared one-pixel separator.
 * @param props The panes to mount, the theme they render in and the actions.
 * @returns The stage row.
 */
function CanvasStages(props: CanvasStagesProps): React.JSX.Element {
	return (
		<div className="flex min-h-0 min-w-0 flex-1">
			{props.panes.map((pane, index) => (
				<PaneStage
					key={pane.status.paneId}
					pane={pane}
					theme={props.theme}
					first={index === 0}
					actions={props.actions}
				/>
			))}
		</div>
	);
}

/** Inputs for one pane's stage. */
interface PaneStageProps {
	pane: ShellPane;
	theme: ThemeChoice;
	first: boolean;
	actions: ShellActions;
}

/**
 * One pane's canvas, with the separator that divides it from the pane before.
 * @param props The pane, the theme, whether it is the first pane and the actions.
 * @returns The mounted canvas.
 */
function PaneStage(props: PaneStageProps): React.JSX.Element {
	const { actions } = props;
	const { paneId } = props.pane.status;
	const handleApi = useCallback(
		(api: ExcalidrawImperativeAPI) => actions.canvasReady(paneId, api),
		[actions, paneId],
	);
	return (
		<>
			{!props.first && <Separator orientation="vertical" />}
			<section aria-label={`Pane ${paneId}`} className="flex min-h-0 min-w-0 flex-1 flex-col">
				<ExcalidrawStage theme={props.theme} viewModeEnabled={false} onApi={handleApi} />
			</section>
		</>
	);
}

export { PaneBar, CanvasStages, paneLabel, type PaneBarProps, type CanvasStagesProps };
