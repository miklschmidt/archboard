// The stop of a workhorse's whole work tree (ADR 0048).
//
// Spoken Stop and the workbench Stop control run this one operation. A workhorse's work tree is
// its own thread and every sub-agent that it spawned, at any depth. Codex interrupts one loaded
// thread per turn/interrupt and never cascades, it acknowledges an interrupt before the turn
// reports that it ended, an interrupted queue only pauses, and a sub-agent can accept input or
// start a turn while its parent is cancelled. So a stop marks the workhorse stopping before any
// effect, then repeats one pass until a pass sees nothing that runs or waits: read every thread of
// the tree, delete each queued request, and interrupt each running turn, the workhorse's first.
// Each pass after an interrupt reads again, so only Codex's own report proves that work ended.
//
// While the stop runs, and after it ends with work that still runs or could not be read, the
// workhorse takes no new work. After it ends all work, the coordinator turn that asked for it
// starts none either, so only a fresh request starts work again.

import { CODEX_SESSION_MS } from "@archboard/timing";
import type { ThreadId, TurnId, QueuedSubmissionId } from "@archboard/codex-app-server/identity";
import type { CodexSession } from "@archboard/codex-app-server/session";
import type { CodexThreadStatusType } from "@archboard/codex-app-server/contract";
import { listSubAgents } from "#runtime/workhorses/workhorse-operations/operations/inspect.ts";
import type { CoordinatorToolWorkhorse } from "#runtime/voice/coordinator/tools-and-work/coordinator-tools/protocol/contract.ts";
import type { BuiltWorkhorse } from "#server/generation/protocol/session-contract.ts";
import type {
	CodexWorkbenchWorkhorse,
	RemainingWork,
	WorkhorseStop,
	WorkhorseStopPhase,
} from "#server/sessions/services/workhorses.ts";

/** Where a workhorse's last stop stands, as inspection reports it. */
type WorkhorseStopReport = ReturnType<CoordinatorToolWorkhorse["lastStop"]>;

/** The reads and effects a stop needs from the Codex session. */
type WorkTreeStopSession = Pick<
	CodexSession,
	| "threadRead"
	| "threadListPage"
	| "threadTurnsListPage"
	| "queueListPage"
	| "queueDelete"
	| "turnInterrupt"
>;

/** How a stop tells time and waits between its passes; tests pass their own. */
interface WorkTreeStopClock {
	readonly now: () => number;
	readonly wait: (ms: number) => Promise<void>;
}

/** The clock of a running server. */
const SYSTEM_CLOCK: WorkTreeStopClock = Object.freeze({
	/**
	 * The time now.
	 * @returns Milliseconds since the epoch.
	 */
	now: () => Date.now(),
	/**
	 * Wait.
	 * @param ms How long.
	 */
	wait: async (ms: number) => {
		await new Promise<void>((resolve) => {
			setTimeout(resolve, ms);
		});
	},
});

/** What one pass saw of one thread of the work tree. */
interface ObservedThread {
	readonly threadId: ThreadId;
	/** The running turn, null when none runs, or "unknown" when Codex says active but names none. */
	readonly running: TurnId | null | "unknown";
	/** The requests waiting in its queue, or null when the queue could not be read. */
	readonly queued: readonly QueuedSubmissionId[] | null;
}

/** What one pass saw of the whole tree. */
interface ObservedTree {
	readonly threads: readonly ObservedThread[];
	/** False when the workhorse's sub-agents could not be listed. */
	readonly listed: boolean;
}

/**
 * The refusal of new work for a workhorse that is stopping, or whose stop did not end all work,
 * or whose stop the asking coordinator turn requested. Its code is a reviewed tool refusal
 * reason, so the coordinator hears it as busy.
 */
class WorkhorseStopRefusal extends Error {
	override readonly name = "WorkhorseStopRefusal";
	readonly code = "busy";
}

