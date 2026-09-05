// The desktop frame: header, navigator, canvas centre, inspector and the
// workbench dock, composed from typed inputs and typed actions.

import { SidebarProvider } from "@/ui/components/sidebar";
import type {
	ScratchBoardEntry,
	SelectionMetadataRow,
	SelectionProjection,
	SettingsSurface,
	ShellActions,
	ShellNotice,
	ShellNoticeAction,
	ShellPane,
	ShellPresentation,
	ShellView,
	ThemeChoice,
} from "@/ui/shell/lib/contracts";
import { Header } from "@/ui/shell/lib/header";
import { Inspector } from "@/ui/shell/lib/inspector";
import { Navigator } from "@/ui/shell/lib/navigator";
import { Notices } from "@/ui/shell/lib/notices";
import { CanvasStages, PaneBar } from "@/ui/shell/lib/pane-stage";
import { Presentation } from "@/ui/shell/lib/presentation";
import { WorkbenchDock } from "@/ui/shell/lib/workbench-dock";

/** The navigator's width; the sidebar reads it from this custom property. */
const SIDEBAR_STYLE: React.CSSProperties = { "--sidebar-width": "15rem" };

/** Inputs for the shell. */
interface ShellProps {
	view: ShellView;
	actions: ShellActions;
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
 * The workspace: navigator, centre column and inspector under the header.
 * @param props The view and actions.
 * @returns The full frame.
 */
function Workspace(props: ShellProps): React.JSX.Element {
	const { view, actions } = props;
	const active = paneById(view, view.activePaneId);
	return (
		<div className="bg-background flex h-full flex-col">
			<Header
				current={view.current}
				theme={view.theme}
				pane={active}
				paneCount={view.panes.length}
				actions={actions}
			/>
			<SidebarProvider style={SIDEBAR_STYLE} className="min-h-0 flex-1">
				<Navigator view={view} actions={actions} />
				<div className="flex min-h-0 min-w-0 flex-1 flex-col">
					<Notices notices={view.notices} actions={actions} />
					<PaneBar panes={view.panes} activePaneId={view.activePaneId} actions={actions} />
					<CanvasStages panes={view.panes} theme={view.theme} actions={actions} />
					<WorkbenchDock pane={active} />
				</div>
				{view.selection && <Inspector selection={view.selection} actions={actions} />}
			</SidebarProvider>
		</div>
	);
}

/**
 * The application shell.
 * @param props The view and actions.
 * @returns The workspace, or one pane presented fullscreen.
 */
function Shell(props: ShellProps): React.JSX.Element {
	const { view, actions } = props;
	const presented = view.presentation ? paneById(view, view.presentation.paneId) : null;
	if (presented) {
		return <Presentation pane={presented} theme={view.theme} actions={actions} />;
	}
	return <Workspace view={view} actions={actions} />;
}

export {
	Shell,
	type ShellProps,
	type ShellView,
	type ShellActions,
	type ShellPane,
	type ShellNotice,
	type ShellNoticeAction,
	type ShellPresentation,
	type ScratchBoardEntry,
	type SelectionProjection,
	type SelectionMetadataRow,
	type SettingsSurface,
	type ThemeChoice,
};
