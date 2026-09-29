// What the live generation says about itself, read at the moment somebody asks.
//
// Apart from the binding graph because these are questions rather than wiring,
// and because every one of them has the same shape: a component may not be
// ready, and a caller that remembered the answer would be holding an identity
// the generation has since replaced. A coordinator is created, restarted and
// retired inside one workhorse's life, and a new conversation gives the
// workhorse a new thread — so the pair that counts as one session has to be asked for, never
// sampled.

import type { CoordinatorCallbackLinkCorrelation } from "@/runtime/codex-coordinator-callbacks";
import { allNamed } from "@/server/archboard/lib/codex-workbench-generation-owners";
import type { CodexWorkbenchComponents } from "@/server/archboard/lib/codex-workbench";
import type { CodexWorkbenchSessionComponents } from "@/server/archboard/lib/codex-workbench-sessions";

/**
 * The thread the coordinator is ready on. Asked for rather than remembered: it
 * is created, restarted and retired inside one workhorse's life, and the pair is
 * one session, so a sampled value stops recognising its own other half.
 * @param created What the tab session has built so far.
 * @returns The thread, or null while it is not ready.
 */
function readyCoordinatorThread(
	created: Readonly<Partial<CodexWorkbenchSessionComponents>>,
): NonNullable<
	ReturnType<CodexWorkbenchSessionComponents["coordinator"]["snapshot"]>["threadId"]
> | null {
	const coordinator = created.coordinator?.snapshot();
	return coordinator?.state === "ready" ? coordinator.threadId : null;
}

/**
 * The child epoch and the two threads a voice or queue binding is stated
 * against, which exists only while both threads are ready.
 * @param created What the tab session has built so far.
 * @returns The threads, or null.
 */
function readyThreadPair(created: Readonly<Partial<CodexWorkbenchSessionComponents>>): {
	childId: NonNullable<
		ReturnType<CodexWorkbenchSessionComponents["workhorse"]["snapshot"]>["childId"]
	>;
	epoch: NonNullable<ReturnType<CodexWorkbenchSessionComponents["workhorse"]["snapshot"]>["epoch"]>;
	workhorseThreadId: NonNullable<
		ReturnType<CodexWorkbenchSessionComponents["workhorse"]["snapshot"]>["threadId"]
	>;
	coordinatorThreadId: NonNullable<
		ReturnType<CodexWorkbenchSessionComponents["coordinator"]["snapshot"]>["threadId"]
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
 * thread, child epoch and operation it is running. A conversation's board-change
 * delivery is only ever bound to the thread its own workhorse started, so the
 * workhorse's snapshot is the whole target.
 * @param created What the tab session has built so far.
 * @param assertCurrent Proves the child epoch and operation are this generation's.
 * @returns The link, or null while the workhorse is not ready and bound.
 */
function workhorseLink(
	created: Readonly<Partial<CodexWorkbenchSessionComponents>>,
	assertCurrent: CodexWorkbenchComponents["epoch"]["assertCurrent"],
): CoordinatorCallbackLinkCorrelation | null {
	const workhorse = created.workhorse?.snapshot();
	if (workhorse?.state !== "ready" || workhorse.binding === null) {
		return null;
	}
	const target = {
		threadId: workhorse.threadId,
		childId: workhorse.childId,
		epoch: workhorse.epoch,
		operationId: workhorse.operationId,
	};
	if (!allNamed(target)) {
		return null;
	}
	return {
		binding: workhorse.binding,
		target: { ...target, provenance: assertCurrent(target).record },
	};
}

export { readyCoordinatorThread, readyThreadPair, workhorseLink };
