// One pane as the application mounts it: the session options, memoised so a
// render is not a pane report, and the canvas bound to them. The workbench
// rides the pane's socket through one socket owner per pane.

import { useCallback, useMemo, type JSX } from "react";

import type { PaneHandles } from "@/ui/application/lib/pane-handles";
import type { PaneHost } from "@/ui/application/hooks/use-panes";
import { CanvasPane } from "@/ui/canvas/CanvasPane";
import type { CanvasSessionOptions, CanvasTheme } from "@/ui/canvas/use-canvas-session";
import {
	createCanvasWorkbenchSocketOwner,
	type CanvasWorkbenchSocketOwner,
} from "@/ui/canvas/workbench-socket";
import {
	createBrowserWorkbenchTransport,
	type BrowserWorkbenchTransport,
} from "@/ui/workbench-transport";

/** Inputs for one application pane. */
interface ApplicationPaneProps {
	paneId: string;
	primary: boolean;
	focused: boolean;
	theme: CanvasTheme;
	host: PaneHost;
	handles: PaneHandles;
}

/**
 * The session options for one pane over the shared host.
 * @param props The pane's inputs.
 * @param onBoardError The pane-bound board error callback.
 * @param createWorkbenchSockets The pane-bound socket owner factory.
 * @returns The options.
 */
function optionsFor(
	props: ApplicationPaneProps,
	onBoardError: (error: string) => void,
	createWorkbenchSockets: () => CanvasWorkbenchSocketOwner<BrowserWorkbenchTransport>,
): CanvasSessionOptions<BrowserWorkbenchTransport> {
	const { host } = props;
	return {
		paneId: props.paneId,
		primary: props.primary,
		focused: props.focused,
		theme: props.theme,
		onStatus: host.onStatus,
		onHolder: host.onHolder,
		onLibraryChanged: host.onLibraryChanged,
		onLibraryChange: host.onLibraryChange,
		onLayoutRequest: host.onLayoutRequest,
		onPaneStateAccepted: host.onPaneStateAccepted,
		onPaneReconnected: host.onPaneReconnected,
		onBoardError,
		onBoardLinkError: host.onBoardLinkError,
		onStaleFrontend: host.onStaleFrontend,
		onThemeChange: host.onThemeChange,
		onSelection: host.onSelection,
		onPathFocus: host.onPathFocus,
		onPathFocusOverlay: host.onPathFocusOverlay,
		onCodeTargetNotice: host.onCodeTargetNotice,
		onAgentActivity: host.onAgentActivity,
		onEditsWithdrawn: host.onEditsWithdrawn,
		createWorkbenchSockets,
	};
}

/**
 * One pane.
 * @param props The pane's identity, facets, theme, host and handles.
 * @returns The mounted canvas.
 */
function ApplicationPane(props: ApplicationPaneProps): JSX.Element {
	const { paneId, primary, focused, theme, host, handles } = props;
	const onBoardError = useCallback(
		(error: string): void => host.onBoardError(paneId, error),
		[host, paneId],
	);
	const createWorkbenchSockets = useCallback(
		(): CanvasWorkbenchSocketOwner<BrowserWorkbenchTransport> =>
			createCanvasWorkbenchSocketOwner({
				media: handles.media(paneId),
				createTransport: createBrowserWorkbenchTransport,
			}),
		[handles, paneId],
	);
	const options = useMemo(
		() =>
			optionsFor(
				{ paneId, primary, focused, theme, host, handles },
				onBoardError,
				createWorkbenchSockets,
			),
		[paneId, primary, focused, theme, host, handles, onBoardError, createWorkbenchSockets],
	);
	return <CanvasPane options={options} onSession={host.onSession} />;
}

export { ApplicationPane, type ApplicationPaneProps };
