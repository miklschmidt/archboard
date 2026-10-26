import type { SessionQueuedSubmission } from "@archboard/codex-app-server/session";
import type { OperationAuthority, OperationId } from "@archboard/codex-app-server/identity";
import type {
	BrowserAccountProjectionInput,
	BrowserOwnerProjection,
	CodexQueueProjectionInput,
} from "#server/protocol/projection/projection-contract.ts";

/**
 * The account and login facts this adapter learns from its own command
 * results, which every tab session shares. Readiness is never stored: it is
 * derived from the live owned process, session and account facts on every
 * projection read. Each tab session keeps its own queue listing.
 */
interface ServerBrowserBindingState {
	account: BrowserAccountProjectionInput;
	login: BrowserOwnerProjection["login"];
}

/** What a chat is shown when no queue read of its own link has succeeded. */
const UNAVAILABLE_QUEUE: CodexQueueProjectionInput = { kind: "codex_queue", submissions: null };

/**
 * Which operation queued a submission, if this workbench queued it.
 *
 * The queue port sets `clientUserMessageId` to the serialized OperationId on
 * every add it makes, and an OperationId is its own wire string, so the
 * authoritative list carries the answer. The operation authority only recognises
 * identities it issued in the current child epoch: anything else — another
 * client's submission, the workhorse's own, or a prior epoch's — is foreign, and
 * this chat has no authority to reorder it.
 * @param submission The submission as the app server listed it.
 * @param operations The authority that issued this epoch's operations.
 * @returns The operation, or null when this workbench did not queue it.
 */
function queuedOperation(
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
 * carrying whether this chat may act on it.
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
			operationId: queuedOperation(submission, operations),
		})),
	};
}

export { queueOwnerView, UNAVAILABLE_QUEUE, type ServerBrowserBindingState };
