// The runtime view: whether the workhorse takes direct input, why not, and
// the projected turns. Read-only states keep the history for inspection;
// only a connected, thread-capable, executable link is executable.

import type { BrowserSnapshot, BrowserTimeline } from "@/shared/codex-browser-model";
import {
	failureProjection,
	projectTimelineTurns,
	type WorkbenchTurnProjection,
} from "@/ui/workbench-timeline";
import type { BrowserWorkbenchState } from "@/ui/workbench-transport";

/** Why a history is read-only, when the transport state alone does not say. */
type ReadonlyWorkbenchSource =
	| "coordinator"
	| "inspect_only"
	| "prior_epoch"
	| "reconnecting"
	| "stale"
	| "runtime_failure";

type ReadonlyWorkbenchState =
	| ReadonlyWorkbenchSource
	| Exclude<BrowserWorkbenchState["state"], "stale_snapshot" | "thread_capable">
	| "unavailable";

/** What the runtime shows: executable, or read-only with a reason. */
type WorkbenchRuntimeView =
	| {
			readonly mode: "executable";
			readonly state: "ready";
			readonly reason: null;
			readonly turns: readonly WorkbenchTurnProjection[];
	  }
	| {
			readonly mode: "readonly";
			readonly state: ReadonlyWorkbenchState;
			readonly reason: string;
			readonly turns: readonly WorkbenchTurnProjection[];
	  };

type ReadonlyView = Extract<WorkbenchRuntimeView, { readonly mode: "readonly" }>;

/** The status a person reads or hears beside the thread. */
interface WorkbenchVisibleStatus {
	readonly role: "status";
	readonly label: "Codex workbench status";
	readonly state:
		| WorkbenchRuntimeView["state"]
		| "delivered"
		| "queued"
		| "not_delivered"
		| "outcome_unknown";
	readonly message: string;
	readonly recovery: string | null;
}

const RECOVERIES: Readonly<Record<ReadonlyWorkbenchState, string>> = {
	reconnecting: "Wait for Codex to reconnect. This history remains available for inspection.",
	backoff: "Wait until Codex retries, or restart the Codex workbench.",
	stopped: "Restart the Codex workbench, then retry.",
	incompatible_contract: "Update Archboard or Codex so their workbench protocol versions match.",
	stale: "Wait for a fresh Codex snapshot before sending another command.",
	runtime_failure: "Inspect the reported item, then reconnect or reload the workbench.",
	storage_mismatch: "Correct the Codex storage configuration, then restart the workbench.",
	login_capable: "Sign in to Codex before selecting an executable workhorse.",
	signed_out: "Sign in to Codex before selecting an executable workhorse.",
	login_pending: "Complete or cancel the pending Codex sign-in before continuing.",
	initialized: "Wait for Codex to finish preparing a thread-capable workhorse.",
	account_ready: "Wait for Codex to finish preparing a thread-capable workhorse.",
	coordinator: "Inspect this history or select a current executable workhorse.",
	inspect_only: "Inspect this history or select a current executable workhorse.",
	prior_epoch: "Inspect this history or select a current executable workhorse.",
	unavailable: "Reconnect the Codex workbench, then select an executable workhorse.",
};

/**
 * The next action for a read-only state.
 * @param state The state.
 * @returns The words.
 */
function readonlyRecovery(state: ReadonlyWorkbenchState): string {
	return RECOVERIES[state];
}

/**
 * A read-only view.
 * @param state The state.
 * @param reason The words.
 * @param turns The projected turns.
 * @returns The view.
 */
function readonlyView(
	state: ReadonlyWorkbenchState,
	reason: string,
	turns: readonly WorkbenchTurnProjection[],
): ReadonlyView {
	return { mode: "readonly", state, reason, turns };
}

/**
 * The words an error carries.
 * @param error The error.
 * @returns The message.
 */
function failureReason(error: unknown): string {
	return error instanceof Error ? error.message : "The Codex history could not be mapped.";
}

/**
 * Project a timeline, or fall into a visible runtime failure.
 * @param timeline The timeline, or null.
 * @param onSuccess How a successful projection becomes a view.
 * @returns The view.
 */
