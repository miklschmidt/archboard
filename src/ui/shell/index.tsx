// The desktop frame: header, navigator, the pane centre, the agent bar under
// it and the conversation panel beside it while open, composed from typed
// inputs and typed actions. The centre is also the
// fullscreen root, so presenting a pane never remounts it.

import { useMemo, type CSSProperties, type JSX, type ReactNode } from "react";

import { AGENT_PANEL_WIDTH, NAVIGATOR_WIDTH } from "@/shared/shell-geometry/index";
import { buildOutline } from "@/ui/board-catalog";
import type {
	LivePresentation,
	RecoveryPresentation,
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
} from "@/ui/shell/types/contracts";
import { Header, SETTINGS_TRIGGER_ID } from "@/ui/shell/components/Header";
import { Navigator } from "@/ui/shell/components/Navigator";
import { Notices } from "@/ui/shell/components/Notices";
import { PaneBar } from "@/ui/shell/components/PaneBar";
import { PaneStages } from "@/ui/shell/components/PaneStages";
import { isPresentShortcut, presentShortcutLabel } from "@/ui/shell/lib/shortcuts";

/**
 * The navigator's width is the shell's one fixed column, set here from the
 * shared shell geometry so the reference pane a drawing is measured against
 * is derived from the width the shell draws (ADR 0028).
 */
const SHELL_STYLE: CSSProperties = {
	"--shell-navigator-width": `${NAVIGATOR_WIDTH}px`,
	"--agent-panel-width": `${AGENT_PANEL_WIDTH}px`,
};

/** Inputs for the shell. */
interface ShellProps {
	diagnostics?: ReactNode;
	view: ShellView;
	actions: ShellActions;
	/** Live voice controls for the presentation bar, when the voice workbench supplies them. */
	voiceControls?: ReactNode;
	/** The search at the top of the shell, over every board's parts. */
	search?: ReactNode;
	/** The agent bar under the panes: the agent's state, Talk and the composer. */
	agentBar?: ReactNode;
	/** The conversation panel beside the panes, while it is open. */
	agentPanel?: ReactNode;
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
 * The application shell: navigator and centre column under the header.
 * @param props The view, the actions and the slots.
 * @returns The full frame.
 */
function Shell(props: ShellProps): JSX.Element {
	const { view, actions } = props;
	const active = paneById(view, view.activePaneId);
	const { boards, levels } = view.boards;
	const outline = useMemo(() => buildOutline(boards, levels), [boards, levels]);
	return (
		<div className="bg-background flex h-full min-w-0 flex-col" style={SHELL_STYLE}>
			<Header
				search={props.search}
				theme={view.theme}
				connected={active?.status.connected !== false}
				actions={actions}
				diagnostics={props.diagnostics}
			/>
			<div className="flex min-h-0 min-w-0 flex-1">
				<Navigator view={view} outline={outline} actions={actions} />
				<div className="flex min-h-0 min-w-0 flex-1 flex-col">
					<div className="flex min-h-0 min-w-0 flex-1">
						<div className="flex min-h-0 min-w-0 flex-1 flex-col">
							<Notices notices={view.notices} actions={actions} />
							<PaneBar
								panes={view.panes}
								activePaneId={view.activePaneId}
								listing={view.boards}
								actions={actions}
							/>
							<PaneStages
								panes={view.panes}
								activePaneId={view.activePaneId}
								presentation={view.presentation}
								voiceControls={props.voiceControls ?? null}
								attachStage={props.attachStage}
								actions={actions}
							/>
						</div>
						{props.agentPanel}
					</div>
					{props.agentBar}
				</div>
			</div>
		</div>
	);
}

export {
	SETTINGS_TRIGGER_ID,
	Shell,
	isPresentShortcut,
	presentShortcutLabel,
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
	type SettingsSurface,
	type ThemeChoice,
};
