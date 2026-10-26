// The desktop frame, in columns: the navigator (the brand at its top, the
// boards, and the agent at its foot), the conversation beside it while open,
// with a handle to resize it, and the pane centre, composed from typed inputs
// and typed actions. There is
// no row across the whole frame: each column's top row is its own header, and
// the rows line up. The centre is also the fullscreen root, so presenting a
// pane never remounts it.

import { useMemo, type CSSProperties, type JSX, type ReactNode } from "react";

import { CHROME_HEIGHT, NAVIGATOR_WIDTH } from "@archboard/renderer/shell-geometry";
import type { ShellActions, ShellView } from "#ui/rules/shell/contracts.ts";
import { BrandBar } from "#ui/components/shell/BrandBar.tsx";
import { ConversationColumns } from "#ui/components/shell/ConversationColumns.tsx";
import { Navigator } from "#ui/components/shell/Navigator.tsx";
import { Notices } from "#ui/components/shell/Notices.tsx";
import { PaneStages } from "#ui/components/shell/PaneStages.tsx";

/**
 * The navigator's width, the shell's one fixed column, and the height of the
 * chrome row at the top of every column, set here from the shared shell
 * geometry, which the shell-layout owner holds the mounted shell to. The
 * reference pane takes its width from the same geometry (ADR 0043).
 */
const SHELL_STYLE: CSSProperties = {
	"--shell-navigator-width": `${NAVIGATOR_WIDTH}px`,
	"--shell-chrome-height": `${CHROME_HEIGHT}px`,
};

/** A close that does nothing, for a shell with no conversation. */
function noop(): void {}

/** Inputs for the shell. */
interface ShellProps {
	/** The application supplies format-aware empty guidance. */
	emptyNotice?: ReactNode;
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
	const head = useMemo(
		() => <BrandBar theme={view.theme} actions={actions} diagnostics={props.diagnostics} />,
		[view.theme, actions, props.diagnostics],
	);
	return (
		<div className="bg-background flex h-full min-w-0" style={SHELL_STYLE}>
			<Navigator
				view={view}
				actions={actions}
				head={head}
				foot={props.agentDock}
				emptyNotice={props.emptyNotice}
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

export { Shell, type ShellProps };
