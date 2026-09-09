// The centre: one or two canvases side by side, each under its own claim
// banner and, while path focus is on, its dimming layer. The same element is
// the fullscreen root: presenting a pane hides the others rather than
// remounting anything, so a canvas session never restarts.

import { Separator } from "@/ui/components/separator";
import type { PathFocusOverlay } from "@/ui/path-focus";
import { ClaimBanner } from "@/ui/shell/components/ClaimBanner";
import type { ShellActions, ShellPane, ShellPresentation } from "@/ui/shell/types/contracts";
import { PathFocusLayer } from "@/ui/shell/components/PathFocusLayer";
import { PresentationBar } from "@/ui/shell/components/PresentationBar";
import { RecoveryMessage } from "@/ui/shell/components/RecoveryMessage";

/** Inputs for the stage row. */
interface CanvasStagesProps {
	panes: readonly ShellPane[];
	activePaneId: string;
	/** Where the focused elements are, or null while focus is off. */
	overlay: PathFocusOverlay | null;
	/** The pane presented fullscreen, or null in the workspace. */
	presentation: ShellPresentation | null;
	/** Live voice controls for the presentation bar. */
	voiceControls: React.ReactNode;
	/** The fullscreen root: the application presents this element. */
	attachStage: ((element: HTMLDivElement | null) => void) | undefined;
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
 * Whether a pane is hidden by a presentation of another pane, or by recovery.
 * @param presentation The presentation, or null.
 * @param paneId The pane asking.
 * @returns True when the pane must not be shown.
 */
function hiddenBy(presentation: ShellPresentation | null, paneId: string): boolean {
	if (presentation === null) {
		return false;
	}
	return presentation.kind === "recovery" || presentation.paneId !== paneId;
}

/**
 * Find a pane by id.
 * @param panes The panes.
 * @param paneId The pane wanted.
 * @returns The pane, or null.
 */
function paneById(panes: readonly ShellPane[], paneId: string): ShellPane | null {
	return panes.find((pane) => pane.status.paneId === paneId) ?? null;
}

/** Inputs for the presentation's own chrome. */
interface PresentationChromeProps {
	presentation: ShellPresentation | null;
	presented: ShellPane | null;
	voiceControls: React.ReactNode;
	actions: ShellActions;
}

/**
 * The bar above a presented pane and, when the presented pane is
 * disconnected, the recovery message.
 * @param props The presentation, the pane it names and the actions.
 * @returns The chrome, or nothing in the workspace.
 */
function PresentationChrome(props: PresentationChromeProps): React.JSX.Element | null {
	const { presentation, presented } = props;
	if (presentation === null || presented === null) {
		return null;
	}
	return (
		<>
			<PresentationBar
				pane={presented}
				error={presentation.kind === "live" ? (presentation.error ?? null) : null}
				voiceControls={props.voiceControls}
				actions={props.actions}
			/>
			{presentation.kind === "recovery" && <RecoveryMessage message={presentation.message} />}
		</>
	);
}

/**
 * One or two canvases side by side with a shared one-pixel separator, under
 * the presentation bar while a pane is presented.
 * @param props The panes to mount, the presentation and the actions.
 * @returns The stage root.
 */
function CanvasStages(props: CanvasStagesProps): React.JSX.Element {
	const { presentation, panes, actions, attachStage, voiceControls, overlay, activePaneId } = props;
	const presented = presentation ? paneById(panes, presentation.paneId) : null;
	return (
		<div
			ref={attachStage}
			data-slot="canvas-stages"
			data-presenting={presented ? "" : undefined}
			className="bg-background flex min-h-0 min-w-0 flex-1 flex-col"
		>
			<PresentationChrome
				presentation={presentation}
				presented={presented}
				voiceControls={voiceControls}
				actions={actions}
			/>
			<div className="flex min-h-0 min-w-0 flex-1">
				{panes.map((pane, index) => (
					<PaneStage
						key={pane.status.paneId}
						pane={pane}
						active={pane.status.paneId === activePaneId}
						framed={panes.length > 1 && presented === null}
						first={index === 0 || presented !== null}
						hidden={hiddenBy(presentation, pane.status.paneId)}
						overlay={overlayFor(overlay, pane.status.paneId)}
						actions={actions}
					/>
				))}
			</div>
		</div>
	);
}

/**
 * The stage's classes: the inset cobalt ring is drawn only while two panes
 * share the centre.
 * @param framed Whether the active stage should carry the ring.
 * @returns The class list.
 */
function stageClass(framed: boolean): string {
	return framed
		? "data-active:ring-primary flex min-h-0 min-w-0 flex-1 flex-col outline-none data-active:ring-1 data-active:ring-inset"
		: "flex min-h-0 min-w-0 flex-1 flex-col outline-none";
}

/** Inputs for one pane's stage. */
interface PaneStageProps {
	pane: ShellPane;
	active: boolean;
	/** Draw the focus ring on the active stage: only while two panes share the centre. */
	framed: boolean;
	first: boolean;
	hidden: boolean;
	overlay: PathFocusOverlay | null;
	actions: ShellActions;
}

/**
 * One pane's canvas under its claim banner, with the separator that divides
 * it from the pane before. The canvas itself is the application's. With two
 * panes, the active one carries a one-pixel inset cobalt ring; alone, the
 * pane bar's underline already says which pane is focused.
 * @param props The pane, whether it is first, framed, hidden, its overlay and the actions.
 * @returns The mounted canvas.
 */
function PaneStage(props: PaneStageProps): React.JSX.Element {
	const { actions, pane, overlay } = props;
	const { paneId } = pane.status;
	return (
		<>
			{!props.first && !props.hidden && <Separator orientation="vertical" />}
			<section
				aria-label={`Pane ${paneId}`}
				aria-current={props.active ? "true" : undefined}
				data-active={props.active ? "" : undefined}
				hidden={props.hidden}
				// Focus lands here when the inspector closes: programmatic only, no tab stop.
				tabIndex={-1}
				className={stageClass(props.framed)}
			>
				<ClaimBanner pane={pane} actions={actions} />
				<div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
					{pane.canvas}
					{overlay && <PathFocusLayer overlay={overlay} />}
				</div>
			</section>
		</>
	);
}

export { CanvasStages, type CanvasStagesProps };