/**
 * The turn running on a thread that Codex reports as active, from its newest turns. A thread
 * summary carries no turns, so only this listing names the running turn.
 * @param session Lists turns.
 * @param threadId The thread.
 * @returns The running turn, or "unknown" when no listed turn is in progress.
 */
async function runningTurn(
	session: WorkTreeStopSession,
	threadId: ThreadId,
): Promise<TurnId | "unknown"> {
	const page = await session.threadTurnsListPage({
		threadId,
		limit: 5,
		sortDirection: "desc",
		itemsView: "notLoaded",
	});
	return page.data.find((turn) => turn.status === "inProgress")?.id ?? "unknown";
}

/**
 * Every request waiting in a thread's queue.
 * @param session Lists queues.
 * @param threadId The thread.
 * @returns The queued requests, in queue order.
 * @throws {Error} When Codex repeats a cursor, so the listing would never end.
 */
async function queuedRequests(
	session: WorkTreeStopSession,
	threadId: ThreadId,
): Promise<readonly QueuedSubmissionId[]> {
	const ids: QueuedSubmissionId[] = [];
	const seen = new Set<string>();
	let cursor: string | null = null;
	do {
		// oxlint-disable-next-line no-await-in-loop -- pagination is sequential by contract: each page's cursor comes from the one before it
		const page = await session.queueListPage({ threadId, cursor });
		ids.push(...page.data.map((submission) => submission.id));
		cursor = page.nextCursor;
		if (cursor !== null && seen.has(cursor)) {
			throw new Error("The queue listing repeated a cursor.");
		}
		if (cursor !== null) seen.add(cursor);
	} while (cursor !== null);
	return ids;
}

/**
 * Observe one thread whose status is known. A thread that is not loaded runs nothing and starts
 * nothing until something loads it, so its queue is not read.
 * @param session Reads turns and queues.
 * @param threadId The thread.
 * @param status Its status type as Codex reported it.
 * @returns What it runs and what waits on it; a read that fails reads as unknown.
 */
async function observeThread(
	session: WorkTreeStopSession,
	threadId: ThreadId,
	status: CodexThreadStatusType,
): Promise<ObservedThread> {
	if (status === "notLoaded") {
		return { threadId, running: null, queued: [] };
	}
	const [running, queued] = await Promise.all([
		status === "active"
			? runningTurn(session, threadId).catch(() => "unknown" as const)
			: Promise.resolve(null),
		queuedRequests(session, threadId).catch(() => null),
	]);
	return { threadId, running, queued };
}

/**
 * Read the whole work tree once: the workhorse thread first, then each sub-agent, parents before
 * the agents they spawned.
 * @param session Reads threads, turns and queues.
 * @param root The workhorse thread.
 * @returns What the pass saw.
 */
async function readTree(session: WorkTreeStopSession, root: ThreadId): Promise<ObservedTree> {
	const [rootThread, agents] = await Promise.all([
		session
			.threadRead({ threadId: root, includeTurns: false })
			.then(({ thread }) => observeThread(session, root, thread.status.type))
			.catch((): ObservedThread => ({ threadId: root, running: "unknown", queued: null })),
		listSubAgents(session, root).catch(() => null),
	]);
	const observed = await Promise.all(
		(agents ?? []).map(({ threadId, status }) => observeThread(session, threadId, status)),
	);
	return { threads: [rootThread, ...observed], listed: agents !== null };
}

/**
 * What one thread still runs, waits on or hides.
 * @param thread What a pass saw of it.
 * @returns Its remaining work, or null when it has none.
 */
function remainingOn(thread: ObservedThread): RemainingWork | null {
	if (thread.running !== null) {
		return { threadId: thread.threadId, state: "running" };
	}
	if (thread.queued === null) {
		return { threadId: thread.threadId, state: "unread" };
	}
	return thread.queued.length > 0 ? { threadId: thread.threadId, state: "queued" } : null;
}

