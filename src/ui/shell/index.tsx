// The desktop frame: header, navigator, canvas centre, inspector and the
// workbench dock, composed from typed inputs and typed actions. The centre is
// also the fullscreen root, so presenting a pane never remounts a canvas.

import { SidebarProvider } from "@/ui/components/sidebar";
import { Inspector } from "@/ui/selection-inspector/inspector";
import type {
	LivePresentation,
	RecoveryPresentation,
	ScratchBoardEntry,
	SelectableNoticeAction,
	SettingsSurface,
	ShellActions,
	ShellNotice,
	ShellNoticeAction,
	ShellPane,
	ShellPresentation,
	ShellView,
	TakeBackState,
	ThemeChoice,
} from "@/ui/shell/lib/contracts";
import { Header } from "@/ui/shell/lib/header";
import { Navigator } from "@/ui/shell/lib/navigator";
import { Notices } from "@/ui/shell/lib/notices";
import { PaneBar } from "@/ui/shell/lib/pane-bar";
import { CanvasStages } from "@/ui/shell/lib/pane-stage";
import { WorkbenchDock } from "@/ui/shell/lib/workbench-dock";

/** The navigator's width; the sidebar reads it from this custom property. */
const SIDEBAR_STYLE: React.CSSProperties = { "--sidebar-width": "15rem" };

/** Inputs for the shell. */
interface ShellProps {
	view: ShellView;
	actions: ShellActions;
	/** Live voice controls for the presentation bar, when the voice workbench supplies them. */
	voiceControls?: React.ReactNode;
	/** The workbench's compact controls for the dock header. */
	dockHeader?: React.ReactNode;
	/** The workbench itself, for the dock body. */
	dockBody?: React.ReactNode;
	/** The fullscreen root: the centre stage element. */
	attachStage?: (element: HTMLDivElement | null) => void;
}

/**
 * Find a pane by id.
 * @param view The shell view.
 * @param paneId The pane wanted.
 * @returns The pane, or null when no pane has that id.
 */
function paneById(view: ShellView, paneId: string): ShellPane | null {
	return view.panes.find((pane) => pane.status.paneId === paneId) ?? null;
}

/**
 * The application shell: navigator, centre column and inspector under the header.
 * @param props The view, the actions and the slots.
 * @returns The full frame.
 */
function Shell(props: ShellProps): React.JSX.Element {
	const { view, actions } = props;
	const active = paneById(view, view.activePaneId);
	return (
		<div className="bg-background flex h-full min-w-0 flex-col">
			<Header current={view.current} theme={view.theme} pane={active} actions={actions} />
			<SidebarProvider style={SIDEBAR_STYLE} className="min-h-0 min-w-0 flex-1">
				<Navigator view={view} actions={actions} />
				<div className="flex min-h-0 min-w-0 flex-1 flex-col">
					<Notices notices={view.notices} actions={actions} />
					<PaneBar panes={view.panes} activePaneId={view.activePaneId} actions={actions} />
					<CanvasStages
						panes={view.panes}
						activePaneId={view.activePaneId}
						overlay={view.pathFocusOverlay}
						presentation={view.presentation}
						voiceControls={props.voiceControls ?? null}
						attachStage={props.attachStage}
						actions={actions}
					/>
					<WorkbenchDock
						pane={active}
						paneCount={view.panes.length}
						headerControls={props.dockHeader ?? null}
						body={props.dockBody ?? null}
					/>
				</div>
				<Inspector selection={view.selection} pathFocus={view.pathFocus} actions={actions} />
			</SidebarProvider>
		</div>
	);
}

export {
	Shell,
	type ShellProps,
	type ShellView,
	type ShellActions,
	type ShellPane,
	type TakeBackState,
	type ShellNotice,
	type ShellNoticeAction,
	type SelectableNoticeAction,
	type ShellPresentation,
	type LivePresentation,
	type RecoveryPresentation,
	type ScratchBoardEntry,
	type SettingsSurface,
	type ThemeChoice,
};
