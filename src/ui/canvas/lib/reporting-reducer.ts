// The reducer: given what happened, what the reporting state becomes and what
// the runtime must do. Pure, so the scheduling contract is tested on a manual
// clock without a browser. Delivery timing lives in `reporting-delivery.ts`;
// this file owns server updates, acknowledgements and the dispatch table.

import { diffAgainstBaseline, isEmpty } from "@/ui/canvas/changes";
import {
	applyBaselineUpdate,
	applyVisibleCorrections,
	baselineAfterCorrections,
	hasPendingEdits,
} from "@/ui/canvas/lib/baseline-merge";
import {
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
} from "@/ui/canvas/lib/reporting-delivery";
import {
	initialState,
	type ChangeReportingEffect,
	type ChangeReportingEvent,
	type ChangeReportingState,
	type ReduceResult,
	type SceneElement,
	type TimerFired,
} from "@/ui/canvas/lib/reporting-state";
import { stampScene } from "@/ui/canvas/lib/scene-stamp";

type Effects = ChangeReportingEffect[];
type EventType = ChangeReportingEvent["type"];
type EventMap = { [Type in EventType]: Extract<ChangeReportingEvent, { type: Type }> };
type Handlers = {
	[Type in EventType]: (
		state: ChangeReportingState,
		event: EventMap[Type],
		effects: Effects,
	) => ChangeReportingState;
};

/**
 * A server update was applied to the scene: move the baseline, and report after it if asked.
 * @param state The reporting state.
 * @param event The application.
 * @param effects Where effects go.
 * @returns The next state.
 */
function serverUpdateApplied(
	state: ChangeReportingState,
	event: EventMap["server_update_applied"],
	effects: Effects,
): ChangeReportingState {
	const next: ChangeReportingState = {
		...state,
		baseline: applyBaselineUpdate(state.baseline, event.baselineUpdate, event.scene),
		serverUpdateStamps: [...state.serverUpdateStamps, stampScene(event.scene)],
	};
	effects.push({ type: "finish_server_update", generation: state.generation });
	return event.reportAfterUpdate
		? beginReport(next, event.scene, event.reportAfterUpdate.withheldIds, effects, true)
		: next;
}

/**
 * Wake reporting for an edit Excalidraw exposed before its onChange callback.
 *
 * If an incoming update records an already-edited scene, the stamp matches and
 * `userEdit` cannot see the transition. The baseline still can: keep that dirty
 * delta reachable without waiting for a second human edit.
 * @param state The reporting state after the update finished.
 * @param event The completion.
 * @param effects Where effects go.
 * @returns The next state.
 */
function wakeHiddenEdit(
	state: ChangeReportingState,
	event: TimerFired,
	effects: Effects,
): ChangeReportingState {
	const next = userEdit(state, event.scene, effects);
	if (!hasPendingEdits(next, event.scene, event.withheldIds) || !reportsSettled(next)) {
		return next;
	}
	effects.push({ type: "take_hold" });
	return scheduleDelivery(
		{ ...next, sceneStamp: stampScene(event.scene), localEditCount: next.localEditCount + 1 },
		effects,
		true,
	);
}

/**
 * A server update finished: drain a queued delivery, or look for hidden edits.
 * @param state The reporting state.
 * @param event The completion.
 * @param effects Where effects go.
 * @returns The next state.
 */
function serverUpdateFinished(
	state: ChangeReportingState,
	event: TimerFired,
	effects: Effects,
): ChangeReportingState {
	const [stamp, ...stamps] = state.serverUpdateStamps;
	const applying = Math.max(0, state.applyingServerUpdateCount - 1);
	const next: ChangeReportingState = {
		...state,
		applyingServerUpdateCount: applying,
		serverUpdateStamps: stamps,
		sceneStamp: stamp ?? stampScene(event.scene),
	};
	if (applying > 0) {
		return next;
	}
	return next.deliveryQueued
		? beginReport(next, event.scene, event.withheldIds, effects)
		: wakeHiddenEdit(next, event, effects);
}