/**
 * What a pass saw that still runs, waits or could not be read. A sub-agent listing that failed
 * leaves the workhorse thread unread, because its tree is unknown.
 * @param tree What the pass saw.
 * @returns The remaining work.
 */
function remainingOf(tree: ObservedTree): readonly RemainingWork[] {
	const remaining = tree.threads.flatMap((thread) => remainingOn(thread) ?? []);
	const root = tree.threads[0]!.threadId;
	return tree.listed || remaining.some((work) => work.threadId === root)
		? remaining
		: [{ threadId: root, state: "unread" }, ...remaining];
}

/**
 * Delete what waits on one thread and interrupt what runs on it. A turn is interrupted once; a
 * turn that starts later is a new turn. A failed effect is not an outcome: the next pass reads
 * what became of it.
 * @param session Deletes queued requests and interrupts turns.
 * @param thread What the pass saw of the thread.
 * @param interrupted The turns already interrupted by this stop; added to.
 */
async function stopThread(
	session: WorkTreeStopSession,
	thread: ObservedThread,
	interrupted: Set<TurnId>,
): Promise<void> {
	await Promise.all(
		(thread.queued ?? []).map((queuedSubmissionId) =>
			session.queueDelete({ threadId: thread.threadId, queuedSubmissionId }).catch(() => undefined),
		),
	);
	const turnId = thread.running;
	if (turnId === null || turnId === "unknown" || interrupted.has(turnId)) {
		return;
	}
	interrupted.add(turnId);
	await session.turnInterrupt({ threadId: thread.threadId, turnId }).catch(() => undefined);
}

/**
 * Stop every thread a pass saw, the workhorse first and each parent before the agents it spawned,
 * so no agent is left to spawn again after its children stopped.
 * @param session Deletes queued requests and interrupts turns.
 * @param tree What the pass saw.
 * @param interrupted The turns already interrupted by this stop; added to.
 */
async function act(
	session: WorkTreeStopSession,
	tree: ObservedTree,
	interrupted: Set<TurnId>,
): Promise<void> {
	for (const thread of tree.threads) {
		// oxlint-disable-next-line no-await-in-loop -- parents stop before the agents they spawned, by contract, so the order is the point
		await stopThread(session, thread, interrupted);
	}
}

/**
 * The outcome of a stop that ran out of time with work remaining.
 * @param remaining What still runs, waits or could not be read.
 * @returns Partial when something was seen running or waiting, otherwise unconfirmed.
 */
function unsettledOutcome(remaining: readonly RemainingWork[]): WorkhorseStop["outcome"] {
	return remaining.some((work) => work.state !== "unread") ? "partial" : "unconfirmed";
}

/**
 * Stop one work tree: repeat a pass until one sees nothing that runs, waits or is unread, or the
 * settle time runs out. Success always comes from a read after the last effect.
 * @param checkout The workhorse's checkout.
 * @param root The workhorse thread.
 * @param session Reads and stops the tree.
 * @param clock Tells time and waits between passes.
 * @returns What the stop observed.
 */
async function settle(
	checkout: string,
	root: ThreadId,
	session: WorkTreeStopSession,
	clock: WorkTreeStopClock,
): Promise<WorkhorseStop> {
	const deadline = clock.now() + CODEX_SESSION_MS.workTreeStopSettle;
	const interrupted = new Set<TurnId>();
	let acted = false;
	for (;;) {
		// oxlint-disable-next-line no-await-in-loop -- each pass reads what the effects of the pass before it left
		const tree = await readTree(session, root);
		const remaining = remainingOf(tree);
		if (remaining.length === 0) {
			return { checkout, outcome: acted ? "stopped" : "idle", remaining };
		}
		if (clock.now() >= deadline) {
			return { checkout, outcome: unsettledOutcome(remaining), remaining };
		}
		// oxlint-disable-next-line no-await-in-loop -- the effects of a pass finish before the next pass reads
		await act(session, tree, interrupted);
		acted = true;
		// oxlint-disable-next-line no-await-in-loop -- the next pass waits for Codex to report what the interrupts ended
		await clock.wait(CODEX_SESSION_MS.workTreeStopPoll);
	}
}

