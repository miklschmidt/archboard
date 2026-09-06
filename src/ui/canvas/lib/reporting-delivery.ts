// When a report goes out. Two deadlines pull against each other: a fixed
// progress deadline during continuous work and a trailing idle deadline for the
// final dirty state (`src/shared/timing/timing.ts`). Pure; the reducer calls
// these and the session runs the effects they emit.

import { REPORT_IDLE_SETTLE_MS, REPORT_PROGRESS_MS, REPORT_RETRY_MS } from "@/shared/timing/timing";
import {
	diffAgainstBaseline,
	isEmpty,
	type Baseline,
	type ChangeReport,
} from "@/ui/canvas/changes";
import type {
	ChangeReportingEffect,
	ChangeReportingState,
	SceneElement,
	TimerFired,
} from "@/ui/canvas/lib/reporting-state";
import { stampScene } from "@/ui/canvas/lib/scene-stamp";
import { renameTextIds } from "@/ui/canvas/lib/text-ids";

type Effects = ChangeReportingEffect[];

/**
 * Whether the pane has nothing scheduled, in flight or queued.
 * @param state The reporting state.
 * @returns True when every report has been answered and nothing waits.
 */
function reportsSettled(state: ChangeReportingState): boolean {
	return (
		state.inFlightReport === null &&
		!state.progressTimerScheduled &&
		!state.idleTimerScheduled &&
		!state.retryTimerScheduled &&
		!state.deliveryQueued
	);
}

/**
 * Arm the progress deadline: at once when the last one elapsed unused during
 * continuous work, otherwise after `REPORT_PROGRESS_MS`.
 * @param state The reporting state, with no progress timer armed.
 * @param effects Where effects go.
 * @param contentEdit Whether this scheduling follows a content edit.
 * @returns The next state.
 */
function startProgress(
	state: ChangeReportingState,
	effects: Effects,
	contentEdit: boolean,
): ChangeReportingState {
	const overdue = contentEdit && state.progressDeadlineElapsed;
	effects.push({
		type: "start_progress_timer",
		delayMs: overdue ? 0 : REPORT_PROGRESS_MS,
		generation: state.generation,
	});
	return {
		...state,
		progressTimerScheduled: true,
		progressHasContinuation: overdue,
		progressDeadlineElapsed: false,
	};
}

/**
 * Arm the progress deadline when none is armed, or mark that work continues.
 * @param state The reporting state.
 * @param effects Where effects go.
 * @param contentEdit Whether this follows a content edit.
 * @returns The next state.
 */
function armProgress(
	state: ChangeReportingState,
	effects: Effects,
	contentEdit: boolean,
): ChangeReportingState {
	if (!state.progressTimerScheduled && !state.deliveryQueued) {
		return startProgress(state, effects, contentEdit);
	}
	// The progress deadline is deliberately non-restarting. It only delivers
	// while work is continuing; a lone final edit belongs to the idle deadline.
	if (state.progressTimerScheduled && contentEdit) {
		return { ...state, progressHasContinuation: true };
	}
	return state;
}

/**
 * Schedule a delivery: the fixed progress deadline and the trailing idle deadline.
 * @param state The reporting state.
 * @param effects Where effects go.
 * @param contentEdit Whether this follows a content edit.
 * @returns The next state.
 */
function scheduleDelivery(
	state: ChangeReportingState,
	effects: Effects,
	contentEdit: boolean,
): ChangeReportingState {
	const next = armProgress(state, effects, contentEdit);
	if (state.idleTimerScheduled) {
		effects.push({ type: "cancel_idle_timer" });
	}
	effects.push({
		type: "start_idle_timer",
		delayMs: REPORT_IDLE_SETTLE_MS,
		generation: state.generation,
	});
	return { ...next, idleTimerScheduled: true };
}

/**
 * Cancel both delivery deadlines.
 * @param state The reporting state.
 * @param effects Where effects go.
 * @returns The next state.
 */
function cancelDeliveryTimers(state: ChangeReportingState, effects: Effects): ChangeReportingState {
	if (state.progressTimerScheduled) {
		effects.push({ type: "cancel_progress_timer" });
	}
	if (state.idleTimerScheduled) {
		effects.push({ type: "cancel_idle_timer" });
	}
	return {
		...state,
		progressTimerScheduled: false,
		progressHasContinuation: false,
		progressDeadlineElapsed: false,
		idleTimerScheduled: false,
	};
}

/**
 * Cancel every timer, delivery and retry alike.
 * @param state The reporting state.
 * @param effects Where effects go.
 */
