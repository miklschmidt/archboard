import type { WorkbenchBoardStatusProps } from "../workbench-board-status/index.js";
import type { WorkbenchComposerController } from "../workbench-composer/index.js";
import type {
	ThreadLinkAccountFormId,
	ThreadLinkController,
	ThreadLinkRecoveryIntent,
} from "../workbench-thread-link/index.js";
import type { WorkbenchTimelineProps } from "../workbench-timeline/index.js";
import type { BrowserWorkbenchTransport } from "../workbench-transport/index.js";

export type WorkbenchFrameDisclosure = "expanded" | "collapsed";
export type WorkbenchFrameSpace = "workspace" | "fullscreen";

/** The shell-authored pane identity. The frame presents these bytes unchanged. */
export interface WorkbenchFramePaneIdentity {
	readonly id: string;
	readonly label: string;
}

export type WorkbenchFrameBoardStatusPort = Omit<WorkbenchBoardStatusProps, "paneLabel">;

export interface WorkbenchFrameThreadLinkPort {
	readonly controller: ThreadLinkController;
	readonly hostRecoveryIntents?: readonly ThreadLinkRecoveryIntent[];
	readonly initialAccountForm?: ThreadLinkAccountFormId;
}

/**
 * One pane's existing module-root ports. The frame composes them but never
 * copies their process, timeline, queue, approval, coordinator, or board state.
 */
export interface WorkbenchFramePane {
	readonly identity: WorkbenchFramePaneIdentity;
	readonly transport: BrowserWorkbenchTransport;
	readonly timeline: Omit<WorkbenchTimelineProps, "className" | "label">;
	readonly composerController: WorkbenchComposerController;
	readonly threadLink: WorkbenchFrameThreadLinkPort;
	readonly boardStatus: WorkbenchFrameBoardStatusPort;
}

export type WorkbenchFramePanes =
	| readonly [WorkbenchFramePane]
	| readonly [WorkbenchFramePane, WorkbenchFramePane];

export type WorkbenchFrameView =
	| Readonly<{ state: "loading"; detail: string }>
	| Readonly<{ state: "empty"; detail: string }>
	| Readonly<{ state: "error"; detail: string; recovery: string }>
	| Readonly<{
			state: "ready";
			panes: WorkbenchFramePanes;
			activePaneId: WorkbenchFramePaneIdentity["id"];
	  }>;

/**
 * A request carries its originating transport with its originating identity.
 * It is intentionally separate from the active pane so navigation cannot
 * retarget a response.
 */
export interface WorkbenchFrameRequestSource {
	readonly pane: WorkbenchFramePaneIdentity;
	readonly transport: BrowserWorkbenchTransport;
	readonly now?: () => number;
}

export type WorkbenchFrameRequest =
	| Readonly<{ state: "loading"; detail: string }>
	| Readonly<{ state: "empty"; detail: string }>
	| Readonly<{ state: "error"; detail: string; recovery: string }>
	| Readonly<{ state: "present"; source: WorkbenchFrameRequestSource }>;

export interface WorkbenchFrameProps {
	readonly view: WorkbenchFrameView;
	readonly request: WorkbenchFrameRequest;
	readonly disclosure: WorkbenchFrameDisclosure;
	readonly space: WorkbenchFrameSpace;
	readonly onActivePaneChange: (paneId: WorkbenchFramePaneIdentity["id"]) => void;
	readonly onDisclosureChange: (disclosure: WorkbenchFrameDisclosure) => void;
	readonly className?: string;
}
