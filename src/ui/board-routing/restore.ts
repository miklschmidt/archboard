// Restoring a workspace one step at a time: the address asks for panes and
// boards, and each step is applied through the commands the shell already
// uses. What to do next is decided here, given what is on screen and what has
// been tried; the hook applies it. A step is remembered once it is applied, so
// a step whose effect did not change the workspace is not tried twice and a
// restore always terminates.

import {
	panesAtRisk,
	planFor,
	planIsEmpty,
	type AddressPlan,
	type WorkspaceAddress,
} from "@/ui/board-routing/address";
import type { NavigationBlock, WorkspacePort } from "@/ui/board-routing/contracts";

/** One thing a restore does next. */
type RestoreStep =
	| { readonly kind: "close"; readonly paneId: string }
	| { readonly kind: "add" }
	| { readonly kind: "open"; readonly paneId: string; readonly boardKey: string }
	| { readonly kind: "focus"; readonly paneId: string };

/**
 * One restore in progress: what was asked for, what has been tried, what could
 * not be reached, and whether it has finished. The three mutable fields are the
 * restore's own record of itself; the workspace it is restoring is React's.
 */
interface RestoreJob {
	readonly wanted: WorkspaceAddress;
	readonly attempted: Set<string>;
	readonly unreachable: string[];
	done: boolean;
}

/**
 * What a restore does now: apply a step, wait for a pane to reach the server,
 * stop because a pane refused, or stop because nothing is left to try.
 */
type RestoreOutcome =
	| { readonly kind: "step"; readonly step: RestoreStep; readonly key: string }
	| { readonly kind: "wait" }
	| { readonly kind: "blocked"; readonly block: NavigationBlock }
	| { readonly kind: "done" };

/**
 * A fresh restore of one address.
 * @param wanted The address to restore.
 * @returns The job.
 */
function restoreOf(wanted: WorkspaceAddress): RestoreJob {
	return { wanted, attempted: new Set(), unreachable: [], done: false };
}

/**
 * The key a step is remembered by, so that a step whose effect did not change
 * the workspace is not applied again.
 * @param step The step.
 * @param displayed What is on screen now.
 * @returns The key.
 */
function stepKey(step: RestoreStep, displayed: WorkspaceAddress): string {
	switch (step.kind) {
		case "close":
			return `close:${step.paneId}`;
		// Which pane the shell opens is the shell's choice, so an add is
		// remembered by the number of panes it was made from.
		case "add":
			return `add:${displayed.panes.length}`;
		case "open":
			return `open:${step.paneId}:${step.boardKey}`;
		default:
			return `focus:${step.paneId}`;
	}
}

/**
 * Everything a plan asks for, in the order it is applied.
 *
 * Panes before boards before focus: a pane that is being closed is not opened
 * on a board first, and a pane that is being added exists before it is pointed
 * anywhere.
 * @param plan What the address asks for.
 * @returns The steps.
 */
function stepsOf(plan: AddressPlan): readonly RestoreStep[] {
	const closes = plan.closes.map((paneId) => ({ kind: "close", paneId }) as const);
	const adds = plan.adds > 0 ? [{ kind: "add" } as const] : [];
	const opens = plan.opens.map((open) => ({ kind: "open", ...open }) as const);
	const focus = plan.focus === null ? [] : [{ kind: "focus", paneId: plan.focus } as const];
	return [...closes, ...adds, ...opens, ...focus];
}

/**
 * The first step of a plan that has not been tried yet.
 * @param plan What the address asks for.
 * @param displayed What is on screen now.
 * @param attempted The keys of the steps already applied.
 * @param ready Whether a pane has reached the server and can be addressed.
 * @returns The step to apply, or whether to wait or stop.
 */
function nextRestoreStep(
	plan: AddressPlan,
	displayed: WorkspaceAddress,
	attempted: ReadonlySet<string>,
	ready: (paneId: string) => boolean,
): RestoreOutcome {
	let waiting = false;
	for (const step of stepsOf(plan)) {
		const key = stepKey(step, displayed);
		if (attempted.has(key)) {
			continue;
		}
		// A pane with no client id has nothing the server can address; the
		// restore waits for its socket rather than opening into the wrong pane.
		if (step.kind === "open" && !ready(step.paneId)) {
			waiting = true;
			continue;
		}
		return { kind: "step", step, key };
	}
	return waiting ? { kind: "wait" } : { kind: "done" };
}

/**
 * What the restore does now.
 *
 * Every pane the remaining plan would close or move is preflighted before each
 * step, so a restore never half-applies over a canvas holding work the note
 * has not got.
 * @param job The restore in progress.
 * @param displayed What is on screen now.
 * @param port The workspace.
 * @returns The outcome.
 */
function restoreOutcome(
	job: RestoreJob,
	displayed: WorkspaceAddress,
	port: WorkspacePort,
): RestoreOutcome {
	const plan = planFor(displayed, job.wanted);
	if (planIsEmpty(plan)) {
		return { kind: "done" };
	}
	const verdict = port.guard(panesAtRisk(plan));
	if (verdict.kind !== "clear") {
		return { kind: "blocked", block: verdict };
	}
	return nextRestoreStep(plan, displayed, job.attempted, port.ready);
}

/**
 * Say how a restore ended, when there is anything to say. A blocked one names
 * the pane that refused; a finished one names the boards it could not reach,
 * which the address is about to be corrected to leave out.
 * @param port The workspace.
 * @param job The restore that ended.
 * @param outcome How it ended.
 */
function reportRestoreEnd(port: WorkspacePort, job: RestoreJob, outcome: RestoreOutcome): void {
	if (outcome.kind === "blocked") {
		port.reportBlocked(outcome.block);
		return;
	}
	if (job.unreachable.length > 0) {
		port.reportUnreachable(job.unreachable);
	}
}

/**
 * Take a restore one step further, marking it finished when there is nothing
 * left to try and saying so when it ended without getting there.
 * @param job The restore in progress.
 * @param displayed What is on screen now.
 * @param port The workspace.
 * @param apply Applies one step.
 * @returns True while the restore is still running, so the address is not
 *   written over it yet.
 */
function advanceRestore(
	job: RestoreJob,
	displayed: WorkspaceAddress,
	port: WorkspacePort,
	apply: (step: RestoreStep) => void,
): boolean {
	const outcome = restoreOutcome(job, displayed, port);
	if (outcome.kind === "wait") {
		return true;
	}
	if (outcome.kind === "step") {
		job.attempted.add(outcome.key);
		apply(outcome.step);
		return true;
	}
	job.done = true;
	reportRestoreEnd(port, job, outcome);
	return false;
}

export {
	advanceRestore,
	nextRestoreStep,
	reportRestoreEnd,
	restoreOf,
	restoreOutcome,
	stepKey,
	type RestoreJob,
	type RestoreOutcome,
	type RestoreStep,
};
