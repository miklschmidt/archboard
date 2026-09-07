// Telling the panes what a write did.
//
// Best effort, and deliberately so: the note is already written by the time
// any of this runs, so a pane that cannot be reached is a pane that will
// reconcile on its next read, not a failed write. Notifications are queued per
// board and flushed on a microtask, so a route that sends several messages
// about one write sends them in the order it wrote them.

import { isDeepStrictEqual } from "node:util";

import type { ReadonlyBoardData } from "@/shared/board-elements";
import type { CheckoutSnapshot } from "@/runtime/code-target";
import type { BoardWriteDelta, BoardWriteTarget } from "@/runtime/engine/lib/board-write-contract";
import { logger } from "@/runtime/engine/logger";
import { presentElements } from "@/runtime/engine/presentation";
import type { PresentationContext, ReadonlyServerElement } from "@/runtime/engine/presentation";
import type {
	CarriedVersion,
	ElementsChangedMessage,
	WebSocketMessage,
} from "@/runtime/engine/types";

type ReadonlyBoardWriteDelta = ReadonlyBoardData<BoardWriteDelta>;
type ReadonlyElementsChangedMessage = ReadonlyBoardData<ElementsChangedMessage>;
type ReadonlyWebSocketMessage = ReadonlyBoardData<WebSocketMessage>;

type TellPanes = (message: ReadonlyWebSocketMessage, board: string) => void | PromiseLike<void>;

/** The request-echo targets a write already resolved, reusable per element. */
type PresentationLinks = Readonly<
	ReadonlyMap<string, Readonly<Pick<PresentationContext, "opaqueTarget">>>
>;

/** The file fields of a delta, carried through untouched. */
type CarriedFiles = Pick<ReadonlyBoardWriteDelta, "filesAdded" | "filesDeleted" | "filesReplaced">;

interface PendingPaneNotification {
	tellPanes: TellPanes;
	message: ReadonlyWebSocketMessage;
}

const paneNotificationQueues = new Map<string, PendingPaneNotification[]>();
const scheduledPaneNotifications = new Set<string>();

/**
 * Say that a pane could not be told, without failing the write that is already
 * on disk.
 * @param board Which board.
 * @param error What went wrong.
 */
function reportPaneNotificationFailure(board: string, error: unknown): void {
	logger.warn(`Board "${board}" pane notification failed after the write boundary`, error);
}

/**
 * Take everything queued for one board, leaving the queue empty.
 * @param board Which board.
 * @returns The notifications to send.
 */
function takeQueued(board: string): PendingPaneNotification[] {
	return paneNotificationQueues.get(board)?.splice(0) ?? [];
}

/**
 * How much is still waiting to be sent for one board.
 * @param board Which board.
 * @returns The count.
 */
function queuedCount(board: string): number {
	return paneNotificationQueues.get(board)?.length ?? 0;
}

/**
 * Send one notification, reporting a failure either way it can arrive: thrown
 * synchronously, or rejected from the promise it hands back.
 * @param notification What to send, and how.
 * @param board Which board.
 */
function deliver(notification: PendingPaneNotification, board: string): void {
	try {
		Promise.resolve(notification.tellPanes(notification.message, board)).catch((error: unknown) => {
			reportPaneNotificationFailure(board, error);
		});
	} catch (error) {
		reportPaneNotificationFailure(board, error);
	}
}

/**
 * Send everything queued for one board, and schedule another flush when more
 * arrived while this one was running.
 * @param board Which board.
 */
function flushPaneNotifications(board: string): void {
	scheduledPaneNotifications.delete(board);
	const pending = takeQueued(board);
	if (pending.length === 0) {
		paneNotificationQueues.delete(board);
		return;
	}
	for (const notification of pending) {
		deliver(notification, board);
	}
	if (queuedCount(board) > 0) {
		schedulePaneNotificationFlush(board);
	} else {
		paneNotificationQueues.delete(board);
	}
}

/**
 * Arrange for one board's queue to be sent, once, on the next microtask.
 * @param board Which board.
 */
function schedulePaneNotificationFlush(board: string): void {
	if (scheduledPaneNotifications.has(board)) {
		return;
	}
	scheduledPaneNotifications.add(board);
	queueMicrotask(() => {
		flushPaneNotifications(board);
	});
}

/**
 * Queue one message for a board's panes.
 * @param tellPanes How to reach them.
 * @param message What to say.
 * @param board Which board.
 */
function tellPanesBestEffort(
	tellPanes: TellPanes,
	message: ReadonlyWebSocketMessage,
	board: string,
): void {
	const queue = paneNotificationQueues.get(board) ?? [];
	if (!paneNotificationQueues.has(board)) {
		paneNotificationQueues.set(board, queue);
	}
	queue.push({ tellPanes, message });
	schedulePaneNotificationFlush(board);
}

