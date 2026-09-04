import type {
	BrowserActionContext,
	BrowserActionResult,
	BrowserThreadLinkActions,
	BrowserThreadLinkTargetCommand,
	CodexThreadCandidatesProjectionInput,
} from "../../codex-workbench/index.js";
import { boundedBrowserReason } from "./codex-workbench-readiness.js";
import type {
	ChildEpoch,
	ChildId,
	ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import type { EpochOperationRecord } from "../../../runtime/codex-epoch/index.js";
import type {
	CodexThreadLinkPort,
	ThreadLinkBindingSnapshot,
	ThreadLinkCandidateDiscovery,
} from "../../../runtime/codex-thread-link/index.js";
import type { CodexWorkhorseStart } from "../../../runtime/codex-workhorse-start/index.js";
import type {
	CodexThreadContextBindingToken,
	CodexThreadContextController,
} from "../../../runtime/codex-thread-context/index.js";
import type { CodexWorkbenchComponents } from "./codex-workbench.js";

export function bindThreadContextToReadyWorkhorse(
	workhorse: Pick<CodexWorkhorseStart, "snapshot">,
	controller: Pick<CodexThreadContextController, "snapshot" | "compareAndSwap">,
): void {
	const snapshot = workhorse.snapshot();
	if (
		snapshot.state !== "ready" ||
		snapshot.paneId === null ||
		snapshot.threadId === null ||
		snapshot.childId === null ||
		snapshot.epoch === null ||
		snapshot.operationId === null ||
		snapshot.binding?.link.state !== "executable"
	)
		throw new Error("Thread context can bind only to an exact ready workhorse snapshot.");
	controller.compareAndSwap({
		expected: controller.snapshot().token,
		next: {
			paneId: snapshot.paneId,
			target: {
				threadId: snapshot.threadId,
				childId: snapshot.childId,
				epoch: snapshot.epoch,
				operationId: snapshot.operationId,
			},
			link: snapshot.binding,
		},
	});
}

function replaceThreadContextBinding(
	controller: Pick<CodexThreadContextController, "snapshot" | "compareAndSwap">,
	target: {
		readonly threadId: ThreadId;
		readonly childId: ChildId;
		readonly epoch: ChildEpoch;
		readonly operationId: string;
	},
	link: ThreadLinkBindingSnapshot,
): CodexThreadContextBindingToken {
	if (
		link.link.state !== "executable" ||
		link.link.threadId !== target.threadId ||
		link.link.childId !== target.childId ||
		link.link.epoch !== target.epoch
	)
		throw new Error("Thread context requires the exact adopted workhorse link proof.");
	return controller.compareAndSwap({
		expected: controller.snapshot().token,
		next: {
			paneId: link.paneId,
			target,
			link,
		},
	}).token;
}

export function clearCanvasThreadContextForLease(
	controller: Pick<CodexThreadContextController, "snapshot" | "compareAndSwap">,
	expected: CodexThreadContextBindingToken,
): void {
	const current = controller.snapshot();
	if (current.token.revision !== expected.revision || current.binding === null) return;
	controller.compareAndSwap({ expected: current.token, next: null });
}

function expectedBrowserLink(context: BrowserActionContext) {
	return {
		revision: context.linkRevision,
		paneId: context.paneId,
		childId: context.link.childId,
		epoch: context.link.epoch,
		threadId: context.link.threadId,
	};
}

/**
 * The pane-visible thread inventory. Discovery is explicit: nothing here runs
 * until the browser asks for it, so opening a pane never exhausts two Codex
 * lists on its own and no thread is ever adopted from recency.
 */
export interface CanvasThreadCandidateInventory {
	readonly read: () => CodexThreadCandidatesProjectionInput;
	readonly refresh: () => Promise<ThreadLinkCandidateDiscovery>;
	/** The thread a published selection named, or null when the list moved on. */
	readonly threadIdFor: (selectionId: string) => ThreadId | null;
}

export function createCanvasThreadCandidateInventory(
	threadLink: Pick<CodexThreadLinkPort, "discoverCandidates">,
): CanvasThreadCandidateInventory {
	let published: CodexThreadCandidatesProjectionInput = {
		kind: "codex_thread_candidates",
		state: "unknown",
	};
	let selections = new Map<string, ThreadId>();
	return Object.freeze({
		read: () => published,
		refresh: async () => {
			try {
				const discovery = await threadLink.discoverCandidates();
				published = {
					kind: "codex_thread_candidates",
					state: "listed",
					candidates: discovery.candidates,
				};
				selections = new Map(
					discovery.candidates.map((candidate) => [candidate.selectionId, candidate.threadId]),
				);
				return discovery;
			} catch (error) {
				published = {
					kind: "codex_thread_candidates",
					state: "unavailable",
					reason: boundedBrowserReason(
						error instanceof Error ? error.message : null,
						"The Codex thread list could not be discovered.",
					),
				};
				selections = new Map();
				throw error;
			}
		},
		threadIdFor: (selectionId: string) => selections.get(selectionId) ?? null,
	});
}

export function createCanvasThreadLinkActions(options: {
	readonly workhorse: CodexWorkbenchComponents["workhorse"];
	readonly threadLink: CodexWorkbenchComponents["threadLink"];
	readonly semanticDelivery: CodexWorkbenchComponents["semanticDelivery"];
	readonly epoch: CodexWorkbenchComponents["epoch"];
	readonly identity: CodexWorkbenchComponents["identity"];
	readonly candidates: CanvasThreadCandidateInventory;
	readonly checkoutRoot: string;
}): BrowserThreadLinkActions {
	const controllerTokens = new Map<
		BrowserActionContext["connection"],
		CodexThreadContextBindingToken
	>();
	const emptyAuthoredHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
	const recordFor = (threadId: ThreadId): EpochOperationRecord | null => {
		const active = options.epoch.snapshot().manifest.activeEpoch;
		if (active === null) return null;
		return (
			options.epoch
				.snapshot()
				.manifest.records.findLast(
					(record) =>
						record.status === "committed" &&
						record.correlation.childId === active.childId &&
						record.correlation.epoch === active.epoch &&
						record.provenance.threadId === threadId,
				) ?? null
		);
	};
	const attachRecord = async (
		threadId: ThreadId,
		context: BrowserActionContext,
	): Promise<EpochOperationRecord> => {
		const observed = await options.threadLink.classify({
			threadId,
			childId: context.childId,
			epoch: context.epoch,
		});
		if (observed.link.state !== "inspect_only" || observed.link.reason !== "unknown_provenance")
			throw new Error(
				`The requested thread is inspect-only: ${observed.link.reason ?? "invalid_result"}.`,
			);
		if (observed.thread === null)
			throw new Error("The requested thread has no exact persisted session row.");
		const operationId = options.identity.operation.issuer.mintOperationId();
		const transaction = options.epoch.stageOperation({
			childId: context.childId,
			epoch: context.epoch,
			operationId,
			kind: "attached",
			rpc: "thread/read",
			workspaceRoot: options.checkoutRoot,
			instructionHash: emptyAuthoredHash,
			manifestHash: emptyAuthoredHash,
			expected: options.epoch.snapshot().cas,
		});
		try {
			return options.epoch.commitOperation(transaction, {
				threadId,
				threadSource:
					typeof observed.observation.source === "string" ? observed.observation.source : null,
			});
		} catch (error) {
			try {
				options.epoch.rollbackOperation(transaction, "thread attachment did not commit");
			} catch {
				// The original durable failure is the actionable one.
			}
			throw error;
		}
	};
	/**
	 * Bind the exact row the person chose. The published selection names which
	 * row that was and is refused once the list has moved on; the bind itself
	 * goes through the runtime's one-shot, CAS-checked candidate handle, so a
	 * thread id alone can never adopt a thread this pane did not offer.
	 */
	const adoptCandidate = async (
		command: BrowserThreadLinkTargetCommand,
		context: BrowserActionContext,
	): Promise<BrowserActionResult> => {
		const threadId = options.candidates.threadIdFor(command.selectionId);
		if (threadId === null || threadId !== command.threadId)
			throw new Error(
				"The chosen thread row is no longer in the published list. Refresh the thread list and choose again.",
			);
		let record = recordFor(threadId);
		if (record === null) record = await attachRecord(threadId, context);
		options.epoch.assertCurrent({
			childId: context.childId,
			epoch: context.epoch,
			operationId: record.operation.id,
			threadId,
		});
		// Staging the ownership record above moves the epoch, and a retained
		// candidate is only valid while the epoch it was discovered under is
		// unchanged, so the bind consumes a freshly discovered selection.
		const discovery = await options.candidates.refresh();
		const chosen = discovery.candidates.find((candidate) => candidate.threadId === threadId);
		if (chosen === undefined)
			throw new Error("The chosen thread is no longer in the joined Codex thread list.");
		const binding = await options.threadLink.bindCandidate(
			context.paneId,
			expectedBrowserLink(context),
			chosen.selectionId,
		);
		if (binding.link.state !== "executable")
			throw new Error(`The requested thread is inspect-only: ${binding.link.reason}.`);
		const token = replaceThreadContextBinding(
			options.semanticDelivery,
			{
				threadId,
				childId: context.childId,
				epoch: context.epoch,
				operationId: record.operation.id,
			},
			binding,
		);
		controllerTokens.set(context.connection, token);
		return { outcome: "delivered" };
	};
	return Object.freeze({
		create: async (_command, context) => {
			const started = await options.workhorse.start({
				paneId: context.paneId,
				expected: expectedBrowserLink(context),
			});
			if (started.binding === null)
				throw new Error("The created workhorse did not return its adopted pane link.");
			if (
				started.threadId === null ||
				started.childId === null ||
				started.epoch === null ||
				started.operationId === null
			)
				throw new Error("The created workhorse did not return exact target authority.");
			const token = replaceThreadContextBinding(
				options.semanticDelivery,
				{
					threadId: started.threadId,
					childId: started.childId,
					epoch: started.epoch,
					operationId: started.operationId,
				},
				started.binding,
			);
			controllerTokens.set(context.connection, token);
			return { outcome: "delivered" };
		},
		refresh: async () => {
			await options.candidates.refresh();
			return { outcome: "delivered" };
		},
		attach: (command, context) => adoptCandidate(command, context),
		relink: (command, context) => adoptCandidate(command, context),
		onBrowserDisconnect: (context, reason) => {
			if (
				reason !== "browser_disconnected" &&
				reason !== "child_disconnected" &&
				reason !== "gateway_shutdown"
			)
				return;
			const token = controllerTokens.get(context.connection);
			controllerTokens.delete(context.connection);
			if (token !== undefined) clearCanvasThreadContextForLease(options.semanticDelivery, token);
		},
	} satisfies BrowserThreadLinkActions);
}