function projected(
	timeline: BrowserTimeline | null,
	onSuccess: (turns: readonly WorkbenchTurnProjection[]) => WorkbenchRuntimeView,
): WorkbenchRuntimeView {
	if (timeline === null) {
		return onSuccess([]);
	}
	try {
		return onSuccess(projectTimelineTurns(timeline));
	} catch (error) {
		const reason = failureReason(error);
		return readonlyView("runtime_failure", reason, [failureProjection(timeline.threadId, reason)]);
	}
}

/**
 * A read-only view of a history the transport does not own: the coordinator's
 * transcript, a prior epoch, or an inspect-only thread.
 * @param timeline The timeline, or null.
 * @param source Why it is read-only.
 * @param reason The words.
 * @returns The view.
 */
function createReadonlyWorkbenchView(
	timeline: BrowserTimeline | null,
	source: ReadonlyWorkbenchSource,
	reason: string,
): WorkbenchRuntimeView {
	return projected(timeline, (turns) => readonlyView(source, reason, turns));
}

/**
 * The words for a readiness that is not thread-capable.
 * @param snapshot The snapshot.
 * @param state The readiness state.
 * @returns The reason.
 */
function readinessReason(snapshot: BrowserSnapshot, state: string): string {
	return "reason" in snapshot.readiness
		? snapshot.readiness.reason
		: `Codex is ${state.replaceAll("_", " ")}; direct workhorse input is unavailable.`;
}

/**
 * The view of a published readiness state.
 * @param state The transport state.
 * @param snapshot The snapshot it carries.
 * @returns The view.
 */
function readinessView(
	state: Extract<BrowserWorkbenchState, { readonly kind: "readiness" }>,
	snapshot: BrowserSnapshot,
): WorkbenchRuntimeView {
	if (snapshot.threadLink.state !== "executable") {
		const reason = snapshot.threadLink.reason ?? "This Codex history is inspect-only.";
		return projected(snapshot.timeline, (turns) => readonlyView("inspect_only", reason, turns));
	}
	const readiness = state.state;
	if (readiness !== "thread_capable") {
		const reason = readinessReason(snapshot, readiness);
		return projected(snapshot.timeline, (turns) => readonlyView(readiness, reason, turns));
	}
	// History arrives independently of the executable link. Its absence cannot
	// revoke the input authority already confirmed for this thread.
	return projected(snapshot.timeline, (turns) => ({
		mode: "executable",
		state: "ready",
		reason: null,
		turns,
	}));
}

/**
 * The read-only state a connection or stream state maps to.
 * @param state The transport state.
 * @returns The read-only state and its reason.
 */
function connectionView(
	state: Exclude<BrowserWorkbenchState, { readonly kind: "readiness" }>,
): WorkbenchRuntimeView {
	const readonlyState: ReadonlyWorkbenchState =
		state.state === "stale_snapshot" ? "stale" : state.state;
	return projected(state.snapshot?.timeline ?? null, (turns) =>
		readonlyView(readonlyState, state.reason, turns),
	);
}

/**
 * The runtime view of a transport state.
 * @param state The transport state.
 * @returns The view.
 */
function projectWorkbenchRuntime(state: BrowserWorkbenchState): WorkbenchRuntimeView {
	if (state.kind !== "readiness") {
		return connectionView(state);
	}
	return readinessView(state, state.snapshot);
}

/**
 * The status of a read-only view.
 * @param view The view.
 * @returns The status.
 */
function readonlyStatus(view: ReadonlyView): WorkbenchVisibleStatus {
	return {
		role: "status",
		label: "Codex workbench status",
		state: view.state,
		message: view.reason,
		recovery: readonlyRecovery(view.state),
	};
}

/**
 * The status of an executable view before anything was sent.
 * @returns The status.
 */
function readyStatus(): WorkbenchVisibleStatus {
	return {
		role: "status",
		label: "Codex workbench status",
		state: "ready",
		message: "The current Codex workhorse is ready.",
		recovery: null,
	};
}

export {
	createReadonlyWorkbenchView,
	projectWorkbenchRuntime,
	readonlyRecovery,
	readonlyStatus,
	readyStatus,
	type ReadonlyWorkbenchSource,
	type ReadonlyWorkbenchState,
	type WorkbenchRuntimeView,
	type WorkbenchVisibleStatus,
};
