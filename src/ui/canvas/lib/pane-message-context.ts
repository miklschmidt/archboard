// The message handlers' view of one pane, assembled from the pane's parts.
// Browser capture and viewport requests are answered here too: they arrive on
// the socket and answer over HTTP.

import type { ExcalidrawImperativeAPI, LibraryItems } from "@excalidraw/excalidraw/types";

import { postBrowserCaptureResult, postViewportResult } from "@/ui/canvas/api";
import type { CanvasFileOwner } from "@/ui/canvas/files";
import { answerBrowserCapture, answerViewport } from "@/ui/canvas/lib/browser-requests";
import type { HoldKeeper } from "@/ui/canvas/lib/hold-keeper";
import type { Reporting } from "@/ui/canvas/lib/reporting";
import type { CanvasSessionOptions } from "@/ui/canvas/lib/session-contracts";
import type { MessageContext } from "@/ui/canvas/lib/socket-messages";
import type { WorkbenchTransportPort } from "@/ui/canvas/workbench-port";
import type {
	BoardHold,
	BoardIdentity,
	DoingEntry,
	LockHolder,
	NoteWrittenElsewhere,
	WebSocketMessage,
} from "@/ui/types";

/** The pane's parts a message may reach. */
interface MessageContextParts<Transport extends WorkbenchTransportPort> {
	readonly paneId: string;
	readonly clientId: string;
	readonly options: () => CanvasSessionOptions<Transport>;
	readonly api: () => ExcalidrawImperativeAPI | null;
	readonly boardKey: () => string | null;
	readonly reporting: Reporting;
	readonly holdKeeper: HoldKeeper;
	readonly adoptBoard: (key: string | undefined, identity: BoardIdentity | undefined) => void;
	readonly noteChange: () => void;
	readonly publishStatus: () => void;
	readonly setHold: (hold: BoardHold | null) => void;
	readonly setWrittenElsewhere: (notice: NoteWrittenElsewhere | null) => void;
	readonly setDoing: (entries: DoingEntry[]) => void;
	readonly setHolder: (holder: LockHolder | null) => void;
	readonly releaseRecoveredHold: () => void;
}

/**
 * No files.
 * @returns An empty record.
 */
function noFiles(): Record<string, never> {
	return {};
}

/** Nowhere to add files before the canvas mounts. */
function dropFiles(): void {
	// The canvas has not mounted; the board's frame will carry its files again.
}

/** A file owner that holds nothing, for a message arriving before the canvas mounts. */
const NO_FILES: CanvasFileOwner = {
	getFiles: noFiles,
	addFiles: dropFiles,
};

/**
 * Assemble the message handlers' view of one pane.
 * @param parts The pane's parts.
 * @returns The context.
 */
function createMessageContext<Transport extends WorkbenchTransportPort>(
	parts: MessageContextParts<Transport>,
): MessageContext {
	const { reporting, holdKeeper } = parts;

	/**
	 * Answer a browser capture request.
	 * @param data The request.
	 */
	async function answerCapture(data: WebSocketMessage): Promise<void> {
		const api = parts.api();
		const requestId = data.requestId;
		if (!api || requestId === undefined) {
			return;
		}
		await answerBrowserCapture(api, data, async (payload) => {
			await postBrowserCaptureResult(requestId, payload).catch(() => undefined);
		});
	}

	/**
	 * Answer a viewport request.
	 * @param data The request.
	 */
	async function answerViewportRequest(data: WebSocketMessage): Promise<void> {
		const api = parts.api();
		const requestId = data.requestId;
		if (!api || requestId === undefined) {
			return;
		}
		await answerViewport(
			api,
			data,
			async (payload) => {
				await postViewportResult(requestId, payload).catch(() => undefined);
			},
			reporting.applyCamera,
		);
	}

	/**
	 * Whether this pane is the primary one.
	 * @returns True when primary.
	 */
	function primary(): boolean {
		return parts.options().primary;
	}

	/**
	 * The server said who holds the board.
	 * @param holder The holder when it is not this pane, or null.
	 * @param mine Whether this pane holds it.
	 */
	function setHolder(holder: LockHolder | null, mine: boolean): void {
		holdKeeper.learnHolder(mine);
		parts.setHolder(holder);
	}

	/**
	 * The shell's library listener, if any.
	 * @returns The listener.
	 */
	function onLibraryChanged(): ((items: LibraryItems) => void) | undefined {
		return parts.options().onLibraryChanged;
	}

	/**
	 * The shell's layout listener, bound to this pane, if any.
	 * @returns The listener.
	 */
	function onLayoutRequest(): ((request: "open" | "close") => void) | undefined {
		const handler = parts.options().onLayoutRequest;
		if (handler === undefined) {
			return undefined;
		}
		/**
		 * Forward a layout request with this pane's id.
		 * @param request Open another pane, or close this one.
		 */
		function forward(request: "open" | "close"): void {
			handler?.(parts.paneId, request);
		}
		return forward;
	}

	/**
	 * The shell's board error listener, if any.
	 * @returns The listener.
	 */
	function onBoardError(): ((error: string) => void) | undefined {
		return parts.options().onBoardError;
	}

	/**
	 * The shell's agent activity listener, if any.
	 * @returns The listener.
	 */
	function onAgentActivity(): CanvasSessionOptions<Transport>["onAgentActivity"] {
		return parts.options().onAgentActivity;
	}

	/**
	 * Excalidraw's files, or nothing before the canvas mounts.
	 * @returns The file owner.
	 */
	function files(): CanvasFileOwner {
		return parts.api() ?? NO_FILES;
	}

	return {
		/**
		 * Excalidraw's files, or nothing before the canvas mounts.
		 * @returns The file owner.
		 */
		get files() {
			return files();
		},
		clientId: parts.clientId,
		primary,
		boardKey: parts.boardKey,
		needsFullReport: reporting.needsFullReport,
		hasPendingChanges: reporting.hasPendingChanges,
		currentWithheldIds: reporting.currentWithheldIds,
		sendReport: reporting.sendReport,
		loadBoard: reporting.loadBoard,
		applyServerScene: reporting.applyServerScene,
		applyServerElements: reporting.applyServerElements,
		removeElements: reporting.removeElements,
		learnNoteVersion: reporting.learnNoteVersion,
		adoptBoard: parts.adoptBoard,
		dispatchReporting: reporting.dispatch,
		noteChange: parts.noteChange,
		publishStatus: parts.publishStatus,
		answerBrowserCapture: answerCapture,
		answerViewport: answerViewportRequest,
		setHold: parts.setHold,
		setWrittenElsewhere: parts.setWrittenElsewhere,
		setDoing: parts.setDoing,
		setHolder,
		releaseRecoveredHold: parts.releaseRecoveredHold,
		/**
		 * The shell's library listener, if any.
		 * @returns The listener.
		 */
		get onLibraryChanged() {
			return onLibraryChanged();
		},
		/**
		 * The shell's layout listener, bound to this pane, if any.
		 * @returns The listener.
		 */
		get onLayoutRequest() {
			return onLayoutRequest();
		},
		/**
		 * The shell's board error listener, if any.
		 * @returns The listener.
		 */
		get onBoardError() {
			return onBoardError();
		},
		/**
		 * The shell's agent activity listener, if any.
		 * @returns The listener.
		 */
		get onAgentActivity() {
			return onAgentActivity();
		},
	};
}

export { createMessageContext, type MessageContextParts };
