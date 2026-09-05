// What a pane does with each message on its socket. A pane learns which
// board it is on from the server addressing it, applies board content only
// while it is not waiting to say what is on its own screen (TASK-079), and
// treats every message about another board as not its business.

import type { LibraryItems } from "@excalidraw/excalidraw/types";

import { replaceCanvasFiles } from "@/ui/canvas/files";
import type { ChangeReportingEvent, SceneElement } from "@/ui/canvas/lib/reporting-state";
import { sceneFromServer } from "@/ui/canvas/lib/scene-boundary";
import { CONTENT_MESSAGES } from "@/ui/canvas/lib/session-contracts";
import type { CanvasFileOwner } from "@/ui/canvas/files";
import type {
	BoardHold,
	BoardIdentity,
	DoingEntry,
	LockHolder,
	NoteWrittenElsewhere,
	WebSocketMessage,
} from "@/ui/types";

/** Everything a message handler may read or do. */
interface MessageContext {
	readonly files: CanvasFileOwner;
	readonly clientId: string;
	readonly primary: () => boolean;
	readonly boardKey: () => string | null;
	readonly needsFullReport: () => boolean;
	readonly hasPendingChanges: () => boolean;
	readonly currentWithheldIds: () => readonly string[];
	readonly sendReport: () => Promise<void>;
	readonly loadBoard: () => Promise<void>;
	readonly applyServerScene: (elements: SceneElement[], withheldIds?: readonly string[]) => void;
	readonly applyServerElements: (elements: SceneElement[]) => void;
	readonly removeElements: (ids: readonly string[]) => void;
	readonly adoptBoard: (key: string | undefined, identity: BoardIdentity | undefined) => void;
	readonly dispatchReporting: (event: ChangeReportingEvent) => void;
	readonly noteChange: () => void;
	readonly publishStatus: () => void;
	readonly answerBrowserCapture: (data: WebSocketMessage) => Promise<void>;
	readonly answerViewport: (data: WebSocketMessage) => Promise<void>;
	readonly setHold: (hold: BoardHold | null) => void;
	readonly setWrittenElsewhere: (notice: NoteWrittenElsewhere | null) => void;
	readonly setDoing: (entries: DoingEntry[]) => void;
	/** The server said who holds the board; `mine` when it is this pane. */
	readonly setHolder: (holder: LockHolder | null, mine: boolean) => void;
	readonly releaseRecoveredHold: () => void;
	readonly onLibraryChanged: ((items: LibraryItems) => void) | undefined;
	readonly onLayoutRequest: ((request: "open" | "close") => void) | undefined;
	readonly onBoardError: ((error: string) => void) | undefined;
}

type Handler = (context: MessageContext, data: WebSocketMessage) => void | Promise<void>;

/**
 * The first frame, and every reconnection. If this pane is holding edits the
 * server never accepted, get them there first and then take the board back
 * from the server, rather than letting an older snapshot quietly undo them.
 * @param context The pane.
 * @param data The message.
 */
async function initialElements(context: MessageContext, data: WebSocketMessage): Promise<void> {
	if (context.hasPendingChanges()) {
		await context.sendReport();
		await context.loadBoard();
		return;
	}
	// Still this pane's board, so a half-typed label is still this pane's to
	// keep: a reconnection mid-typing must not remove it from the scene.
	context.applyServerScene(sceneFromServer(data.elements ?? []), context.currentWithheldIds());
	if (data.files) {
		context.files.addFiles(Object.values(data.files));
	}
}

/**
 * A different board is on the canvas now. Replace rather than merge, and take
 * an empty board as genuinely empty. What was true about the last board's note
 * and what an agent said about it are not news about this one.
 * @param context The pane.
 * @param data The message.
 */
function boardSwitched(context: MessageContext, data: WebSocketMessage): void {
	context.applyServerScene(sceneFromServer(data.elements ?? []));
	if (data.files) {
		context.files.addFiles(Object.values(data.files));
	}
	context.setWrittenElsewhere(null);
	context.setDoing([]);
	context.noteChange();
}

