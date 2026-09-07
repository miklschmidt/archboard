import type { SessionQueuedSubmission } from "@/runtime/codex-session";
import type { OperationAuthority, OperationId, ThreadId } from "@/shared/codex-workbench-identity";
import type {
	BrowserAccountProjectionInput,
	BrowserOwnerProjection,
	CodexQueueProjectionInput,
} from "@/server/codex-workbench";

/**
 * The account, login, and queue facts this adapter learns from its own command
 * results. Readiness is never stored: it is derived from the live owned
 * process, session, account, and coordinator facts on every projection read.
 */
interface CanvasBrowserBindingState {
	account: BrowserAccountProjectionInput;
	login: BrowserOwnerProjection["login"];
	queue: CodexQueueProjectionInput;
	/** The workhorse thread the cached submissions were read for. */
	queueThreadId: ThreadId | null;
}

/** What a pane is shown when no queue read of its own link has succeeded. */
const UNAVAILABLE_QUEUE: CodexQueueProjectionInput = { kind: "codex_queue", submissions: null };

/**
 * Which Archboard operation queued a submission, if Archboard queued it at all.
 *
 * The queue port sets `clientUserMessageId` to the serialized OperationId on
 * every add it makes, and an OperationId is its own wire string, so the
 * authoritative list carries the answer. The operation authority only recognises
 * identities it issued in the current child epoch: anything else — another
 * client's submission, the workhorse's own, or a prior epoch's — is foreign, and
 * this pane has no authority to reorder it.
 * @param submission The submission as the app server listed it.
 * @param operations The authority that issued this epoch's operations.
 * @returns The operation, or null when Archboard did not queue it.
 */
function archboardOperation(
	submission: SessionQueuedSubmission,
	operations: OperationAuthority,
): OperationId | null {
	try {
		return operations.decoder.parseOperationId(submission.clientUserMessageId);
	} catch {
		return null;
	}
}

/**
 * One authoritative queue listing as the browser is shown it, each submission
 * carrying whether this pane may act on it.
 * @param queue The submissions the app server listed.
 * @param operations The authority that issued this epoch's operations.
 * @returns The projection.
 */
function queueOwnerView(
	queue: readonly SessionQueuedSubmission[],
	operations: OperationAuthority,
): CodexQueueProjectionInput {
	return {
		kind: "codex_queue",
		submissions: queue.map((submission) => ({
			id: submission.id,
			input: submission.input,
			operationId: archboardOperation(submission, operations),
		})),
	};
}

export { archboardOperation, queueOwnerView, UNAVAILABLE_QUEUE, type CanvasBrowserBindingState };
