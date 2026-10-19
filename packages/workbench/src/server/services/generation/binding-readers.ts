// What the live generation says about itself, read at the moment somebody asks.
//
// Apart from the binding graph because these are questions rather than wiring,
// and because every one of them has the same shape: a component may not be
// ready, and a caller that remembered the answer would be holding an identity
// the generation has since replaced. A coordinator is created, restarted and
// retired inside one workhorse's life, and a new conversation gives the
// workhorse a new thread — so the pair that counts as one session has to be asked for, never
// sampled.

import type { CoordinatorCallbackLinkCorrelation } from "#runtime/protocol/coordinator-callbacks/contract.ts";
import { allNamed } from "#server/services/generation/owners.ts";
import type { CodexWorkbenchComponents } from "#server/services/generation/workbench.ts";
import type {
	CodexWorkbenchSessionComponents,
	CodexWorkbenchWorkhorse,
	CodexWorkbenchWorkhorseComponents,
} from "#server/services/sessions/sessions.ts";

type CoordinatorSnapshot = ReturnType<CodexWorkbenchSessionComponents["coordinator"]["snapshot"]>;
type WorkhorseSnapshot = ReturnType<CodexWorkbenchWorkhorseComponents["workhorse"]["snapshot"]>;

/**
 * The thread the coordinator is ready on. Asked for rather than remembered: it
 * is created, restarted and retired inside one workhorse's life, and the pair is
 * one session, so a sampled value stops recognising its own other half.
 * @param coordinator The tab session's coordinator, once it is built.
 * @returns The thread, or null while it is not ready.
 */
function readyCoordinatorThread(
	coordinator: CodexWorkbenchSessionComponents["coordinator"] | undefined,
): NonNullable<CoordinatorSnapshot["threadId"]> | null {
	const snapshot = coordinator?.snapshot();
	return snapshot?.state === "ready" ? snapshot.threadId : null;
}

/**
 * The child epoch and the two threads a voice or queue binding is stated
 * against, which exists only while both threads are ready.
 * @param workhorse The workhorse the binding is about, when there is one.
 * @param coordinator The tab session's coordinator, once it is built.
 * @returns The threads, or null.
 */
function readyThreadPair(
	workhorse: CodexWorkbenchWorkhorseComponents["workhorse"] | undefined,
	coordinator: CodexWorkbenchSessionComponents["coordinator"] | undefined,
): {
	childId: NonNullable<WorkhorseSnapshot["childId"]>;
	epoch: NonNullable<WorkhorseSnapshot["epoch"]>;
	workhorseThreadId: NonNullable<WorkhorseSnapshot["threadId"]>;
	coordinatorThreadId: NonNullable<CoordinatorSnapshot["threadId"]>;
} | null {
	const snapshot = workhorse?.snapshot();
	const coordinatorThreadId = readyCoordinatorThread(coordinator);
	if (snapshot?.state !== "ready" || coordinatorThreadId === null) {
		return null;
	}
	const { childId, epoch, threadId } = snapshot;
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
 * The link a callback reports one workhorse against: its binding, the thread, child epoch and
 * operation it is running, and the checkout it works in. A workhorse's board-change delivery is
 * only ever bound to the thread it started, so its snapshot is the whole target.
 * @param workhorse The workhorse.
 * @param assertCurrent Proves the child epoch and operation are this generation's.
 * @returns The link, or null while the workhorse is not ready and bound.
 */
function workhorseLink(
	workhorse: Pick<CodexWorkbenchWorkhorse, "checkout" | "components">,
	assertCurrent: CodexWorkbenchComponents["epoch"]["assertCurrent"],
): CoordinatorCallbackLinkCorrelation | null {
	const snapshot = workhorse.components.workhorse.snapshot();
	if (snapshot.state !== "ready" || snapshot.binding === null) {
		return null;
	}
	const target = {
		threadId: snapshot.threadId,
		childId: snapshot.childId,
		epoch: snapshot.epoch,
		operationId: snapshot.operationId,
	};
	if (!allNamed(target)) {
		return null;
	}
	return {
		binding: snapshot.binding,
		target: { ...target, provenance: assertCurrent(target).record },
		checkout: workhorse.checkout,
	};
}

export { readyCoordinatorThread, readyThreadPair, workhorseLink };
