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

const REQUEST_SOURCE_PANE_ID = Symbol("workbench-frame-request-source-pane");

/**
 * A request carries its originating transport with its originating identity.
 * It is intentionally separate from the active pane so navigation cannot
 * retarget a response.
 */
export interface WorkbenchFrameRequestSource {
	readonly [REQUEST_SOURCE_PANE_ID]: WorkbenchFramePaneIdentity["id"];
	readonly pane: WorkbenchFramePaneIdentity;
	readonly transport: BrowserWorkbenchTransport;
	readonly now?: () => number;
}

/** Return the reason a captured source cannot safely present request actions. */
export function workbenchFrameRequestSourceIssue(
	source: WorkbenchFrameRequestSource,
): string | null {
	if (source.pane.id.trim() === "" || source.pane.label.trim() === "") {
		return "The application-wide request has no exact source pane identity and label.";
	}
	if (source[REQUEST_SOURCE_PANE_ID] !== source.pane.id) {
		return "The application-wide request was not captured from the pane identity it displays.";
	}
	const lease = source.transport.lease();
	if (lease !== null && lease.paneId !== source.pane.id) {
		return `The application-wide request source ${source.pane.label} does not match transport pane ${lease.paneId}.`;
	}
	return null;
}

/**
 * Capture identity and dispatch from one pane port. Callers cannot construct a
 * source by freely pairing one pane label with another pane's transport.
 */
export function captureWorkbenchFrameRequestSource(
	pane: Pick<WorkbenchFramePane, "identity" | "transport">,
	now?: () => number,
): WorkbenchFrameRequestSource {
	const captured = Object.freeze({
		[REQUEST_SOURCE_PANE_ID]: pane.identity.id,
		pane: Object.freeze({ ...pane.identity }),
		transport: pane.transport,
		...(now === undefined ? {} : { now }),
	}) satisfies WorkbenchFrameRequestSource;
	const issue = workbenchFrameRequestSourceIssue(captured);
	if (issue !== null) throw new TypeError(issue);
	return captured;
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
