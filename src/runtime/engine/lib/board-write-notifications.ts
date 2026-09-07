import { isDeepStrictEqual } from "node:util";

import type { ReadonlyBoardData } from "@/shared/board-elements";
import type { CheckoutSnapshot } from "@/runtime/code-target";
import type { BoardWriteDelta, BoardWriteTarget } from "@/runtime/engine/board-write";
import { logger } from "@/runtime/engine/logger";
import { presentElements } from "@/runtime/engine/presentation";
import type { PresentationContext, ReadonlyServerElement } from "@/runtime/engine/presentation";
import type { CarriedVersion, ElementsChangedMessage, WebSocketMessage } from "@/runtime/engine/types";

type ReadonlyBoardWriteDelta = ReadonlyBoardData<BoardWriteDelta>;
type ReadonlyElementsChangedMessage = ReadonlyBoardData<ElementsChangedMessage>;
type ReadonlyWebSocketMessage = ReadonlyBoardData<WebSocketMessage>;

type TellPanes = (message: ReadonlyWebSocketMessage, board: string) => void | PromiseLike<void>;

interface PendingPaneNotification {
	tellPanes: TellPanes;
	message: ReadonlyWebSocketMessage;
}

const paneNotificationQueues = new Map<string, PendingPaneNotification[]>();
const scheduledPaneNotifications = new Set<string>();

/**
 *
 */
function reportPaneNotificationFailure(board: string, error: unknown): void {
	logger.warn(`Board "${board}" pane notification failed after the write boundary`, error);
}

/**
 *
 */
function schedulePaneNotificationFlush(board: string): void {
	if (scheduledPaneNotifications.has(board)) {
		return;
	}
	scheduledPaneNotifications.add(board);
	queueMicrotask(() => {
		scheduledPaneNotifications.delete(board);
		const pending = paneNotificationQueues.get(board)?.splice(0) ?? [];
		if (pending.length === 0) {
			paneNotificationQueues.delete(board);
			return;
		}
		for (const notification of pending) {
			try {
				Promise.resolve(notification.tellPanes(notification.message, board)).catch(
					(error: unknown) => {
						reportPaneNotificationFailure(board, error);
					},
				);
			} catch (error) {
				reportPaneNotificationFailure(board, error);
			}
		}
		if ((paneNotificationQueues.get(board)?.length ?? 0) > 0) {
			schedulePaneNotificationFlush(board);
		} else {
			paneNotificationQueues.delete(board);
		}
	});
}

/**
 *
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
 *
 */
function tellPanesAboutWrite(
	tellPanes: TellPanes,
	target: Readonly<Pick<BoardWriteTarget, "key">>,
	delta: ReadonlyBoardWriteDelta,
	clientId: string | null,
	timestamp: string,
	checkoutSnapshot: Readonly<CheckoutSnapshot>,
	presentationLinks:
		| Readonly<ReadonlyMap<string, Readonly<Pick<PresentationContext, "opaqueTarget">>>>
		| undefined,
	version: CarriedVersion,
): void {
	const opaqueTargets = presentationLinks
		? new Map(
				[...presentationLinks].flatMap(
					([id, context]: readonly [
						string,
						Readonly<Pick<PresentationContext, "opaqueTarget">>,
					]) => (context.opaqueTarget === undefined ? [] : [[id, context.opaqueTarget] as const]),
				),
			)
		: undefined;
	const message: ReadonlyElementsChangedMessage = {
		type: "elements_changed",
		created: presentElements(delta.created, {
			boardKey: target.key,
			checkoutSnapshot,
			...(opaqueTargets ? { opaqueTargets } : {}),
		}),
		updated: presentElements(delta.updated, {
			boardKey: target.key,
			checkoutSnapshot,
			...(opaqueTargets ? { opaqueTargets } : {}),
		}),
		deleted: delta.deleted,
		origin: clientId,
		version,
		timestamp,
	};
	tellPanesBestEffort(tellPanes, message, target.key);

	if (delta.filesAdded && delta.filesAdded.length > 0) {
		tellPanesBestEffort(tellPanes, { type: "files_added", files: delta.filesAdded }, target.key);
	}
	if (delta.filesReplaced) {
		tellPanesBestEffort(
			tellPanes,
			{ type: "files_replaced", files: delta.filesReplaced },
			target.key,
		);
	}
	for (const fileId of delta.filesDeleted ?? []) {
		tellPanesBestEffort(tellPanes, { type: "file_deleted", fileId }, target.key);
	}
}

/**
 *
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
		...(files.filesAdded ? { filesAdded: files.filesAdded } : {}),
		...(files.filesDeleted ? { filesDeleted: files.filesDeleted } : {}),
		...(files.filesReplaced ? { filesReplaced: files.filesReplaced } : {}),
	};
}

export { notificationDelta, tellPanesAboutWrite, tellPanesBestEffort };
export type { TellPanes };
