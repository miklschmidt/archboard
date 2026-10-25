import type {
	BrowserActionContext,
	BrowserThreadLinkActions,
} from "#server/protocol/gateway/contract.ts";
import type { ChildEpoch, ChildId, ThreadId } from "@archboard/codex-app-server/identity";
import type {
	CodexThreadLinkPort,
	ThreadLinkBindingSnapshot,
	ThreadLinkCasToken,
} from "#runtime/rules/thread-link/contract.ts";
import type { CodexWorkhorseStart } from "#runtime/protocol/workhorse-start/contract.ts";
import type {
	CodexThreadContextBindingToken,
	CodexThreadContextController,
} from "#runtime/services/thread-context/contract.ts";
import type { CodexWorkbenchComponents } from "#server/services/generation/workbench.ts";
import type {
	CodexWorkbenchSessionComponents,
	CodexWorkbenchWorkhorseComponents,
	CodexWorkbenchWorkhorseScope,
} from "#server/services/sessions/sessions.ts";
import type { CodexWorkbenchWorkhorseActions } from "#server/services/sessions/workhorses.ts";

/** The workhorse as it describes its own thread. */
type WorkhorseSnapshot = ReturnType<CodexWorkhorseStart["snapshot"]>;

/** The exact thread a ready workhorse is bound to, with the proof it is bound. */
interface ReadyWorkhorseTarget {
	readonly linkKey: string;
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
 * @param link Its thread link.
 * @returns The target, or null when the snapshot names only part of one.
 */
function namedTarget(
	snapshot: WorkhorseSnapshot,
	link: ThreadLinkBindingSnapshot,
): ReadyWorkhorseTarget | null {
	const { linkKey, threadId, childId, epoch, operationId } = snapshot;
	if (
		linkKey === null ||
		threadId === null ||
		childId === null ||
		epoch === null ||
		operationId === null
	) {
		return null;
	}
	return { linkKey, target: { threadId, childId, epoch, operationId }, link };
}

/**
 * The thread a workhorse is bound to, only when it is ready and its link
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
		next: { linkKey: ready.linkKey, target: ready.target, link: ready.link },
	});
}

/**
 * Move the thread-context binding onto one created thread, refusing any link
 * that is not the proof of that exact adoption.
 * @param controller The controller being moved.
 * @param target The thread, its child epoch, and the operation that owns it.
 * @param link The link proving the adoption.
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
			linkKey: link.linkKey,
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
 * The link a browser command is only allowed to act on: the exact one the chat
 * says it is looking at, which is the link of its checkout's workhorse.
 * @param key The workhorse's link key.
 * @param context The chat, its tab session and the link it named.
 * @returns The expected link.
 */
function expectedBrowserLink(key: string, context: BrowserActionContext): ThreadLinkCasToken {
	return {
		revision: context.linkRevision,
		linkKey: key,
		childId: context.link.childId,
		epoch: context.link.epoch,
		threadId: context.link.threadId,
	};
}

/**
 * Refuse a command whose chat no longer sees the link it named: another chat of
 * its tab changed the workhorse's link while this command waited its turn.
 * @param threadLink What reads the link.
 * @param key The workhorse's link key.
 * @param context The chat, its tab session and the link it named.
 */
function assertBrowserLinkStands(
	threadLink: Pick<CodexThreadLinkPort, "read">,
	key: string,
	context: BrowserActionContext,
): void {
	const { cas } = threadLink.read(key);
	const expected = expectedBrowserLink(key, context);
	const fields = ["revision", "childId", "epoch", "threadId"] as const;
	if (fields.some((field) => cas[field] !== expected[field])) {
		throw new Error(
			"This browser tab's thread link changed while this command waited; read it again.",
		);
	}
}

/** The owners one workhorse's thread-link actions are closed over. */
interface ServerThreadLinkActionOptions {
	readonly coordinator: Pick<CodexWorkbenchSessionComponents["coordinator"], "ensure">;
	readonly identity: Pick<CodexWorkbenchComponents["identity"], "operation">;
	readonly workhorse: CodexWorkbenchWorkhorseComponents["workhorse"];
	readonly threadLink: CodexWorkbenchComponents["threadLink"];
	readonly contextDelivery: CodexWorkbenchWorkhorseComponents["contextDelivery"];
	/** The workhorse's link key: its tab session and its checkout. */
	readonly key: string;
	/** Record that the workhorse started a thread, so what Codex says about it finds it. */
	readonly claimThread: CodexWorkbenchWorkhorseScope["claimThread"];
	/** Record that the tab's coordinator started a thread. */
	readonly claimCoordinatorThread: CodexWorkbenchWorkhorseScope["claimCoordinatorThread"];
	/** Give up the workhorse thread a new conversation left: unloaded once nothing runs on it. */
	readonly retireThread: CodexWorkbenchWorkhorseScope["retireThread"];
}

/**
 * Give a workhorse's new conversation a ready coordinator before the workhorse starts. The tab's
 * first conversation starts one, and every later one keeps it: the coordinator speaks for the
 * whole tab and every workhorse of it (ADR 0050), so one checkout's new conversation leaves it
 * alone. The tab claims the ready coordinator's thread.
 * @param options The coordinator, the operation ids its start runs under, and the claim.
 * @throws {Error} With the coordinator's reason when it did not become ready.
 */
async function readyCoordinator(
	options: Pick<
		ServerThreadLinkActionOptions,
		"coordinator" | "identity" | "claimCoordinatorThread"
	>,
): Promise<void> {
	const operationId = options.identity.operation.issuer.mintOperationId();
	const coordinator = await options.coordinator.ensure({ operationId });
	if (coordinator.state !== "ready") {
		throw new Error(coordinator.reason ?? `The agent's coordinator is ${coordinator.state}.`);
	}
	if (coordinator.threadId !== null) {
		options.claimCoordinatorThread(coordinator.threadId);
	}
}

/**
 * Start a fresh thread for a workhorse under the link it is expected to replace, and point its
 * board-change delivery at that thread. The thread it leaves is unloaded once nothing runs on it.
 * @param options The owners.
 * @param expected The link the start replaces, as whoever asked for it last saw it.
 */
async function startWorkhorseThread(
	options: ServerThreadLinkActionOptions,
	expected: ThreadLinkCasToken,
): Promise<void> {
	const started = await options.workhorse.start({ linkKey: options.key, expected });
	if (started.threadId !== null) {
		options.claimThread(started.threadId);
	}
	if (started.binding === null) {
		throw new Error("The created workhorse did not return its adopted thread link.");
	}
	const ready = namedTarget(started, started.binding);
	if (ready === null) {
		throw new Error("The created workhorse did not return exact target authority.");
	}
	replaceThreadContextBinding(options.contextDelivery, ready.target, started.binding);
	const left = expected.threadId;
	if (left !== null && left !== ready.target.threadId) {
		void options.retireThread(left);
	}
}

/**
 * Bind one workhorse's thread-link actions: New conversation from a chat of its checkout, and the
 * start a delegation to its checkout needs.
 * @param options The owners.
 * @returns The actions.
 */
function createServerThreadLinkActions(
	options: ServerThreadLinkActionOptions,
): CodexWorkbenchWorkhorseActions {
	let linkChanges: Promise<unknown> = Promise.resolve();
	/**
	 * Run one link change after every earlier one has settled. A workhorse has one link whichever
	 * chat or delegation asks, so a start that lost a race must be refused before thread/start:
	 * past it, the loser's failed compare-and-swap would leave the workhorse failed under the link
	 * the winner made.
	 * @param change The change.
	 * @returns What the change answered.
	 */
	const serializeLinkChange = <Value>(change: () => Promise<Value>): Promise<Value> => {
		const run = linkChanges.then(change);
		linkChanges = run.catch(() => undefined);
		return run;
	};
	const threadLinks: BrowserThreadLinkActions = {
		/**
		 * Start a new conversation for the chat's checkout and make it its workhorse's link: the
		 * tab's coordinator first, then the workhorse thread, then board-change delivery to it. A
		 * coordinator that cannot start refuses the create with its reason and starts no workhorse;
		 * the next message or Talk tries again.
		 * @param _command The creation, which names nothing to choose.
		 * @param context The chat and its child epoch.
		 * @returns The browser outcome.
		 */
		create: (_command, context) =>
			serializeLinkChange(async () => {
				assertBrowserLinkStands(options.threadLink, options.key, context);
				await readyCoordinator(options);
				await startWorkhorseThread(options, expectedBrowserLink(options.key, context));
				return { outcome: "delivered" as const };
			}),
	};
	return Object.freeze({
		threadLinks: Object.freeze(threadLinks),
		/**
		 * Start the workhorse's thread when its link cannot run turns, as work the coordinator gives
		 * its checkout needs. A link that can is left as it is. The coordinator is left alone: it is
		 * running the turn that gives the work, and readying it again would show it unready to that
		 * turn's other calls while it proved itself.
		 * @returns Resolves once the workhorse has a thread that can run turns.
		 */
		ensureStarted: () =>
			serializeLinkChange(async () => {
				const binding = options.threadLink.read(options.key);
				if (binding.link.state !== "executable") {
					await startWorkhorseThread(options, binding.cas);
				}
			}),
	});
}

export {
	bindThreadContextToReadyWorkhorse,
	clearServerThreadContextForLease,
	createServerThreadLinkActions,
};
