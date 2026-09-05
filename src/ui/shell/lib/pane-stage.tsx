// The centre: one or two canvases side by side, each under its own claim
// banner and, while path focus is on, its dimming layer.

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback } from "react";

import { ExcalidrawStage } from "@/ui/canvas/excalidraw-stage";
import { Separator } from "@/ui/components/separator";
import type { PathFocusOverlay } from "@/ui/path-focus";
import { ClaimBanner } from "@/ui/shell/lib/claim-banner";
import type { ShellActions, ShellPane, ThemeChoice } from "@/ui/shell/lib/contracts";
import { PathFocusLayer } from "@/ui/shell/lib/path-focus-overlay";

/** Inputs for the stage row. */
interface CanvasStagesProps {
	panes: readonly ShellPane[];
	activePaneId: string;
	theme: ThemeChoice;
	/** Where the focused elements are, or null while focus is off. */
	overlay: PathFocusOverlay | null;
	actions: ShellActions;
}

/**
 * The overlay for one pane, when it is that pane's.
 * @param overlay The view's overlay, or null.
 * @param paneId The pane asking.
 * @returns The overlay, or null when it belongs elsewhere.
 */
function overlayFor(overlay: PathFocusOverlay | null, paneId: string): PathFocusOverlay | null {
	return overlay?.paneId === paneId ? overlay : null;
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
					active={pane.status.paneId === props.activePaneId}
					theme={props.theme}
					first={index === 0}
					overlay={overlayFor(props.overlay, pane.status.paneId)}
					actions={props.actions}
				/>
			))}
		</div>
	);
}

/** Inputs for one pane's stage. */
interface PaneStageProps {
	pane: ShellPane;
	active: boolean;
	theme: ThemeChoice;
	first: boolean;
	overlay: PathFocusOverlay | null;
	actions: ShellActions;
}

/**
 * One pane's canvas under its claim banner, with the separator that divides
 * it from the pane before. A disconnected pane is view-only.
 * @param props The pane, the theme, whether it is the first pane and the actions.
 * @returns The mounted canvas.
 */
function PaneStage(props: PaneStageProps): React.JSX.Element {
	const { actions, pane, overlay } = props;
	const { paneId, connected } = pane.status;
	const handleApi = useCallback(
		(api: ExcalidrawImperativeAPI) => actions.canvasReady(paneId, api),
		[actions, paneId],
	);
	return (
		<>
			{!props.first && <Separator orientation="vertical" />}
			<section
				aria-label={`Pane ${paneId}`}
				aria-current={props.active ? "true" : undefined}
				data-active={props.active ? "" : undefined}
				className="data-active:ring-primary/60 flex min-h-0 min-w-0 flex-1 flex-col data-active:ring-1 data-active:ring-inset"
			>
				<ClaimBanner pane={pane} actions={actions} />
				<div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
					<ExcalidrawStage theme={props.theme} viewModeEnabled={!connected} onApi={handleApi} />
					{overlay && <PathFocusLayer overlay={overlay} />}
				</div>
			</section>
		</>
	);
}

export { CanvasStages, type CanvasStagesProps };
