// The timers and in-flight request behind the reporting reducer. The reducer
// says "start the idle timer"; this is what a timer is.

import type { ChangeReportReply } from "@/ui/canvas/api";
import type {
	ChangeReportingEffect,
	ChangeReportingEvent,
	ChangeReportingState,
	SceneElement,
} from "@/ui/canvas/lib/reporting-state";

/** Which of the three reporting timers. */
type ReportingTimer = "progress" | "idle" | "retry";

/** The mutable runtime the session keeps in a ref. */
interface ReportingRuntime {
	state: ChangeReportingState;
	timers: Record<ReportingTimer, ReturnType<typeof setTimeout> | null>;
	reportPromise: Promise<ChangeReportReply | null> | null;
}

/**
 * A fresh runtime around an initial state.
 * @param state The initial reporting state.
 * @returns The runtime.
 */
function createReportingRuntime(state: ChangeReportingState): ReportingRuntime {
	return { state, timers: { progress: null, idle: null, retry: null }, reportPromise: null };
}

/**
 * Cancel one timer, if armed.
 * @param runtime The runtime.
 * @param which The timer.
 */
function cancelReportingTimer(runtime: ReportingRuntime, which: ReportingTimer): void {
	const timer = runtime.timers[which];
	if (timer !== null) {
		clearTimeout(timer);
	}
	runtime.timers[which] = null;
}

/**
 * Arm one timer, replacing any armed one.
 * @param runtime The runtime.
 * @param which The timer.
 * @param delayMs How long until it fires.
 * @param fired What to run when it fires.
 */
function startReportingTimer(
	runtime: ReportingRuntime,
	which: ReportingTimer,
	delayMs: number,
	fired: () => void,
): void {
	cancelReportingTimer(runtime, which);
	runtime.timers[which] = setTimeout(() => {
		runtime.timers[which] = null;
		fired();
	}, delayMs);
}

const TIMER_OF_EFFECT: Readonly<Record<string, ReportingTimer>> = {
	cancel_progress_timer: "progress",
	start_progress_timer: "progress",
	cancel_idle_timer: "idle",
	start_idle_timer: "idle",
	cancel_retry_timer: "retry",
	start_retry_timer: "retry",
};

/**
 * Which timer a timer effect is about.
 * @param effect The effect.
 * @returns The timer, or null for an effect that is not about a timer.
 */
function timerOfEffect(effect: ChangeReportingEffect): ReportingTimer | null {
	return TIMER_OF_EFFECT[effect.type] ?? null;
}

const FIRED_EVENT: Readonly<
	Record<ReportingTimer, "progress_timer_fired" | "idle_timer_fired" | "retry_timer_fired">
> = {
	progress: "progress_timer_fired",
	idle: "idle_timer_fired",
	retry: "retry_timer_fired",
};

/**
 * The event a timer firing dispatches.
 * @param which The timer.
 * @param generation The generation it was armed in.
 * @param scene The scene as it stands.
 * @param withheldIds Ids under an open editor.
 * @returns The event.
 */
function timerFiredEvent(
	which: ReportingTimer,
	generation: number,
	scene: readonly SceneElement[],
	withheldIds: readonly string[],
): ChangeReportingEvent {
	return { type: FIRED_EVENT[which], generation, scene, withheldIds };
}

export {
	cancelReportingTimer,
	createReportingRuntime,
	startReportingTimer,
	timerFiredEvent,
	timerOfEffect,
	type ReportingRuntime,
	type ReportingTimer,
};
