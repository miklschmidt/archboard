// The desktop frame, in columns: the navigator (the brand at its top, the
// models or the files, and the agent at its foot), the code view beside it in
// Code mode, the conversation beside that while open, each with a handle to
// resize it, and the pane centre, composed from typed inputs and typed
// actions. There is
// no row across the whole frame: each column's top row is its own header, and
// the rows line up. The centre is also the fullscreen root, so presenting a
// pane never remounts it.

import {
	useCallback,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type JSX,
	type ReactNode,
} from "react";

import { shellLength } from "@archboard/renderer/shell-geometry";
import type { NavigatorMode, ShellActions, ShellView } from "#ui/shell/rules/contracts.ts";
import type { ColumnWidths } from "#ui/shell/clients/column-width.ts";
import { BrandBar } from "#ui/shell/components/BrandBar.tsx";
import { CodeViewSlot } from "#ui/shell/components/CodeViewSlot.tsx";
import { SideColumn, SIDE_COLUMN_HANDLE_WIDTH } from "#ui/shell/components/SideColumn.tsx";
import { Navigator } from "#ui/shell/components/Navigator.tsx";
import { NavigatorColumns } from "#ui/shell/components/NavigatorColumns.tsx";
import { PaneStages } from "#ui/shell/components/PaneStages.tsx";

/**
 * The height of the chrome row at the top of every column, set here from the
 * shared shell geometry, which the shell-layout owner holds the mounted shell
 * to. The navigator starts at the geometry's width, which the reference pane
 * takes its width from (ADR 0043), and a person can drag it to another.
 */
const SHELL_STYLE: CSSProperties = {
	"--shell-chrome-height": `${shellLength("chrome")}px`,
};

/** The conversation's widths: at rest, and the narrowest and widest a drag gives it. */
const CONVERSATION_WIDTHS: ColumnWidths = {
	key: "archboard.agent.panel.width",
	min: 320,
	max: 720,
	initial: shellLength("agentPanel"),
};

/** The room the panes need beside the conversation. */
const PANE_CENTRE_MIN_WIDTH = 560;

/**
 * The width Code must leave for the panes, the conversation handle and the open conversation.
 * @param conversationOpen Whether the conversation is open.
 * @returns The minimum width beyond the code view.
 */
function minBeyondCode(conversationOpen: boolean | undefined): number {
	const base = PANE_CENTRE_MIN_WIDTH + SIDE_COLUMN_HANDLE_WIDTH;
	return conversationOpen === true ? base + CONVERSATION_WIDTHS.min : base;
}

/**
 * The code view's widths: lines of code want more room than a conversation does. Like the
 * conversation, it is not part of the stage a drawing is measured against: it opens only when the
 * person asks, and the camera refits the narrower pane.
 */
const CODE_VIEW_WIDTHS: ColumnWidths = {
	key: "archboard.code.view.width",
	min: 360,
	max: 1100,
	initial: 560,
};

const CODE_VIEW_ID = "code-view";
const CONVERSATION_ID = "conversation";

/**
 * Close a column and return focus to its navigator control when focus would be lost.
 * @param shell The shell with the navigator.
 * @param id The column's panel ID, also used by its separator's aria-controls.
 * @param control The navigator control to focus.
 * @param close The action that closes the column, when the shell has one.
 */
function closeColumn(
	shell: HTMLDivElement | null,
	id: string,
	control: string,
	close: (() => void) | undefined,
): void {
	if (shell !== null) {
		const active = shell.ownerDocument.activeElement;
		if (active?.closest(`#${id}, [role="separator"][aria-controls="${id}"]`)) {
			shell.querySelector<HTMLElement>(control)?.focus();
		}
	}
	close?.();
}

/** Inputs for the shell. */
interface ShellProps {
	/** The application supplies format-aware empty guidance. */
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
	/** What the navigator lists; the code view stands beside it in Code. */
	navigatorMode?: NavigatorMode;
	/** The code view was dragged shut, which leaves Code. */
	onLeaveCode?: () => void;
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
	const shell = useRef<HTMLDivElement>(null);
	const [find, attachFind] = useState<HTMLDivElement | null>(null);
	const [destinations, attachDestinations] = useState<HTMLDivElement | null>(null);
	const [viewer, attachViewer] = useState<HTMLDivElement | null>(null);
	const mode = props.navigatorMode ?? "architecture";
	const column = useMemo(
		() => ({ find, destinations, viewer, mode }),
		[find, destinations, viewer, mode],
	);
	const codeView = useMemo(() => <CodeViewSlot attach={attachViewer} />, []);
	const head = useMemo(
		() => (
			<BrandBar
				theme={view.theme}
				actions={actions}
				diagnostics={props.diagnostics}
				attachFind={attachFind}
			/>
		),
		[view.theme, actions, props.diagnostics],
	);
	const navigator = useMemo(
		() => (
			<Navigator
				view={view}
				actions={actions}
				head={head}
				foot={props.agentDock}
				attachDestinations={attachDestinations}
			/>
		),
		[view, actions, head, props.agentDock],
	);
	const closeCode = useCallback(
		(): void =>
			closeColumn(
				shell.current,
				CODE_VIEW_ID,
				'[data-slot="navigator-mode"] [data-choice="architecture"]',
				props.onLeaveCode,
			),
		[props.onLeaveCode],
	);
	const closeConversation = useCallback(
		(): void =>
			closeColumn(
				shell.current,
				CONVERSATION_ID,
				'[data-slot="agent-dock"] [data-part="chat"] button',
				props.onAgentPanelClose,
			),
		[props.onAgentPanelClose],
	);
	return (
		<div ref={shell} className="bg-background flex h-full min-w-0" style={SHELL_STYLE}>
			<NavigatorColumns navigator={navigator}>
				<SideColumn
					id={CODE_VIEW_ID}
					label="Code view width"
					widths={CODE_VIEW_WIDTHS}
					minBeyond={minBeyondCode(props.agentPanelOpen)}
					keepsHandle={false}
					open={mode === "code"}
					onClose={closeCode}
					content={codeView}
				>
					<SideColumn
						id={CONVERSATION_ID}
						label="Conversation width"
						widths={CONVERSATION_WIDTHS}
						minBeyond={PANE_CENTRE_MIN_WIDTH}
						keepsHandle
						open={props.agentPanelOpen ?? false}
						onClose={closeConversation}
						content={props.agentPanel}
					>
						<PaneStages
							panes={view.panes}
							notices={view.notices}
							activePaneId={view.activePaneId}
							presentation={view.presentation}
							column={column}
							voiceControls={props.voiceControls ?? null}
							attachStage={props.attachStage}
							actions={actions}
						/>
					</SideColumn>
				</SideColumn>
			</NavigatorColumns>
		</div>
	);
}

export { Shell };