function cancelAllTimers(state: ChangeReportingState, effects: Effects): void {
	if (state.progressTimerScheduled) {
		effects.push({ type: "cancel_progress_timer" });
	}
	if (state.idleTimerScheduled) {
		effects.push({ type: "cancel_idle_timer" });
	}
	if (state.retryTimerScheduled) {
		effects.push({ type: "cancel_retry_timer" });
	}
}

/**
 * Rename foreign text ids through a scene update before the report goes out.
 * @param state The reporting state.
 * @param renamedScene The scene with note-safe ids.
 * @param withheldIds Ids under an open editor.
 * @param fullReport Whether the report after the update is a full one.
 * @param effects Where effects go.
 * @returns The next state.
 */
function renameBeforeReport(
	state: ChangeReportingState,
	renamedScene: readonly SceneElement[],
	withheldIds: readonly string[],
	fullReport: boolean,
	effects: Effects,
): ChangeReportingState {
	effects.push({
		type: "apply_server_update",
		generation: state.generation,
		update: { elements: renamedScene, captureUpdate: "never" },
		baselineUpdate: { type: "none" },
		reportAfterUpdate: { withheldIds, fullReport },
	});
	return {
		...state,
		retryTimerScheduled: false,
		applyingServerUpdateCount: state.applyingServerUpdateCount + 1,
	};
}

/**
 * Settle a report that would carry nothing: advance the baseline and release.
 * @param state The reporting state.
 * @param nextBaseline The baseline the empty report established.
 * @param effects Where effects go.
 * @returns The next state.
 */
function settleEmptyReport(
	state: ChangeReportingState,
	nextBaseline: Baseline,
	effects: Effects,
): ChangeReportingState {
	const settled = cancelDeliveryTimers(
		{ ...state, baseline: nextBaseline, retryTimerScheduled: false, deliveryQueued: false },
		effects,
	);
	if (reportsSettled(settled)) {
		effects.push({ type: "release_if_idle" });
	}
	return settled;
}

/**
 * Put a report on the wire.
 * @param state The reporting state.
 * @param report The delta.
 * @param withheldIds Ids under an open editor.
 * @param fullReport Whether it says "this is the whole board".
 * @param effects Where effects go.
 * @returns The next state.
 */
function sendReport(
	state: ChangeReportingState,
	report: ChangeReport,
	withheldIds: readonly string[],
	fullReport: boolean,
	effects: Effects,
): ChangeReportingState {
	effects.push({
		type: "send_report",
		report,
		fullReport,
		generation: state.generation,
		expectVersion: state.noteVersion,
	});
	return {
		...state,
		retryTimerScheduled: false,
		inFlightReport: { report, withheldIds, fullReport },
		progressDeadlineElapsed: false,
		deliveryQueued: false,
	};
}

/**
 * Compute and send the delta, or settle when it is empty.
 * @param state The reporting state.
 * @param scene The live scene.
 * @param withheldIds Ids under an open editor.
 * @param effects Where effects go.
 * @returns The next state.
 */
function reportDelta(
	state: ChangeReportingState,
	scene: readonly SceneElement[],
	withheldIds: readonly string[],
	effects: Effects,
): ChangeReportingState {
	const fullReport = state.fullReportNeeded;
	const report = diffAgainstBaseline(
		scene,
		fullReport ? new Map() : state.baseline,
		new Set(withheldIds),
	);
	if (!fullReport && isEmpty(report)) {
		return settleEmptyReport(state, report.nextBaseline, effects);
	}
	return sendReport(state, report, withheldIds, fullReport, effects);
}

/**
 * Whether a report must wait: one is in flight, or a server update is applying.
 * @param state The reporting state.
 * @param allowWhileApplyingServerUpdate Whether an applying server update may not block.
 * @returns True when the report must be queued.
 */
function reportMustQueue(
	state: ChangeReportingState,
	allowWhileApplyingServerUpdate: boolean,
): boolean {
	const blocked = state.applyingServerUpdateCount > 0 && !allowWhileApplyingServerUpdate;
	return state.inFlightReport !== null || blocked;
}

/**
 * Begin a report, or queue one when a report is in flight or a server update is applying.
 * @param state The reporting state.
 * @param scene The live scene.
 * @param withheldIds Ids under an open editor.
 * @param effects Where effects go.
 * @param allowWhileApplyingServerUpdate Whether an applying server update may not block.
 * @returns The next state.
 */
function beginReport(
	state: ChangeReportingState,
	scene: readonly SceneElement[],
	withheldIds: readonly string[],
	effects: Effects,
	allowWhileApplyingServerUpdate = false,
): ChangeReportingState {
	if (reportMustQueue(state, allowWhileApplyingServerUpdate)) {
		return { ...state, deliveryQueued: true };
	}
	if (state.retryTimerScheduled) {
		effects.push({ type: "cancel_retry_timer" });
	}
	const renamedScene = renameTextIds(scene, withheldIds);
	if (renamedScene) {
		return renameBeforeReport(state, renamedScene, withheldIds, state.fullReportNeeded, effects);
	}
	return reportDelta(state, scene, withheldIds, effects);
}

