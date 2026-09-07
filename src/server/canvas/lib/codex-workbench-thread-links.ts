import type {
	BrowserActionContext,
	BrowserActionResult,
	BrowserThreadLinkActions,
	BrowserThreadLinkTargetCommand,
	CodexThreadCandidatesProjectionInput,
} from "@/server/codex-workbench";
import { boundedBrowserReason } from "@/server/canvas/lib/codex-workbench-readiness";
import type { ChildEpoch, ChildId, ThreadId } from "@/shared/codex-workbench-identity";
import { EPOCH_THREAD_ATTACH_OPERATION, type EpochOperationRecord } from "@/runtime/codex-epoch";
import type {
	CodexThreadLinkPort,
	ThreadLinkBindingSnapshot,
	ThreadLinkCandidateDiscovery,
	ThreadLinkClassification,
} from "@/runtime/codex-thread-link";
import type { CodexWorkhorseStart } from "@/runtime/codex-workhorse-start";
import type {
	CodexThreadContextBindingToken,
	CodexThreadContextController,
} from "@/runtime/codex-thread-context";
import type { CodexWorkbenchComponents } from "@/server/canvas/lib/codex-workbench";

/** The workhorse as it describes its own thread. */
type WorkhorseSnapshot = ReturnType<CodexWorkhorseStart["snapshot"]>;

/** The exact thread a ready workhorse is bound to, with the proof it is bound. */
interface ReadyWorkhorseTarget {
	readonly paneId: string;
	readonly target: {
		readonly threadId: ThreadId;
		readonly childId: ChildId;
		readonly epoch: ChildEpoch;
		readonly operationId: string;
	};
	readonly link: ThreadLinkBindingSnapshot;
}

/**
 * The target a snapshot names, once every part of it is actually named.
 * @param snapshot The workhorse snapshot, already known to be executable.
 * @param link Its pane link.
 * @returns The target, or null when the snapshot names only part of one.
 */
function namedTarget(
	snapshot: WorkhorseSnapshot,
	link: ThreadLinkBindingSnapshot,
): ReadyWorkhorseTarget | null {
	const { paneId, threadId, childId, epoch, operationId } = snapshot;
	if (
		paneId === null ||
		threadId === null ||
		childId === null ||
		epoch === null ||
		operationId === null
	) {
		return null;
	}
	return { paneId, target: { threadId, childId, epoch, operationId }, link };
}

/**
 * The thread a workhorse is bound to, only when it is ready and its pane link
 * can actually run turns.
 * @param snapshot The workhorse snapshot.
 * @returns The target, or null when this workhorse names no exact one.
 */
function readyWorkhorseTarget(snapshot: WorkhorseSnapshot): ReadyWorkhorseTarget | null {
	const binding = snapshot.binding;
	if (snapshot.state !== "ready" || binding?.link.state !== "executable") {
		return null;
	}
	return namedTarget(snapshot, binding);
}

/**
 * Point the thread-context controller at the thread a ready workhorse holds,
 * so context is published to that thread and to nothing else.
 * @param workhorse What names the thread.
 * @param controller The controller being pointed.
 */
function bindThreadContextToReadyWorkhorse(
	workhorse: Pick<CodexWorkhorseStart, "snapshot">,
	controller: Pick<CodexThreadContextController, "snapshot" | "compareAndSwap">,
): void {
	const ready = readyWorkhorseTarget(workhorse.snapshot());
	if (ready === null) {
		throw new Error("Thread context can bind only to an exact ready workhorse snapshot.");
	}
	controller.compareAndSwap({
		expected: controller.snapshot().token,
		next: { paneId: ready.paneId, target: ready.target, link: ready.link },
	});
}

/**
 * Move the thread-context binding onto one adopted thread, refusing any link
 * that is not the proof of that exact adoption.
 * @param controller The controller being moved.
 * @param target The thread, its child epoch, and the operation that owns it.
 * @param link The pane link proving the adoption.
 * @returns The token the new binding is held under.
 */
function replaceThreadContextBinding(
	controller: Pick<CodexThreadContextController, "snapshot" | "compareAndSwap">,
	target: ReadyWorkhorseTarget["target"],
	link: ThreadLinkBindingSnapshot,
): CodexThreadContextBindingToken {
	if (
		link.link.state !== "executable" ||
		link.link.threadId !== target.threadId ||
		link.link.childId !== target.childId ||
		link.link.epoch !== target.epoch
	) {
		throw new Error("Thread context requires the exact adopted workhorse link proof.");
	}
	return controller.compareAndSwap({
		expected: controller.snapshot().token,
		next: {
			paneId: link.paneId,
			target,
			link,
		},
	}).token;
}