/**
 * Apply visible corrections through a scene update, queuing a report after it when one waits.
 * @param state The reporting state after the report.
 * @param correctedScene The corrected scene.
 * @param queued Whether a delivery was queued behind the report.
 * @param withheldIds The ids the report withheld.
 * @param effects Where effects go.
 * @returns The next state.
 */
function applyCorrections(
	state: ChangeReportingState,
	correctedScene: readonly SceneElement[],
	queued: boolean,
	withheldIds: readonly string[],
	effects: Effects,
): ChangeReportingState {
	effects.push({
		type: "apply_server_update",
		generation: state.generation,
		update: { elements: correctedScene, captureUpdate: "never" },
		baselineUpdate: { type: "none" },
		...(queued ? { reportAfterUpdate: { withheldIds, fullReport: false } } : {}),
	});
	return { ...state, applyingServerUpdateCount: state.applyingServerUpdateCount + 1 };
}

/**
 * Nothing to correct: drain a queued delivery, settle, or keep a stale delta reachable.
 * @param state The reporting state after the report.
 * @param scene The scene as it stands now.
 * @param queued Whether a delivery was queued behind the report.
 * @param withheldIds The ids the report withheld.
 * @param effects Where effects go.
 * @returns The next state.
 */
function afterAcknowledgement(
	state: ChangeReportingState,
	scene: readonly SceneElement[],
	queued: boolean,
	withheldIds: readonly string[],
	effects: Effects,
): ChangeReportingState {
	if (queued) {
		return beginReport(state, scene, withheldIds, effects);
	}
	if (!hasPendingEdits(state, scene, withheldIds)) {
		return cancelDeliveryTimers(state, effects);
	}
	// Excalidraw may have normalized an id after send without a separate
	// content onChange. If that makes a canonical correction stale, keep the
	// visible element and schedule its converging delta explicitly.
	return state.progressTimerScheduled || state.idleTimerScheduled
		? state
		: scheduleDelivery(state, effects, false);
}

/**
 * The server accepted a report: advance the baseline and apply its corrections.
 * @param state The reporting state.
 * @param event The acknowledgement.
 * @param effects Where effects go.
 * @returns The next state.
 */
function reportSucceeded(
	state: ChangeReportingState,
	event: EventMap["report_succeeded"],
	effects: Effects,
): ChangeReportingState {
	const sent = state.inFlightReport;
	if (sent === null) {
		return state;
	}
	const next: ChangeReportingState = {
		...state,
		inFlightReport: null,
		baseline: baselineAfterCorrections(sent.report.nextBaseline, event.corrections),
		fullReportNeeded: sent.fullReport ? false : state.fullReportNeeded,
		deliveryQueued: false,
		noteVersion: event.version,
	};
	const correctedScene = applyVisibleCorrections(
		event.currentScene,
		sent.report.nextBaseline,
		event.corrections,
	);
	const settled = correctedScene
		? applyCorrections(next, correctedScene, state.deliveryQueued, sent.withheldIds, effects)
		: afterAcknowledgement(
				next,
				event.currentScene,
				state.deliveryQueued,
				sent.withheldIds,
				effects,
			);
	effects.push({ type: "note_change" }, { type: "release_if_idle" });
	return settled;
}

/**
 * Cancel everything scheduled, keeping the baseline.
 * @param state The reporting state.
 * @param effects Where effects go.
 * @returns The next state.
 */
function reportsCancelled(state: ChangeReportingState, effects: Effects): ChangeReportingState {
	cancelAllTimers(state, effects);
	return {
		...state,
		progressTimerScheduled: false,
		progressHasContinuation: false,
		progressDeadlineElapsed: false,
		idleTimerScheduled: false,
		retryTimerScheduled: false,
		deliveryQueued: false,
	};
}