/**
 * One element arrived.
 * @param context The pane.
 * @param data The message.
 */
function elementUpserted(context: MessageContext, data: WebSocketMessage): void {
	if (data.element) {
		context.applyServerElements(sceneFromServer([data.element]));
		context.noteChange();
	}
}

/**
 * Several elements arrived.
 * @param context The pane.
 * @param data The message.
 */
function elementsBatchCreated(context: MessageContext, data: WebSocketMessage): void {
	if (data.elements) {
		context.applyServerElements(sceneFromServer(data.elements));
		context.noteChange();
	}
}

/**
 * One element went.
 * @param context The pane.
 * @param data The message.
 */
function elementDeleted(context: MessageContext, data: WebSocketMessage): void {
	if (data.elementId !== undefined && data.elementId !== "") {
		context.removeElements([data.elementId]);
		context.noteChange();
	}
}

/**
 * The result of somebody's change report. Our own comes back too; re-applying
 * it is at best a wasted render and at worst a shape snapping back under the
 * pointer, so we skip our own echo.
 * @param context The pane.
 * @param data The message.
 */
function elementsChanged(context: MessageContext, data: WebSocketMessage): void {
	if (data.origin === context.clientId) {
		return;
	}
	const touched = [...(data.created ?? []), ...(data.updated ?? [])];
	if (touched.length > 0) {
		context.applyServerElements(sceneFromServer(touched));
	}
	removeDeleted(context, data.deleted);
	context.noteChange();
}

/**
 * Remove what a change report deleted, when it deleted anything.
 * @param context The pane.
 * @param deleted The deleted ids, if any.
 */
function removeDeleted(context: MessageContext, deleted: readonly string[] | undefined): void {
	if (deleted !== undefined && deleted.length > 0) {
		context.removeElements(deleted);
	}
}

/**
 * Who is writing this board (ADR 0016). The pane that holds the lock is told
 * too, and has to recognise itself. This is the only thing that opens a board
 * back up; everything else errs the other way.
 * @param context The pane.
 * @param data The message.
 */
function boardLock(context: MessageContext, data: WebSocketMessage): void {
	const holder = data.holder ?? null;
	const mine = holder !== null && holder.id === context.clientId;
	context.setHolder(data.held === true && !mine ? holder : null, mine);
}

/**
 * The note behind this board has been written by somebody who is not
 * archboard, or has stopped being (TASK-062). Assigned, never merged.
 * @param context The pane.
 * @param data The message.
 */
function boardNote(context: MessageContext, data: WebSocketMessage): void {
	context.setWrittenElsewhere(data.writtenElsewhere ?? null);
	context.publishStatus();
}

/**
 * An agent said what it was doing to this board (TASK-095).
 * @param context The pane.
 * @param data The message.
 */
function boardDoing(context: MessageContext, data: WebSocketMessage): void {
	if (Array.isArray(data.recent)) {
		context.setDoing(data.recent);
	}
	context.publishStatus();
}

/**
 * This board stopped saving, or is saving again (ADR 0006, TASK-079).
 * @param context The pane.
 * @param data The message.
 */
function boardHold(context: MessageContext, data: WebSocketMessage): void {
	if (data.hold) {
		context.setHold(data.hold);
	}
	context.publishStatus();
}

/**
 * A hold ended. Save-elsewhere keeps the address but adopts a different
 * authoritative document; the other outcomes only clear the full-report need.
 * @param context The pane.
 * @param data The message.
 */
function boardReleased(context: MessageContext, data: WebSocketMessage): void {
	if (Array.isArray(data.elements)) {
		context.dispatchReporting({ type: "board_adopted" });
		context.applyServerScene(sceneFromServer(data.elements));
		replaceCanvasFiles(context.files, Object.values(data.files ?? {}));
		context.noteChange();
	} else {
		context.dispatchReporting({ type: "full_report_cleared" });
	}
	context.releaseRecoveredHold();
}

/**
 * The palette changed in another tab. Boardless on purpose; only the primary
 * pane forwards it, or two panes would tell the shell the same news twice.
 * @param context The pane.
 * @param data The message.
 */