/**
 * The code targets this write already resolved, by element id.
 *
 * Reusing them spares the presentation overlay the filesystem work of
 * resolving the same bindings a second time.
 * @param links What the request echoed back.
 * @returns The targets, or undefined when the request carried none.
 */
function opaqueTargetsOf(
	links: PresentationLinks | undefined,
): Map<string, NonNullable<PresentationContext["opaqueTarget"]>> | undefined {
	if (!links) {
		return undefined;
	}
	return new Map(
		[...links].flatMap(([id, context]) =>
			context.opaqueTarget === undefined ? [] : [[id, context.opaqueTarget] as const],
		),
	);
}

/**
 * Tell the panes about the embedded files a write moved.
 *
 * Three separate messages because they are three separate facts: files that
 * arrived, a complete replacement of the set, and files that are gone.
 * @param tellPanes How to reach them.
 * @param delta What the write changed.
 * @param board Which board.
 */
function tellPanesAboutFiles(
	tellPanes: TellPanes,
	delta: ReadonlyBoardWriteDelta,
	board: string,
): void {
	if (delta.filesAdded && delta.filesAdded.length > 0) {
		tellPanesBestEffort(tellPanes, { type: "files_added", files: delta.filesAdded }, board);
	}
	if (delta.filesReplaced) {
		tellPanesBestEffort(tellPanes, { type: "files_replaced", files: delta.filesReplaced }, board);
	}
	for (const fileId of delta.filesDeleted ?? []) {
		tellPanesBestEffort(tellPanes, { type: "file_deleted", fileId }, board);
	}
}

/**
 * Tell a board's panes everything one write did.
 * @param tellPanes How to reach them.
 * @param target Which board was written.
 * @param delta Every canonical side effect of the persisted document.
 * @param clientId The pane that already has this change on screen, so it can
 * skip its own echo.
 * @param timestamp When the write was applied.
 * @param checkoutSnapshot What the code links resolve against.
 * @param presentationLinks The request-echo targets, when the write had them.
 * @param version The note's version after this write, which is what every pane
 * states next.
 */
function tellPanesAboutWrite(
	tellPanes: TellPanes,
	target: Readonly<Pick<BoardWriteTarget, "key">>,
	delta: ReadonlyBoardWriteDelta,
	clientId: string | null,
	timestamp: string,
	checkoutSnapshot: Readonly<CheckoutSnapshot>,
	presentationLinks: PresentationLinks | undefined,
	version: CarriedVersion,
): void {
	const opaqueTargets = opaqueTargetsOf(presentationLinks);
	const presentation = {
		boardKey: target.key,
		checkoutSnapshot,
		...(opaqueTargets ? { opaqueTargets } : {}),
	};
	const message: ReadonlyElementsChangedMessage = {
		type: "elements_changed",
		created: presentElements(delta.created, presentation),
		updated: presentElements(delta.updated, presentation),
		deleted: delta.deleted,
		origin: clientId,
		version,
		timestamp,
	};
	tellPanesBestEffort(tellPanes, message, target.key);
	tellPanesAboutFiles(tellPanes, delta, target.key);
}

/**
 * The file fields of a delta, present only where the write touched files.
 * @param files What the write reported.
 * @returns The fields to carry through.
 */
function carriedFiles(files: ReadonlyBoardWriteDelta): CarriedFiles {
	return {
		...(files.filesAdded ? { filesAdded: files.filesAdded } : {}),
		...(files.filesDeleted ? { filesDeleted: files.filesDeleted } : {}),
		...(files.filesReplaced ? { filesReplaced: files.filesReplaced } : {}),
	};
}

/**
 * What the panes need to hear, which is more than the caller named.
 *
 * The mutation delta describes the elements the caller asked about; this is
 * the whole difference the persisted document made, so repaired arrow
 * back-references, dependent labels and deletions outside that input reach the
 * panes too.
 * @param before The destination as it stood.
 * @param after The document that was written.
 * @param files The write's own file changes, carried through.
 * @returns The complete delta to broadcast.
 */
function notificationDelta(
	before: Readonly<ReadonlyMap<string, ReadonlyServerElement>>,
	after: Readonly<ReadonlyMap<string, ReadonlyServerElement>>,
	files: ReadonlyBoardWriteDelta,
): ReadonlyBoardWriteDelta {
	const created: ReadonlyServerElement[] = [];
	const updated: ReadonlyServerElement[] = [];
	for (const [id, element] of after) {
		const existing = before.get(id);
		if (!existing) {
			created.push(element);
		} else if (!isDeepStrictEqual(existing, element)) {
			updated.push(element);
		}
	}
	return {
		created,
		updated,
		deleted: [...before.keys()].filter((id) => !after.has(id)),
		...carriedFiles(files),
	};
}

export { notificationDelta, tellPanesAboutWrite, tellPanesBestEffort };
export type { TellPanes };
