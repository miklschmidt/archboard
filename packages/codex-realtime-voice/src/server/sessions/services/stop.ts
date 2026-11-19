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
// Work admitted before the stop settles before the first read, so it cannot start after the stop
// ends. A read that finds nothing is confirmed by one more read, so a queued request that started
// while the first read ran is still seen. While the stop runs, and after it ends with work that
// still runs or could not be read, the workhorse takes no new work. After it ends all work, no
// coordinator turn that asked for a stop starts work either, so only a fresh request does.

import { CODEX_SESSION_MS } from "@archboard/timing";
import type { ThreadId, TurnId } from "@archboard/codex-app-server/identity";
import type { CoordinatorToolWorkhorse } from "#runtime/voice/coordinator/tools-and-work/coordinator-tools/protocol/contract.ts";
import { boundRemainingWork } from "#runtime/voice/coordinator/tools-and-work/tool-contract/protocol/tool-results.ts";
import type { BuiltWorkhorse } from "#server/generation/protocol/session-contract.ts";
import type {
	CodexWorkbenchWorkhorse,
	RemainingWork,
	WorkhorseStop,
	WorkhorseStopPhase,
} from "#server/sessions/services/workhorses.ts";
import { listSubAgents } from "#runtime/workhorses/workhorse-operations/operations/inspect.ts";
import {
	observeThread,
	type ObservedThread,
	type WorkTreeStopSession,
} from "#server/sessions/services/work-tree-reads.ts";

/** Where a workhorse's last stop stands, as inspection reports it. */
type WorkhorseStopReport = ReturnType<CoordinatorToolWorkhorse["lastStop"]>;

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

/**
 * The refusal of new work for a workhorse that is stopping, or whose stop did not end all work,
 * or whose stop the asking coordinator turn requested. Its code is a reviewed tool refusal
 * reason, so the coordinator hears it as busy.
 */
class WorkhorseStopRefusal extends Error {
	override readonly name = "WorkhorseStopRefusal";
	readonly code = "busy";
}

/** What one pass saw of the whole tree. */
interface ObservedTree {
	readonly threads: readonly ObservedThread[];
	/** False when the workhorse's sub-agents could not be listed. */
	readonly listed: boolean;
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
			.catch((): ObservedThread => ({ threadId: root, running: null, queued: null })),
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
 * What a stop ended with, naming at most the threads a report holds.
 * @param checkout The workhorse's checkout.
 * @param outcome The outcome, judged from all the remaining work.
 * @param remaining All the remaining work.
 * @returns The stop.
 */
function stopOf(
	checkout: string,
	outcome: WorkhorseStop["outcome"],
	remaining: readonly RemainingWork[],
): WorkhorseStop {
	return { checkout, outcome, remaining: boundRemainingWork(remaining) };
}

/**
 * What a stop ended with when two reads in a row saw nothing left.
 * @param checkout The workhorse's checkout.
 * @param acted Whether a pass stopped any work.
 * @returns Stopped when the stop ended work, otherwise idle.
 */
function ended(checkout: string, acted: boolean): WorkhorseStop {
	return stopOf(checkout, acted ? "stopped" : "idle", []);
}

/**
 * Stop one work tree: repeat a pass until two reads in a row see nothing that runs, waits or is
 * unread, or the settle time runs out. Success always comes from a read after the last effect,
 * and the first pass that sees work always acts on it, however long its read took.
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
	let confirming = false;
	for (;;) {
		// oxlint-disable-next-line no-await-in-loop -- each pass reads what the effects of the pass before it left
		const tree = await readTree(session, root);
		const remaining = remainingOf(tree);
		if (remaining.length === 0) {
			if (confirming) {
				return ended(checkout, acted);
			}
			confirming = true;
			continue;
		}
		confirming = false;
		if (acted && clock.now() >= deadline) {
			return stopOf(checkout, unsettledOutcome(remaining), remaining);
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
	if (askedBy !== null) {
		state.stopAskers.add(askedBy);
	}
	if (state.stop?.kind === "stopping") {
		return state.stop.done;
	}
	const admitted = [...state.admitted];
	const done = Promise.all(admitted).then(() => observeStop(workhorse, session, clock));
	state.stop = { kind: "stopping", done };
	const stop = await done;
	state.stop = phaseAfter(stop);
	return stop;
}

/**
 * Where a workhorse stands after a stop.
 * @param stop What the stop observed.
 * @returns Stopped when it showed that all work ended, otherwise unresolved.
 */
function phaseAfter(stop: WorkhorseStop): WorkhorseStopPhase {
	return stop.outcome === "stopped" || stop.outcome === "idle"
		? { kind: "stopped", stop }
		: { kind: "unresolved", stop };
}

/**
 * Whether a coordinator turn asked for a stop of a workhorse.
 * @param workhorse The workhorse.
 * @param coordinatorTurn The coordinator turn starting work, or null for a person's request.
 * @returns True only for a coordinator turn that asked for a stop.
 */
function askedForStop(
	workhorse: Pick<CodexWorkbenchWorkhorse, "state">,
	coordinatorTurn: TurnId | null,
): boolean {
	return coordinatorTurn !== null && workhorse.state.stopAskers.has(coordinatorTurn);
}

/**
 * Why a workhorse takes no new work now.
 * @param workhorse The workhorse.
 * @param coordinatorTurn The coordinator turn starting the work, or null for a person's request.
 * @returns The reason, or null when it takes the work.
 */
function refusal(
	workhorse: Pick<CodexWorkbenchWorkhorse, "state" | "checkout">,
	coordinatorTurn: TurnId | null,
): string | null {
	const { checkout, state } = workhorse;
	const phase = state.stop;
	switch (phase?.kind) {
		case "stopping":
			return `The workhorse of ${checkout} is stopping; new work waits until the stop ends.`;
		case "unresolved":
			return `The last stop of the workhorse of ${checkout} did not show that all work ended (${phase.stop.outcome}); inspect it or stop it again before new work.`;
		default:
			return askedForStop(workhorse, coordinatorTurn)
				? `The work of ${checkout} stopped at the user's request; start work again only for a new request from the user.`
				: null;
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
	const reason = refusal(workhorse, coordinatorTurn);
	if (reason !== null) {
		throw new WorkhorseStopRefusal(reason);
	}
}

/**
 * Start work on a workhorse unless it refuses work now, and hold the work as admitted until it
 * settles, so a stop that begins meanwhile waits for it and then sees what it started.
 * @param workhorse The workhorse the work is for.
 * @param coordinatorTurn The coordinator turn starting the work, or null for a person's request.
 * @param start The work.
 * @returns What the work returned.
 * @throws {WorkhorseStopRefusal} When the workhorse takes no new work now.
 */
function admitWork<Result>(
	workhorse: CodexWorkbenchWorkhorse,
	coordinatorTurn: TurnId | null,
	start: () => Promise<Result>,
): Promise<Result> {
	refuseWhileStopping(workhorse, coordinatorTurn);
	const running = start();
	const settled = running.then(
		() => undefined,
		() => undefined,
	);
	workhorse.state.admitted.add(settled);
	void settled.then(() => workhorse.state.admitted.delete(settled));
	return running;
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
	): Promise<Result> => admitWork(workhorse(), coordinatorTurn, start);
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
	admitWork,
	guardWorkhorse,
	refuseWhileStopping,
	stopReport,
	stopWorkTree,
	WorkhorseStopRefusal,
	type WorkTreeStopClock,
};