/**
 * What one stop of a workhorse observed, whether or not it has a thread.
 * @param workhorse The workhorse.
 * @param session Reads and stops its threads.
 * @param clock Tells time and waits between passes.
 * @returns What the stop observed; a stop that failed outright is unconfirmed.
 */
function observeStop(
	workhorse: CodexWorkbenchWorkhorse,
	session: WorkTreeStopSession,
	clock: WorkTreeStopClock,
): Promise<WorkhorseStop> {
	const { checkout } = workhorse;
	const root = workhorse.components.workhorse.snapshot().threadId;
	if (root === null) {
		return Promise.resolve({ checkout, outcome: "idle", remaining: [] });
	}
	return settle(checkout, root, session, clock).catch((): WorkhorseStop => ({
		checkout,
		outcome: "unconfirmed",
		remaining: [{ threadId: root, state: "unread" }],
	}));
}

/**
 * Stop a workhorse's whole work tree. A stop that is already running answers this one too.
 * @param workhorse The workhorse.
 * @param session Reads and stops its threads.
 * @param askedBy The coordinator turn that asked for the stop, or null for the Stop control.
 * @param clock Tells time and waits between passes.
 * @returns What the stop observed.
 */
async function stopWorkTree(
	workhorse: CodexWorkbenchWorkhorse,
	session: WorkTreeStopSession,
	askedBy: TurnId | null,
	clock: WorkTreeStopClock = SYSTEM_CLOCK,
): Promise<WorkhorseStop> {
	const { state } = workhorse;
	if (state.stop?.kind === "stopping") {
		return state.stop.done;
	}
	const done = observeStop(workhorse, session, clock);
	state.stop = { kind: "stopping", done };
	const stop = await done;
	state.stop =
		stop.outcome === "stopped" || stop.outcome === "idle"
			? { kind: "stopped", stop, askedBy }
			: { kind: "unresolved", stop };
	return stop;
}

/**
 * Whether the coordinator turn starting work is the one that asked for the stop.
 * @param askedBy The coordinator turn that asked for the stop, or null for the Stop control.
 * @param coordinatorTurn The coordinator turn starting the work, or null for a person's request.
 * @returns True only for the same coordinator turn.
 */
function askedForStop(askedBy: TurnId | null, coordinatorTurn: TurnId | null): boolean {
	return askedBy !== null && askedBy === coordinatorTurn;
}

/**
 * Why a workhorse takes no new work now.
 * @param phase Where its last stop stands.
 * @param checkout Its checkout.
 * @param coordinatorTurn The coordinator turn starting the work, or null for a person's request.
 * @returns The reason, or null when it takes the work.
 */
function refusal(
	phase: WorkhorseStopPhase | null,
	checkout: string,
	coordinatorTurn: TurnId | null,
): string | null {
	switch (phase?.kind) {
		case "stopping":
			return `The workhorse of ${checkout} is stopping; new work waits until the stop ends.`;
		case "unresolved":
			return `The last stop of the workhorse of ${checkout} did not show that all work ended (${phase.stop.outcome}); inspect it or stop it again before new work.`;
		case "stopped":
			return askedForStop(phase.askedBy, coordinatorTurn)
				? `The work of ${checkout} stopped at the user's request; start work again only for a new request from the user.`
				: null;
		default:
			return null;
	}
}

/**
 * Refuse new work for a workhorse that is stopping or whose stop did not end all work, and work
 * that the coordinator turn which asked for a finished stop tries to start.
 * @param workhorse The workhorse the work is for.
 * @param coordinatorTurn The coordinator turn starting the work, or null for a person's request.
 * @throws {WorkhorseStopRefusal} When the workhorse takes no new work now.
 */
