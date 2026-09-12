// The canonical context a delivery adapter builds for one semantic event.
//
// Apart from delivery-support.ts because it is the one piece of that harness
// that is about the shape of a context rather than the shape of a delivery, and
// because the two together no longer fit in one reviewed file.

import type { ArchboardContext } from "@/runtime/codex-instructions";
import type { SettledSemanticChangeEvent } from "@/runtime/codex-semantic-context";
import { canonicalSemanticCursorToken } from "@/runtime/codex-thread-context";
import type { ChildEpoch, ChildId, ThreadId } from "@/shared/codex-workbench-identity";

/** Who the context is built for, and the two fields a test may vary. */
interface ContextFor {
	readonly paneId: string;
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly threadId: ThreadId;
	readonly cursorSequence: number | undefined;
	readonly focusPaneId: string | null | undefined;
}

/**
 * The context the adapter builds from one event, with nothing minted here.
 * @param on Who it is built for.
 * @param event The settled semantic change.
 * @returns The context.
 */
function baseContext(on: ContextFor, event: SettledSemanticChangeEvent): ArchboardContext {
	const cursor =
		event.cursor === null
			? null
			: canonicalSemanticCursorToken({
					feedId: event.cursor.feedId,
					sequence: on.cursorSequence ?? event.cursor.sequence,
				});
	const captured = event.freshness.capturedAtMs;
	const variant = event.architecture.variant;
	return {
		schema: 1,
		paneId: on.paneId,
		board: { name: event.board.name, key: event.board.key, version: event.version ?? 7, cursor },
		threadLink: { state: "executable", reason: null },
		child: { id: on.childId, epoch: on.epoch },
		workhorse: { threadId: on.threadId, turnId: event.workhorse.turnId },
		coordinator: { ...event.coordinator },
		semantic: {
			brief: event.brief,
			capturedAtMs: captured,
			freshUntilMs: event.freshness.freshUntilMs,
			truncated: event.truncated,
		},
		focus: {
			paneId:
				on.focusPaneId === undefined
					? event.pane.focused
						? event.pane.paneId
						: null
					: on.focusPaneId,
			capturedAtMs: captured,
		},
		variant:
			variant === null
				? null
				: { id: variant.id, name: variant.name, lifecycle: variant.lifecycle },
		view: event.architecture.view,
		selection: {
			count: event.architecture.selection.count,
			subjects: [...event.architecture.selection.subjects],
			capturedAtMs: captured,
		},
		reconciliation: {
			required: event.architecture.reconciliation.required,
			count: event.architecture.reconciliation.count,
			blockedBy: event.architecture.reconciliation.blockedBy,
			issues: [...event.architecture.reconciliation.issues],
		},
		claim: { ...event.claim },
		ambiguity: [...event.ambiguity],
		operation: { id: null, kind: null, rpc: null, outcome: null },
	};
}

export { type ContextFor, baseContext };
