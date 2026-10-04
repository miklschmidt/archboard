// The desktop frame, in columns: the navigator (the brand at its top, the
// boards, and the agent at its foot), the conversation beside it while open,
// with a handle to resize it, and the pane centre, composed from typed inputs
// and typed actions. There is
// no row across the whole frame: each column's top row is its own header, and
// the rows line up. The centre is also the fullscreen root, so presenting a
// pane never remounts it.

import { useMemo, type CSSProperties, type JSX, type ReactNode } from "react";

import { NAVIGATOR_WIDTH } from "@/shared/shell-geometry/index";
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
import { BrandBar, SETTINGS_TRIGGER_ID } from "@/ui/shell/components/BrandBar";
import { ConversationColumns } from "@/ui/shell/components/ConversationColumns";
import { Navigator } from "@/ui/shell/components/Navigator";
import { Notices } from "@/ui/shell/components/Notices";
import { PaneStages } from "@/ui/shell/components/PaneStages";
import { isPresentShortcut, presentShortcutLabel } from "@/ui/shell/lib/shortcuts";

/**
 * The navigator's width is the shell's one fixed column, set here from the
 * shared shell geometry so the reference pane a drawing is measured against
 * is derived from the width the shell draws (ADR 0028).
 */
const SHELL_STYLE: CSSProperties = {
	"--shell-navigator-width": `${NAVIGATOR_WIDTH}px`,
};

/** A close that does nothing, for a shell with no conversation. */
function noop(): void {}

/** Inputs for the shell. */
interface ShellProps {
	diagnostics?: ReactNode;
	view: ShellView;
	actions: ShellActions;
	/** The key that starts and ends voice, for the presentation bar, when the voice workbench supplies it. */
	voiceControls?: ReactNode;
	/** The agent at the navigator's foot: its voice, what it is doing, and the way to the conversation. */
	agentDock?: ReactNode;
	/** The conversation beside the navigator, drawn while it is open and while it slides out. */
	agentPanel?: ReactNode;
	/** Whether the conversation is open. */
	agentPanelOpen?: boolean;
	/** The conversation was dragged shut. */
	onAgentPanelClose?: () => void;
	/** The fullscreen root: the centre stage element. */
	attachStage?: (element: HTMLDivElement | null) => void;
}

/**
 * The application shell: the navigator, the conversation while it is open,
 * and the pane centre.
 * @param props The view, the actions and the slots.
 * @returns The full frame.
 */
function Shell(props: ShellProps): JSX.Element {
	const { view, actions } = props;
	const { boards, levels } = view.boards;
	const outline = useMemo(() => buildOutline(boards, levels), [boards, levels]);
	const head = useMemo(
		() => <BrandBar theme={view.theme} actions={actions} diagnostics={props.diagnostics} />,
		[view.theme, actions, props.diagnostics],
	);
	return (
		<div className="bg-background flex h-full min-w-0" style={SHELL_STYLE}>
			<Navigator
				view={view}
				outline={outline}
				actions={actions}
				head={head}
				foot={props.agentDock}
			/>
			<ConversationColumns
				open={props.agentPanelOpen ?? false}
				onClose={props.onAgentPanelClose ?? noop}
				conversation={props.agentPanel}
			>
				<Notices notices={view.notices} actions={actions} />
				<PaneStages
					panes={view.panes}
					activePaneId={view.activePaneId}
					presentation={view.presentation}
					voiceControls={props.voiceControls ?? null}
					attachStage={props.attachStage}
					actions={actions}
				/>
			</ConversationColumns>
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