function refuseWhileStopping(
	workhorse: CodexWorkbenchWorkhorse,
	coordinatorTurn: TurnId | null,
): void {
	const reason = refusal(workhorse.state.stop, workhorse.checkout, coordinatorTurn);
	if (reason !== null) {
		throw new WorkhorseStopRefusal(reason);
	}
}

/**
 * A workhorse's owners and actions, with every entry that starts work refusing it while the
 * workhorse stops, after a stop that did not end all its work, and from the coordinator turn that
 * asked for a stop that ended it. Deleting, reordering and editing what waits stay open, and so do
 * reads and the stop itself.
 * @param workhorse The workhorse, once it is built.
 * @param built Its owners and actions as its builder made them.
 * @returns The same owners and actions, guarded.
 */
function guardWorkhorse(
	workhorse: () => CodexWorkbenchWorkhorse,
	built: BuiltWorkhorse,
): BuiltWorkhorse {
	const { queue, operations } = built.components;
	const { threadLinks, ensureStarted } = built.actions;
	/**
	 * Run one entry that starts work, unless the workhorse refuses it now.
	 * @param coordinatorTurn The coordinator turn asking, or null for a person's request.
	 * @param start The entry.
	 * @returns What the entry returned.
	 */
	const guarded = async <Result>(
		coordinatorTurn: TurnId | null,
		start: () => Promise<Result>,
	): Promise<Result> => {
		refuseWhileStopping(workhorse(), coordinatorTurn);
		return start();
	};
	return {
		components: {
			...built.components,
			queue: {
				...queue,
				/**
				 * Queue a prompt, as the browser and explanations do.
				 * @param request The prompt.
				 * @returns The queue's answer.
				 */
				add: (request) => guarded(null, () => queue.add(request)),
				/**
				 * Run a queued prompt now.
				 * @param request The prompt.
				 * @returns The queue's answer.
				 */
				start: (request) => guarded(null, () => queue.start(request)),
			},
			operations: {
				...operations,
				/**
				 * Give the workhorse work for the coordinator.
				 * @param request The work.
				 * @returns The operation's answer.
				 */
				delegate: (request) => guarded(request.call.turnId, () => operations.delegate(request)),
				/**
				 * Steer the running turn for the coordinator.
				 * @param request The steer.
				 * @returns The operation's answer.
				 */
				steer: (request) => guarded(request.call.turnId, () => operations.steer(request)),
				/**
				 * Change the queue for the coordinator; only adding and starting is new work.
				 * @param request The change.
				 * @returns The operation's answer.
				 */
				manageQueue: (request) =>
					request.operation === "add" || request.operation === "start"
						? guarded(request.call.turnId, () => operations.manageQueue(request))
						: operations.manageQueue(request),
			},
		},
		actions: {
			threadLinks: {
				/**
				 * Start a new conversation of the workhorse.
				 * @param command The creation.
				 * @param context The chat.
				 * @returns The link owner's answer.
				 */
				create: (command, context) => guarded(null, () => threadLinks.create(command, context)),
			},
			/**
			 * Start the workhorse's thread when it has none, as a delegation does.
			 * @returns When it has one.
			 */
			ensureStarted: () => guarded(null, ensureStarted),
		},
	};
}

/**
 * Where a workhorse's last stop stands, as inspection reports it.
 * @param workhorse The workhorse.
 * @returns Stopping while it runs, then what it observed; null before any stop.
 */
function stopReport(workhorse: CodexWorkbenchWorkhorse): WorkhorseStopReport {
	const phase = workhorse.state.stop;
	if (phase === null) {
		return null;
	}
	if (phase.kind === "stopping") {
		return { outcome: "stopping", remaining: [] };
	}
	return { outcome: phase.stop.outcome, remaining: [...phase.stop.remaining] };
}

export {
	guardWorkhorse,
	refuseWhileStopping,
	stopReport,
	stopWorkTree,
	WorkhorseStopRefusal,
	type WorkTreeStopClock,
	type WorkTreeStopSession,
};