/**
 * Release the thread-context binding one browser took, leaving alone a binding
 * some later lease has already replaced.
 * @param controller The controller.
 * @param expected The token that browser's binding was held under.
 */
function clearCanvasThreadContextForLease(
	controller: Pick<CodexThreadContextController, "snapshot" | "compareAndSwap">,
	expected: CodexThreadContextBindingToken,
): void {
	const current = controller.snapshot();
	if (current.token.revision !== expected.revision || current.binding === null) {
		return;
	}
	controller.compareAndSwap({ expected: current.token, next: null });
}

/**
 * The link a browser command is only allowed to act on: the exact one the pane
 * says it is looking at.
 * @param context The pane and the link it named.
 * @returns The expected link.
 */
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
 *
 * One inventory serves the gateway, not one per pane. Every pane therefore sees
 * the same list, and a refresh any pane asks for republishes it for all of
 * them. That is deliberate: the list describes the child epoch, which is also
 * shared, and a per-pane copy would let two panes disagree about what exists.
 */
interface CanvasThreadCandidateInventory {
	readonly read: () => CodexThreadCandidatesProjectionInput;
	readonly refresh: () => Promise<ThreadLinkCandidateDiscovery>;
	/** The thread a published selection named, or null when the list moved on. */
	readonly threadIdFor: (selectionId: string) => ThreadId | null;
	/**
	 * The epoch the published list was discovered under. A retained candidate is
	 * only valid while this is unchanged, so a caller compares before binding.
	 */
	readonly generation: () => string | null;
	/** Retire the published list and say why, so the browser re-discloses it. */
	readonly invalidate: (reason: string) => void;
}

/** What a thread inventory reads the current epoch from. */
type EpochGenerationSource = Pick<CodexWorkbenchComponents["epoch"], "snapshot">;

/**
 * One comparable name for the epoch a list was discovered under, so a retained
 * candidate can be refused once the epoch has moved beneath it.
 * @param epoch The epoch store.
 * @returns The name.
 */
function epochGeneration(epoch: EpochGenerationSource): string {
	const cas = epoch.snapshot().cas;
	return `${cas.revision}:${cas.bytesHash ?? "none"}`;
}

/**
 * The one thread inventory the gateway publishes to every pane.
 * @param threadLink What discovers the candidate threads.
 * @param epoch What the discovery's epoch is read from.
 * @returns The inventory.
 */
function createCanvasThreadCandidateInventory(
	threadLink: Pick<CodexThreadLinkPort, "discoverCandidates">,
	epoch: EpochGenerationSource,
): CanvasThreadCandidateInventory {
	let published: CodexThreadCandidatesProjectionInput = {
		kind: "codex_thread_candidates",
		state: "unknown",
	};
	let selections = new Map<string, ThreadId>();
	let generation: string | null = null;
	/**
	 * Retire the published list and say why, so no pane binds a row from it.
	 * @param reason What the browser is told.
	 */
	const retire = (reason: string): void => {
		published = { kind: "codex_thread_candidates", state: "unavailable", reason };
		selections = new Map();
		generation = null;
	};
	return Object.freeze({
		/**
		 * The list as every pane is shown it.
		 * @returns The list.
		 */
		read: () => published,
		/**
		 * The epoch the list was discovered under.
		 * @returns The name, or null when nothing is published.
		 */
		generation: () => generation,
		invalidate: retire,
		/**
		 * Discover the threads this child can be linked to and publish them.
		 * A failed discovery retires the list rather than leaving a stale one up.
		 * @returns What was discovered.
		 */
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
				generation = epochGeneration(epoch);
				return discovery;
			} catch (error) {
				retire(
					boundedBrowserReason(
						error instanceof Error ? error.message : null,
						"The Codex thread list could not be discovered.",
					),
				);
				throw error;
			}
		},
		/**
		 * The thread one published row named.
		 * @param selectionId The row.
		 * @returns The thread, or null when the list has moved on.
		 */
		threadIdFor: (selectionId: string) => selections.get(selectionId) ?? null,
	});
}