/**
 * The person's unwritten edits are withdrawn (ADR 0022): nothing scheduled or
 * in flight speaks for them any more, and the answer to a report still on the
 * wire is not believed. The scene is replaced by the runtime right after this,
 * through the same wholesale path a server frame takes, so the baseline moves
 * with it.
 * @param state The reporting state.
 * @param effects Where effects go.
 * @returns The next state, settled.
 */
function editsWithdrawn(state: ChangeReportingState, effects: Effects): ChangeReportingState {
	const next = reportsCancelled(state, effects);
	effects.push({ type: "publish_status" });
	return { ...next, inFlightReport: null, fullReportNeeded: false };
}

/**
 * The note moved past the version the report stated: the write was refused
 * and the pane reconciles to the note (ADR 0022). The refusal's document is
 * what the runtime replaces the scene with; the version is what the pane
 * states next.
 * @param state The reporting state.
 * @param event The refusal.
 * @param effects Where effects go.
 * @returns The next state.
 */
function reportVersionRefused(
	state: ChangeReportingState,
	event: EventMap["report_version_refused"],
	effects: Effects,
): ChangeReportingState {
	const next = editsWithdrawn(state, effects);
	effects.push({ type: "release_if_idle" });
	return { ...next, noteVersion: event.version };
}

/**
 * The server said which note version the board on screen came from.
 * @param state The reporting state.
 * @param event The version.
 * @returns The state, stating that version on its next write.
 */
function noteVersionLearned(
	state: ChangeReportingState,
	event: EventMap["note_version_learned"],
): ChangeReportingState {
	return state.noteVersion === event.version ? state : { ...state, noteVersion: event.version };
}

/**
 * Another board is on this pane: nothing scheduled for the old one may run.
 * @param state The reporting state.
 * @param effects Where effects go.
 * @returns A fresh state in the next generation.
 */
function boardAdopted(state: ChangeReportingState, effects: Effects): ChangeReportingState {
	cancelAllTimers(state, effects);
	return { ...initialState(), generation: state.generation + 1 };
}

/**
 * Send whatever is pending as a beacon, on the way out.
 * @param state The reporting state.
 * @param event The flush request.
 * @param effects Where effects go.
 * @returns The same state.
 */
function flushRequested(
	state: ChangeReportingState,
	event: EventMap["flush_requested"],
	effects: Effects,
): ChangeReportingState {
	if (!state.userInteracted) {
		return state;
	}
	const report = diffAgainstBaseline(event.scene, state.baseline);
	if (!isEmpty(report)) {
		effects.push({ type: "send_beacon", report, expectVersion: state.noteVersion });
	}
	return state;
}

/**
 * Whether an event belongs to the current board generation.
 * @param state The reporting state.
 * @param event The event.
 * @returns True when the event carries no generation, or the current one.
 */
function isCurrentGeneration(state: ChangeReportingState, event: ChangeReportingEvent): boolean {
	return !("generation" in event) || event.generation === state.generation;
}

/**
 * The person touched the pane.
 * @param state The reporting state.
 * @returns The state, now speaking for the person.
 */
function userInteracted(state: ChangeReportingState): ChangeReportingState {
	return { ...state, userInteracted: true };
}

/**
 * Excalidraw reported a change; only a content edit outside a server update counts.
 * @param state The reporting state.
 * @param event The change.
 * @param effects Where effects go.
 * @returns The next state.
 */
function sceneChanged(
	state: ChangeReportingState,
	event: EventMap["scene_changed"],
	effects: Effects,
): ChangeReportingState {
	return state.applyingServerUpdateCount > 0 ? state : userEdit(state, event.scene, effects);
}

/**
 * The pane asked for a programmatic local edit.
 * @param state The reporting state.
 * @param event The request.
 * @param effects Where effects go.
 * @returns The state, now speaking for the person.
 */
function localUpdateRequested(
	state: ChangeReportingState,
	event: EventMap["local_update_requested"],
	effects: Effects,
): ChangeReportingState {
	effects.push({ type: "apply_local_update", generation: state.generation, update: event.update });
	return { ...state, userInteracted: true };
}

