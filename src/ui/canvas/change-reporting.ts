// What a pane says about a human's edits, and when. The reducer decides; the
// session runs its effects. Public: exactly the contracts the session and its
// tests use at runtime.

export {
	carryWithheld,
	hasPendingEdits,
	mergeIncoming,
	mergeIncomingDeletes,
} from "@/ui/canvas/lib/baseline-merge";
export { reduce, reportsSettled } from "@/ui/canvas/lib/reporting-reducer";
export {
	EMPTY_WITHHELD,
	initialState,
	type BaselineUpdate,
	type ChangeReportingEffect,
	type ChangeReportingEvent,
	type ChangeReportingState,
	type ReportCorrections,
	type SceneElement,
	type SceneUpdate,
} from "@/ui/canvas/lib/reporting-state";
import type { ChangeReportingState } from "@/ui/canvas/lib/reporting-state";

/**
 * Whether the person has touched this pane, so it may speak for them.
 * @param state The reporting state.
 * @returns True once a gesture has been seen.
 */
function userHasInteracted(state: ChangeReportingState): boolean {
	return state.userInteracted;
}

/**
 * Whether the next report must say "this is the whole board" (TASK-079).
 * @param state The reporting state.
 * @returns True after a refusal, until the full report lands.
 */
function needsFullReport(state: ChangeReportingState): boolean {
	return state.fullReportNeeded;
}

export { needsFullReport, userHasInteracted };