/**
 * A content edit by the person: take the hold and schedule delivery.
 * @param state The reporting state.
 * @param scene The live scene.
 * @param effects Where effects go.
 * @returns The next state.
 */
function userEdit(
	state: ChangeReportingState,
	scene: readonly SceneElement[],
	effects: Effects,
): ChangeReportingState {
	if (!state.userInteracted) {
		return state;
	}
	const stamp = stampScene(scene);
	if (stamp === state.sceneStamp) {
		return state;
	}
	effects.push({ type: "take_hold" });
	return scheduleDelivery(
		{ ...state, sceneStamp: stamp, localEditCount: state.localEditCount + 1 },
		effects,
		true,
	);
}

/**
 * The progress deadline fired: report only while work continues.
 * @param state The reporting state.
 * @param event The firing.
 * @param effects Where effects go.
 * @returns The next state.
 */
function progressFired(
	state: ChangeReportingState,
	event: TimerFired,
	effects: Effects,
): ChangeReportingState {
	const ready = {
		...state,
		progressTimerScheduled: false,
		progressHasContinuation: false,
		progressDeadlineElapsed: !state.progressHasContinuation,
	};
	return state.progressHasContinuation
		? beginReport(ready, event.scene, event.withheldIds, effects)
		: ready;
}

/**
 * The idle deadline fired: report the final dirty state.
 * @param state The reporting state.
 * @param event The firing.
 * @param effects Where effects go.
 * @returns The next state.
 */
function idleFired(
	state: ChangeReportingState,
	event: TimerFired,
	effects: Effects,
): ChangeReportingState {
	return beginReport(
		{ ...state, idleTimerScheduled: false, progressDeadlineElapsed: false },
		event.scene,
		event.withheldIds,
		effects,
	);
}

/**
 * The retry deadline fired: report again.
 * @param state The reporting state.
 * @param event The firing.
 * @param effects Where effects go.
 * @returns The next state.
 */
function retryFired(
	state: ChangeReportingState,
	event: TimerFired,
	effects: Effects,
): ChangeReportingState {
	return beginReport(
		{ ...state, retryTimerScheduled: false },
		event.scene,
		event.withheldIds,
		effects,
	);
}

/** How a failed report is retried. */
interface RetryPlan {
	delayMs: number;
	/** Whether the retry must say "this is the whole board". */
	fullReport: boolean;
	/** Whether the pane's status should be republished now. */
	publish: boolean;
}

/**
 * A report did not land: schedule a retry.
 * @param state The reporting state.
 * @param effects Where effects go.
 * @param plan How soon, whether the retry is full, and whether to publish status.
 * @returns The next state.
 */
function afterFailedReport(
	state: ChangeReportingState,
	effects: Effects,
	plan: RetryPlan,
): ChangeReportingState {
	if (plan.publish) {
		effects.push({ type: "publish_status" });
	}
	const withoutDeliveryTimers = cancelDeliveryTimers(state, effects);
	effects.push({
		type: "start_retry_timer",
		delayMs: plan.delayMs,
		generation: state.generation,
	});
	return {
		...withoutDeliveryTimers,
		inFlightReport: null,
		fullReportNeeded: plan.fullReport || state.fullReportNeeded,
		retryTimerScheduled: true,
		deliveryQueued: false,
	};
}

/**
 * A report was refused: retry at once, as a full report, and say so (TASK-079).
 * @param state The reporting state.
 * @param effects Where effects go.
 * @returns The next state.
 */
function reportRefused(state: ChangeReportingState, effects: Effects): ChangeReportingState {
	return afterFailedReport(state, effects, { delayMs: 0, fullReport: true, publish: true });
}

/**
 * A report failed on the wire: retry the same delta after `REPORT_RETRY_MS`.
 * @param state The reporting state.
 * @param effects Where effects go.
 * @returns The next state.
 */
function reportFailed(state: ChangeReportingState, effects: Effects): ChangeReportingState {
	return afterFailedReport(state, effects, {
		delayMs: REPORT_RETRY_MS,
		fullReport: false,
		publish: false,
	});
}

export {
	beginReport,
	cancelAllTimers,
	cancelDeliveryTimers,
	idleFired,
	progressFired,
	reportFailed,
	reportRefused,
	reportsSettled,
	retryFired,
	scheduleDelivery,
	userEdit,
};
