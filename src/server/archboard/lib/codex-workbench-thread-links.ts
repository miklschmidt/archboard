import type { BrowserActionContext, BrowserThreadLinkActions } from "@/server/codex-workbench";
import type { ChildEpoch, ChildId, ThreadId } from "@/shared/codex-workbench-identity";
import type { CodexThreadLinkPort, ThreadLinkBindingSnapshot } from "@/runtime/codex-thread-link";
import type { CodexWorkhorseStart } from "@/runtime/codex-workhorse-start";
import type {
	CodexThreadContextBindingToken,
	CodexThreadContextController,
} from "@/runtime/codex-thread-context";
import type { CodexWorkbenchComponents } from "@/server/archboard/lib/codex-workbench";
import type {
	CodexWorkbenchSessionComponents,
	CodexWorkbenchTabSessionScope,
} from "@/server/archboard/lib/codex-workbench-sessions";

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
 * Move the thread-context binding onto one created thread, refusing any link
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
function clearServerThreadContextForLease(
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
 * Refuse a command whose pane no longer sees the link it named: another pane
 * changed the server's one link while this command waited its turn.
 * @param threadLink What reads the link.
 * @param context The pane and the link it named.
 */
function assertBrowserLinkStands(
	threadLink: Pick<CodexThreadLinkPort, "read">,
	context: BrowserActionContext,
): void {
	const { cas } = threadLink.read(context.paneId);
	const expected = expectedBrowserLink(context);
	const fields = ["revision", "childId", "epoch", "threadId"] as const;
	if (fields.some((field) => cas[field] !== expected[field])) {
		throw new Error(
			"The Archboard server's thread link changed while this command waited; read it again.",
		);
	}
}

/** The owners one tab session's thread-link actions are closed over. */
interface ServerThreadLinkActionOptions {
	readonly coordinator: Pick<
		CodexWorkbenchSessionComponents["coordinator"],
		"ensure" | "replace" | "snapshot"
	>;
	readonly identity: Pick<CodexWorkbenchComponents["identity"], "operation">;
	readonly workhorse: CodexWorkbenchSessionComponents["workhorse"];
	readonly threadLink: CodexWorkbenchComponents["threadLink"];
	readonly semanticDelivery: CodexWorkbenchSessionComponents["semanticDelivery"];
	/** Record that the session started a thread, so what Codex says about it finds the session. */
	readonly claimThread: CodexWorkbenchTabSessionScope["claimThread"];
}

/** The coordinator as it describes itself. */
type CoordinatorSnapshot = ReturnType<ServerThreadLinkActionOptions["coordinator"]["snapshot"]>;

/**
 * Take no action on how a replaced coordinator's unload went: the retired thread
 * keeps its rollout either way, and nothing a create answers depends on it.
 */
function ignoreRetirement(): void {}

/**
 * Give a new conversation a ready coordinator before its workhorse starts. The
 * first conversation starts one. A conversation that replaces another replaces
 * the coordinator that carried the old one, which Codex unloads once nothing
 * runs on it (TASK-374). A ready coordinator no conversation has carried yet,
 * because the create that started it failed at its workhorse, is kept.
 * The session claims the ready coordinator's thread.
 * @param options The coordinator, the operation ids its starts run under, and the claim.
 * @param replacing Whether the pane's link names a conversation this create replaces.
 * @throws {Error} With the coordinator's reason when it did not become ready.
 */
async function coordinatorForConversation(
	options: Pick<ServerThreadLinkActionOptions, "coordinator" | "identity" | "claimThread">,
	replacing: boolean,
): Promise<void> {
	const operationId = options.identity.operation.issuer.mintOperationId();
	const coordinator: CoordinatorSnapshot =
		replacing && options.coordinator.snapshot().state === "ready"
			? await options.coordinator.replace({
					operationId,
					onRetired: ignoreRetirement,
				})
			: await options.coordinator.ensure({ operationId });
	if (coordinator.state !== "ready") {
		throw new Error(coordinator.reason ?? `The agent's coordinator is ${coordinator.state}.`);
	}
	if (coordinator.threadId !== null) {
		options.claimThread(coordinator.threadId);
	}
}

/**
 * Bind the browser's thread-link commands to one tab session's owners.
 * @param options The owners.
 * @returns The actions.
 */
function createServerThreadLinkActions(
	options: ServerThreadLinkActionOptions,
): BrowserThreadLinkActions {
	const controllerTokens = new Map<
		BrowserActionContext["connection"],
		CodexThreadContextBindingToken
	>();
	let linkChanges: Promise<unknown> = Promise.resolve();
	/**
	 * Run one link change after every earlier one has settled. The server has one
	 * link whichever pane asks, so a create that lost a race must be refused
	 * before thread/start: past it, the loser's failed compare-and-swap would
	 * leave the workhorse failed under the link the winner made.
	 * @param change The change.
	 * @returns What the change answered.
	 */
	const serializeLinkChange = <Value>(change: () => Promise<Value>): Promise<Value> => {
		const run = linkChanges.then(change);
		linkChanges = run.catch(() => undefined);
		return run;
	};
	return Object.freeze({
		/**
		 * Start a new conversation and make it the server's link: its coordinator
		 * first, then its workhorse thread, then board-change delivery to it. A
		 * coordinator that cannot start refuses the create with its reason and
		 * starts no workhorse; the next message or Talk tries again.
		 * @param _command The creation, which names nothing to choose.
		 * @param context The pane and its child epoch.
		 * @returns The browser outcome.
		 */
		create: (_command, context) =>
			serializeLinkChange(async () => {
				assertBrowserLinkStands(options.threadLink, context);
				await coordinatorForConversation(options, context.link.threadId !== null);
				const started = await options.workhorse.start({
					paneId: context.paneId,
					expected: expectedBrowserLink(context),
				});
				if (started.threadId !== null) {
					options.claimThread(started.threadId);
				}
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
				return { outcome: "delivered" as const };
			}),
		/**
		 * Forget which binding this browser connection took, and leave the binding
		 * itself alone.
		 *
		 * A browser going away is a person closing a window. The agent session on
		 * the other side of it is still running, still writing boards, and still
		 * needs to hear when somebody changes one underneath it — so the recipient
		 * cannot be a thing a disconnect destroys. This used to clear the
		 * thread-context binding, which meant closing a tab silenced the session
		 * bound to it until somebody opened another one and started a new conversation.
		 *
		 * What still ends a binding is the session itself ending — the child exits,
		 * the epoch is retired, the workbench shuts down — or a new conversation
		 * replacing it with another. Both of those are facts about the agent rather than about
		 * the screen.
		 *
		 * The connection's token is forgotten either way, so a later lease on the
		 * same connection cannot clear a binding it never took.
		 * @param context The pane and its connection.
		 */
		onBrowserDisconnect: (context) => {
			controllerTokens.delete(context.connection);
		},
	} satisfies BrowserThreadLinkActions);
}

export {
	bindThreadContextToReadyWorkhorse,
	clearServerThreadContextForLease,
	createServerThreadLinkActions,
};