/** The owners one generation's thread-link actions are closed over. */
interface CanvasThreadLinkActionOptions {
	readonly workhorse: CodexWorkbenchComponents["workhorse"];
	readonly threadLink: CodexWorkbenchComponents["threadLink"];
	readonly semanticDelivery: CodexWorkbenchComponents["semanticDelivery"];
	readonly epoch: CodexWorkbenchComponents["epoch"];
	readonly identity: CodexWorkbenchComponents["identity"];
	readonly candidates: CanvasThreadCandidateInventory;
	readonly checkoutRoot: string;
}

/** The hash of nothing, which is what an attachment authors. */
const EMPTY_AUTHORED_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/**
 * Refuse to attach anything but a thread this epoch can still take ownership
 * of: one it can see, and one nobody has claimed.
 * @param observed How the runtime classified the thread.
 */
function assertAttachable(observed: ThreadLinkClassification): void {
	if (observed.link.state !== "inspect_only" || observed.link.reason !== "unknown_provenance") {
		throw new Error(
			`The requested thread is inspect-only: ${observed.link.reason ?? "invalid_result"}.`,
		);
	}
	if (observed.thread === null) {
		throw new Error("The requested thread has no exact persisted session row.");
	}
}

/**
 * Bind the browser's thread-link commands to one generation's owners.
 * @param options The owners, the published inventory, and the checkout root.
 * @returns The actions.
 */
