// The vocabulary of change reporting: what a pane's reporting state holds,
// what can happen to it, and what it asks the runtime to do in return.

import type { RuntimeBoardElement } from "@/shared/board-elements";
import type { Baseline, ChangeReport } from "@/ui/canvas/changes";

type NativeKeys<Element> = Element extends Element ? keyof Element : never;
type NativeValue<Key extends PropertyKey> = RuntimeBoardElement extends infer Element
	? Element extends RuntimeBoardElement
		? Key extends keyof Element
			? Element[Key]
			: never
		: never
	: never;

/** The browser's visible projection of the vendor-derived runtime element. */
type SceneElement = {
	[Key in NativeKeys<RuntimeBoardElement>]?: NativeValue<Key>;
} & Pick<RuntimeBoardElement, "id" | "type">;

/** How a server update moves the baseline once it has been applied. */
type BaselineUpdate =
	| { type: "replace"; withheldIds: readonly string[] }
	| { type: "touch"; elements: readonly SceneElement[] }
	| { type: "delete"; ids: readonly string[] }
	| { type: "none" };

/** One programmatic scene update, local or from the server. */
interface SceneUpdate {
	elements?: readonly SceneElement[];
	appState?: Record<string, unknown>;
	captureUpdate: "never" | "immediately";
}

/** The report on the wire and what it was computed with. */
interface ReportContext {
	report: ChangeReport;
	withheldIds: readonly string[];
	fullReport: boolean;
}

/** A report to begin as soon as a server update has been applied. */
interface ReportAfterServerUpdate {
	withheldIds: readonly string[];
	fullReport: boolean;
}

/** The canonical corrections a report's acknowledgement carries. */
interface ReportCorrections {
	upserts: readonly SceneElement[];
	deletes: readonly string[];
}

/** Everything a pane knows about its unreported edits. */
interface ChangeReportingState {
	baseline: Baseline;
	sceneStamp: string;
	localEditCount: number;
	userInteracted: boolean;
	progressTimerScheduled: boolean;
	progressHasContinuation: boolean;
	progressDeadlineElapsed: boolean;
	idleTimerScheduled: boolean;
	retryTimerScheduled: boolean;
	deliveryQueued: boolean;
	applyingServerUpdateCount: number;
	serverUpdateStamps: readonly string[];
	fullReportNeeded: boolean;
	generation: number;
	inFlightReport: ReportContext | null;
}

/** A timer firing, with the scene as it stands at that moment. */
interface TimerFired {
	generation: number;
	scene: readonly SceneElement[];
	withheldIds: readonly string[];
}

/** What can happen to reporting state. */
type ChangeReportingEvent =
	| { type: "user_interacted" }
	| { type: "scene_changed"; scene: readonly SceneElement[] }
	| { type: "local_update_requested"; update: SceneUpdate }
	| { type: "local_update_applied"; generation: number; scene: readonly SceneElement[] }
	| ({ type: "progress_timer_fired" } & TimerFired)
	| ({ type: "idle_timer_fired" } & TimerFired)
	| ({ type: "retry_timer_fired" } & TimerFired)
	| {
			type: "immediate_report_requested";
			scene: readonly SceneElement[];
			withheldIds: readonly string[];
	  }
	| { type: "server_update_requested"; update: SceneUpdate; baselineUpdate: BaselineUpdate }
	| {
			type: "server_update_applied";
			generation: number;
			scene: readonly SceneElement[];
			baselineUpdate: BaselineUpdate;
			reportAfterUpdate?: ReportAfterServerUpdate;
	  }
	| ({ type: "server_update_finished" } & TimerFired)
	| {
			type: "report_succeeded";
			generation: number;
			corrections: ReportCorrections;
			currentScene: readonly SceneElement[];
	  }
	| { type: "report_refused"; generation: number }
	| { type: "report_failed"; generation: number }
	| { type: "board_adopted" }
	| { type: "reports_cancelled" }
	| { type: "full_report_cleared" }
	| { type: "flush_requested"; scene: readonly SceneElement[] };

/** What the reducer asks its runtime to do. */
type ChangeReportingEffect =
	| { type: "cancel_progress_timer" }
	| { type: "start_progress_timer"; delayMs: number; generation: number }
	| { type: "cancel_idle_timer" }
	| { type: "start_idle_timer"; delayMs: number; generation: number }
	| { type: "cancel_retry_timer" }
	| { type: "start_retry_timer"; delayMs: number; generation: number }
	| { type: "apply_local_update"; generation: number; update: SceneUpdate }
	| {
			type: "apply_server_update";
			generation: number;
			update: SceneUpdate;
			baselineUpdate: BaselineUpdate;
			reportAfterUpdate?: ReportAfterServerUpdate;
	  }
	| { type: "finish_server_update"; generation: number }
	| { type: "send_report"; report: ChangeReport; fullReport: boolean; generation: number }
	| { type: "send_beacon"; report: ChangeReport }
	| { type: "take_hold" }
	| { type: "note_change" }
	| { type: "release_if_idle" }
	| { type: "publish_status" };

/** The reducer's answer: the next state and the effects to run, in order. */
interface ReduceResult {
	state: ChangeReportingState;
	effects: ChangeReportingEffect[];
}

/** No element is withheld. */
const EMPTY_WITHHELD: readonly string[] = [];

/**
 * The state a pane starts in before it has seen a board.
 * @returns A fresh reporting state.
 */
function initialState(): ChangeReportingState {
	return {
		baseline: new Map(),
		sceneStamp: "",
		localEditCount: 0,
		userInteracted: false,
		progressTimerScheduled: false,
		progressHasContinuation: false,
		progressDeadlineElapsed: false,
		idleTimerScheduled: false,
		retryTimerScheduled: false,
		deliveryQueued: false,
		applyingServerUpdateCount: 0,
		serverUpdateStamps: [],
		fullReportNeeded: false,
		generation: 0,
		inFlightReport: null,
	};
}

export {
	EMPTY_WITHHELD,
	initialState,
	type BaselineUpdate,
	type ChangeReportingEffect,
	type ChangeReportingEvent,
	type ChangeReportingState,
	type ReduceResult,
	type ReportAfterServerUpdate,
	type ReportContext,
	type ReportCorrections,
	type SceneElement,
	type SceneUpdate,
	type TimerFired,
};