/**
 * A local edit was applied.
 * @param state The reporting state.
 * @param event The application.
 * @param effects Where effects go.
 * @returns The next state.
 */
function localUpdateApplied(
	state: ChangeReportingState,
	event: EventMap["local_update_applied"],
	effects: Effects,
): ChangeReportingState {
	return userEdit(state, event.scene, effects);
}

/**
 * The pane wants to report now.
 * @param state The reporting state.
 * @param event The request.
 * @param effects Where effects go.
 * @returns The next state.
 */
function immediateReportRequested(
	state: ChangeReportingState,
	event: EventMap["immediate_report_requested"],
	effects: Effects,
): ChangeReportingState {
	return beginReport(state, event.scene, event.withheldIds, effects);
}

/**
 * The server's news must reach the scene.
 * @param state The reporting state.
 * @param event The request.
 * @param effects Where effects go.
 * @returns The state, with one more update applying.
 */
function serverUpdateRequested(
	state: ChangeReportingState,
	event: EventMap["server_update_requested"],
	effects: Effects,
): ChangeReportingState {
	effects.push({
		type: "apply_server_update",
		generation: state.generation,
		update: event.update,
		baselineUpdate: event.baselineUpdate,
	});
	return { ...state, applyingServerUpdateCount: state.applyingServerUpdateCount + 1 };
}

/**
 * A hold was recovered without replacing the document.
 * @param state The reporting state.
 * @returns The state, no longer needing a full report.
 */
function fullReportCleared(state: ChangeReportingState): ChangeReportingState {
	return { ...state, fullReportNeeded: false };
}

/**
 * A handler for an event that carries nothing the reducer reads.
 * @param handle The state transition.
 * @returns A handler in the table's shape.
 */
function withoutEvent(
	handle: (state: ChangeReportingState, effects: Effects) => ChangeReportingState,
): (state: ChangeReportingState, event: unknown, effects: Effects) => ChangeReportingState {
	return (state, _event, effects) => handle(state, effects);
}

const HANDLERS: Handlers = {
	user_interacted: userInteracted,
	scene_changed: sceneChanged,
	local_update_requested: localUpdateRequested,
	local_update_applied: localUpdateApplied,
	progress_timer_fired: progressFired,
	idle_timer_fired: idleFired,
	retry_timer_fired: retryFired,
	immediate_report_requested: immediateReportRequested,
	server_update_requested: serverUpdateRequested,
	server_update_applied: serverUpdateApplied,
	server_update_finished: serverUpdateFinished,
	report_succeeded: reportSucceeded,
	report_refused: withoutEvent(reportRefused),
	report_version_refused: reportVersionRefused,
	report_failed: withoutEvent(reportFailed),
	note_version_learned: noteVersionLearned,
	edits_withdrawn: withoutEvent(editsWithdrawn),
	board_adopted: withoutEvent(boardAdopted),
	reports_cancelled: withoutEvent(reportsCancelled),
	full_report_cleared: fullReportCleared,
	flush_requested: flushRequested,
};

/**
 * Run the handler for one event type.
 * @param state The reporting state.
 * @param type The event's type.
 * @param event The event.
 * @param effects Where effects go.
 * @returns The next state.
 */
function dispatch<Type extends EventType>(
	state: ChangeReportingState,
	type: Type,
	event: EventMap[Type],
	effects: Effects,
): ChangeReportingState {
	return HANDLERS[type](state, event, effects);
}

/**
 * What the reporting state becomes, and what the runtime must do.
 * @param state The reporting state.
 * @param event What happened.
 * @returns The next state and the effects to run, in order.
 */
function reduce(state: ChangeReportingState, event: ChangeReportingEvent): ReduceResult {
	const effects: Effects = [];
	if (!isCurrentGeneration(state, event)) {
		return { state, effects };
	}
	return { state: dispatch(state, event.type, event, effects), effects };
}

export { reduce, reportsSettled };