function libraryChanged(context: MessageContext, data: WebSocketMessage): void {
	if (context.primary() && Array.isArray(data.items)) {
		// The server sends Excalidraw's own library items; the browser trusts them.
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion
		context.onLibraryChanged?.(data.items as LibraryItems);
	}
}

/**
 * A board note could not be rendered.
 * @param context The pane.
 * @param data The message.
 */
function boardError(context: MessageContext, data: WebSocketMessage): void {
	if (typeof data.error === "string") {
		context.onBoardError?.(data.error);
	}
}

/**
 * The board was emptied.
 * @param context The pane.
 */
function canvasCleared(context: MessageContext): void {
	context.applyServerScene([]);
	context.noteChange();
}

/**
 * Images were added to the board.
 * @param context The pane.
 * @param data The message.
 */
function filesAdded(context: MessageContext, data: WebSocketMessage): void {
	if (data.files) {
		context.files.addFiles(Object.values(data.files));
	}
}

/**
 * The board's images were replaced.
 * @param context The pane.
 * @param data The message.
 */
function filesReplaced(context: MessageContext, data: WebSocketMessage): void {
	replaceCanvasFiles(context.files, Object.values(data.files ?? {}));
}

/**
 * The server asks this pane to move its viewport. Not gated on primary: it is
 * addressed to one pane's socket, so the pane that receives it was asked.
 * @param context The pane.
 * @param data The message.
 * @returns Settles once answered.
 */
function setViewport(context: MessageContext, data: WebSocketMessage): Promise<void> {
	return context.answerViewport(data);
}

/**
 * The server asks for another pane. Layout is the shell's; sent up untouched.
 * @param context The pane.
 */
function paneOpen(context: MessageContext): void {
	context.onLayoutRequest?.("open");
}

/**
 * The server asks for this pane to go.
 * @param context The pane.
 */
function paneClose(context: MessageContext): void {
	context.onLayoutRequest?.("close");
}

const HANDLERS: Readonly<Record<string, Handler>> = {
	initial_elements: initialElements,
	board_switched: boardSwitched,
	element_created: elementUpserted,
	element_updated: elementUpserted,
	elements_batch_created: elementsBatchCreated,
	element_deleted: elementDeleted,
	elements_changed: elementsChanged,
	board_lock: boardLock,
	board_note: boardNote,
	board_doing: boardDoing,
	board_error: boardError,
	canvas_cleared: canvasCleared,
	board_hold: boardHold,
	board_released: boardReleased,
	library_changed: libraryChanged,
	files_added: filesAdded,
	files_replaced: filesReplaced,
	set_viewport: setViewport,
	pane_open: paneOpen,
	pane_close: paneClose,
};

/**
 * Whether a message is about this pane's board, adopting it when it is how
 * the pane learns which board that is.
 * @param context The pane.
 * @param data The message.
 * @returns True when the message is ours to act on.
 */
function addressesThisPane(context: MessageContext, data: WebSocketMessage): boolean {
	if (data.type === "board_switched" || data.type === "initial_elements") {
		context.adoptBoard(data.board, data.identity);
		return true;
	}
	const boardKey = context.boardKey();
	return data.board === undefined || boardKey === null || data.board === boardKey;
}

/**
 * Act on one socket message.
 * @param context The pane.
 * @param data The message.
 */
async function handleSocketMessage(context: MessageContext, data: WebSocketMessage): Promise<void> {
	if (!addressesThisPane(context, data)) {
		return;
	}
	// Between a refused write and this pane saying what is on its screen, the
	// server's copy of this board is the note another editor wrote. Board
	// content waits for the full report; status from the server does not.
	if (context.needsFullReport() && CONTENT_MESSAGES.has(data.type)) {
		return;
	}
	if (data.type === "browser_capture_request") {
		await context.answerBrowserCapture(data);
		return;
	}
	await HANDLERS[data.type]?.(context, data);
}

export { handleSocketMessage, type MessageContext };