function createCanvasThreadLinkActions(
	options: CanvasThreadLinkActionOptions,
): BrowserThreadLinkActions {
	const controllerTokens = new Map<
		BrowserActionContext["connection"],
		CodexThreadContextBindingToken
	>();
	/**
	 * The committed epoch record that owns one thread in this child epoch.
	 * @param threadId The thread.
	 * @returns The record, or null when this epoch does not own it.
	 */
	const recordFor = (threadId: ThreadId): EpochOperationRecord | null => {
		const active = options.epoch.snapshot().manifest.activeEpoch;
		if (active === null) {
			return null;
		}
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
	/**
	 * Take ownership of a thread this epoch did not create, by staging and
	 * committing one attachment operation for it.
	 * @param threadId The thread.
	 * @param context The pane and its child epoch.
	 * @returns The committed record.
	 */
	const attachRecord = async (
		threadId: ThreadId,
		context: BrowserActionContext,
	): Promise<EpochOperationRecord> => {
		const observed = await options.threadLink.classify({
			threadId,
			childId: context.childId,
			epoch: context.epoch,
		});
		assertAttachable(observed);
		const operationId = options.identity.operation.issuer.mintOperationId();
		const transaction = options.epoch.stageOperation({
			childId: context.childId,
			epoch: context.epoch,
			operationId,
			kind: EPOCH_THREAD_ATTACH_OPERATION.kind,
			rpc: EPOCH_THREAD_ATTACH_OPERATION.rpc,
			workspaceRoot: options.checkoutRoot,
			instructionHash: EMPTY_AUTHORED_HASH,
			manifestHash: EMPTY_AUTHORED_HASH,
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
	 * The thread the person actually chose, refused unless the published row
	 * still names it and the list still describes this epoch.
	 *
	 * The second refusal retires the published list so the browser re-discloses
	 * it rather than being told to retry a row that is no longer what it said it
	 * was.
	 * @param command What the browser chose.
	 * @returns The thread.
	 */
	const chosenThread = (command: BrowserThreadLinkTargetCommand): ThreadId => {
		const threadId = options.candidates.threadIdFor(command.selectionId);
		if (threadId === null || threadId !== command.threadId) {
			throw new Error(
				"The chosen thread row is no longer in the published list. Refresh the thread list and choose again.",
			);
		}
		const offered = options.candidates.generation();
		if (offered === null || offered !== epochGeneration(options.epoch)) {
			options.candidates.invalidate(
				"The Codex thread list was discovered under an earlier epoch and no longer describes this workbench. Refresh it and choose again.",
			);
			throw new Error(
				"The Codex thread list was discovered under an earlier epoch. Refresh the thread list and choose again.",
			);
		}
		return threadId;
	};
	/**
	 * The epoch record owning the chosen thread, taking ownership first if this
	 * epoch has none.
	 *
	 * Ownership is not staged for every listed thread at discovery, because that
	 * would mint ownership of threads nobody chose; so when it happens here the
	 * retained selection is spent and a freshly discovered one for the same
	 * thread takes its place. That re-resolution is caused by this command and
	 * by nothing else.
	 * @param threadId The chosen thread.
	 * @param context The pane and its child epoch.
	 * @param selectionId The row the person chose.
	 * @returns The owning record and the row to bind through.
	 */
	const ownedSelection = async (
		threadId: ThreadId,
		context: BrowserActionContext,
		selectionId: string,
	): Promise<{ readonly record: EpochOperationRecord; readonly selectionId: string }> => {
		const existing = recordFor(threadId);
		if (existing !== null) {
			return { record: existing, selectionId };
		}
		const record = await attachRecord(threadId, context);
		const discovery = await options.candidates.refresh();
		const chosen = discovery.candidates.find((candidate) => candidate.threadId === threadId);
		if (chosen === undefined) {
			throw new Error("The chosen thread is no longer in the joined Codex thread list.");
		}
		return { record, selectionId: chosen.selectionId };
	};
	/**
	 * Bind the exact row the person chose.
	 *
	 * The published selection names which row that was, and the bind goes through
	 * the runtime's one-shot, CAS-checked candidate handle, so a thread id alone
	 * can never adopt a thread this pane did not offer.
	 * @param command What the browser chose.
	 * @param context The pane and its child epoch.
	 * @returns The browser outcome.
	 */
	const adoptCandidate = async (
		command: BrowserThreadLinkTargetCommand,
		context: BrowserActionContext,
	): Promise<BrowserActionResult> => {
		const threadId = chosenThread(command);
		const owned = await ownedSelection(threadId, context, command.selectionId);
		options.epoch.assertCurrent({
			childId: context.childId,
			epoch: context.epoch,
			operationId: owned.record.operation.id,
			threadId,
		});
		const binding = await options.threadLink.bindCandidate(
			context.paneId,
			expectedBrowserLink(context),
			owned.selectionId,
		);
		if (binding.link.state !== "executable") {
			throw new Error(`The requested thread is inspect-only: ${binding.link.reason}.`);
		}
		const token = replaceThreadContextBinding(
			options.semanticDelivery,
			{
				threadId,
				childId: context.childId,
				epoch: context.epoch,
				operationId: owned.record.operation.id,
			},
			binding,
		);
		controllerTokens.set(context.connection, token);
		return { outcome: "delivered" };
	};
	return Object.freeze({
		/**
		 * Start a new workhorse thread and link this pane to it.
		 * @param _command The creation, which names nothing to choose.
		 * @param context The pane and its child epoch.
		 * @returns The browser outcome.
		 */
		create: async (_command, context) => {
			const started = await options.workhorse.start({
				paneId: context.paneId,
				expected: expectedBrowserLink(context),
			});
			if (started.binding === null) {
				throw new Error("The created workhorse did not return its adopted pane link.");
			}
			const ready = namedTarget(started, started.binding);
			if (ready === null) {
				throw new Error("The created workhorse did not return exact target authority.");
			}
			const token = replaceThreadContextBinding(
				options.semanticDelivery,
				ready.target,
				started.binding,
			);
			controllerTokens.set(context.connection, token);
			return { outcome: "delivered" };
		},
		/**
		 * Re-discover the threads this pane could link to.
		 * @returns The browser outcome.
		 */
		refresh: async () => {
			await options.candidates.refresh();
			return { outcome: "delivered" };
		},
		/**
		 * Link this pane to a thread that already exists.
		 * @param command What the browser chose.
		 * @param context The pane and its child epoch.
		 * @returns The browser outcome.
		 */
		attach: (command, context) => adoptCandidate(command, context),
		/**
		 * Move this pane's link to another existing thread.
		 * @param command What the browser chose.
		 * @param context The pane and its child epoch.
		 * @returns The browser outcome.
		 */
		relink: (command, context) => adoptCandidate(command, context),
		/**
		 * Release the thread context this browser held, so a pane that is gone
		 * leaves nothing published on its behalf.
		 * @param context The pane and its connection.
		 */
		onBrowserDisconnect: (context) => {
			const token = controllerTokens.get(context.connection);
			controllerTokens.delete(context.connection);
			if (token !== undefined) {
				clearCanvasThreadContextForLease(options.semanticDelivery, token);
			}
		},
	} satisfies BrowserThreadLinkActions);
}

export {
	bindThreadContextToReadyWorkhorse,
	clearCanvasThreadContextForLease,
	type CanvasThreadCandidateInventory,
	createCanvasThreadCandidateInventory,
	createCanvasThreadLinkActions,
};
