// What the live generation says about itself, read at the moment somebody asks.
//
// Apart from the binding graph because these are questions rather than wiring,
// and because every one of them has the same shape: a component may not be
// ready, and a caller that remembered the answer would be holding an identity
// the generation has since replaced. A coordinator is created, restarted and
// retired inside one workhorse's life, and a relink gives the workhorse a new
// thread — so the pair that counts as one session has to be asked for, never
// sampled.

import type { CoordinatorCallbackLinkCorrelation } from "@/runtime/codex-coordinator-callbacks";
import type { CodexThreadContextBinding } from "@/runtime/codex-thread-context";
import { allNamed } from "@/server/canvas/lib/codex-workbench-generation-owners";
import type { CodexWorkbenchComponents } from "@/server/canvas/lib/codex-workbench";

/**
 * The thread the coordinator is ready on. Asked for rather than remembered: it
 * is created, restarted and retired inside one workhorse's life, and the pair is
 * one session, so a sampled value stops recognising its own other half.
 * @param created What the graph has built so far.
 * @returns The thread, or null while it is not ready.
 */
function readyCoordinatorThread(
	created: Readonly<Partial<CodexWorkbenchComponents>>,
): NonNullable<ReturnType<CodexWorkbenchComponents["coordinator"]["snapshot"]>["threadId"]> | null {
	const coordinator = created.coordinator?.snapshot();
	return coordinator?.state === "ready" ? coordinator.threadId : null;
}

/**
 * The child epoch and the two threads a voice or queue binding is stated
 * against, which exists only while both threads are ready.
 * @param created What the graph has built so far.
 * @returns The threads, or null.
 */
function readyThreadPair(created: Readonly<Partial<CodexWorkbenchComponents>>): {
	childId: NonNullable<ReturnType<CodexWorkbenchComponents["workhorse"]["snapshot"]>["childId"]>;
	epoch: NonNullable<ReturnType<CodexWorkbenchComponents["workhorse"]["snapshot"]>["epoch"]>;
	workhorseThreadId: NonNullable<
		ReturnType<CodexWorkbenchComponents["workhorse"]["snapshot"]>["threadId"]
	>;
	coordinatorThreadId: NonNullable<
		ReturnType<CodexWorkbenchComponents["coordinator"]["snapshot"]>["threadId"]
	>;
} | null {
	const workhorse = created.workhorse?.snapshot();
	const coordinatorThreadId = readyCoordinatorThread(created);
	if (workhorse?.state !== "ready" || coordinatorThreadId === null) {
		return null;
	}
	const { childId, epoch, threadId } = workhorse;
	const named = { childId, epoch, threadId };
	if (!allNamed(named)) {
		return null;
	}
	return {
		childId: named.childId,
		epoch: named.epoch,
		workhorseThreadId: named.threadId,
		coordinatorThreadId,
	};
}

/**
 * The link a callback reports the workhorse against: its binding, and the
 * thread, child epoch and operation it is running.
 *
 * Both the thread and the link evidence come from the thread-context binding
 * when a pane has bound one. The workhorse snapshot keeps naming the thread
 * that started this child, and the two part company the moment a pane is
 * relinked to a thread that already existed — so correlating against the
 * starter made the coordinator reject its own session's writes as somebody
 * else's and everybody else's as a stale link, which is both halves of the rule
 * failing at once. The child epoch and the operation stay the snapshot's: a
 * relink does not move the capability this generation runs under.
 * @param created What the graph has built so far.
 * @param assertCurrent Proves the child epoch and operation are this generation's.
 * @returns The link, or null while the workhorse is not ready and bound.
 */
function workhorseLink(
	created: Readonly<Partial<CodexWorkbenchComponents>>,
	assertCurrent: CodexWorkbenchComponents["epoch"]["assertCurrent"],
): CoordinatorCallbackLinkCorrelation | null {
	const workhorse = boundWorkhorse(created);
	const bound = created.semanticDelivery?.snapshot().binding ?? null;
	const target = correlatedTarget(bound, workhorse);
	if (workhorse === null || target === null) {
		return null;
	}
	return {
		binding: bound === null ? workhorse.binding : bound.link,
		target: { ...target, provenance: assertCurrent(target).record },
	};
}

/**
 * The workhorse snapshot, when it is ready and has a binding of its own.
 * @param created What the graph has built so far.
 * @returns The snapshot, or null.
 */
function boundWorkhorse(created: Readonly<Partial<CodexWorkbenchComponents>>) {
	const workhorse = created.workhorse?.snapshot();
	if (workhorse?.state !== "ready" || workhorse.binding === null) {
		return null;
	}
	return { ...workhorse, binding: workhorse.binding };
}

/**
 * The thread, child epoch and operation one callback correlates against.
 *
 * One target or the other, never a mixture. A bound target is a thread with the
 * operation that bound it, and the epoch authority checks them together: asked
 * to prove thread B against the operation that bound thread A, it answers
 * mismatched_thread and nothing is delivered at all. So when a pane has bound a
 * thread, every part of the target is that binding's — the relink recorded its
 * own operation for it — and when nothing is bound the whole target is the
 * workhorse's own.
 * @param bound The thread-context binding, or null when nothing is bound.
 * @param workhorse The ready workhorse snapshot, or null.
 * @returns The target, or null while any part of it is unnamed.
 */
function correlatedTarget(
	bound: CodexThreadContextBinding | null,
	workhorse: ReturnType<typeof boundWorkhorse>,
) {
	if (bound !== null) {
		const { threadId, childId, epoch, operationId } = bound.target;
		const target = { threadId, childId, epoch, operationId };
		return allNamed(target) ? target : null;
	}
	if (workhorse === null) {
		return null;
	}
	const target = {
		threadId: workhorse.threadId,
		childId: workhorse.childId,
		epoch: workhorse.epoch,
		operationId: workhorse.operationId,
	};
	return allNamed(target) ? target : null;
}

export { readyCoordinatorThread, readyThreadPair, workhorseLink };
