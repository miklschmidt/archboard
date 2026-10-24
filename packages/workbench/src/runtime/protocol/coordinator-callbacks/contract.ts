export type {
	WorkhorseNewsSource,
	WorkhorseNewsSituation,
	CoordinatorWorkhorseNewsCallback,
	CoordinatorCallbackLinkCorrelation,
	CoordinatorCallbackCorrelation,
	CoordinatorOperationCallback,
	CoordinatorSemanticCallbackData,
	CoordinatorPaneNews,
	CoordinatorCallbackCanvas,
	CoordinatorCallbackContextPort,
	CoordinatorSemanticSubject,
	CoordinatorSemanticCallback,
	CoordinatorCallback,
	CoordinatorCallbackRealtimeGeneration,
	CoordinatorCallbackRealtimeRequest,
	CoordinatorCallbackDeliveryOutcome,
	CoordinatorCallbackMutationResult,
	CoordinatorCallbackRealtimePort,
	CoordinatorCallbackTurnPort,
	CoordinatorCallbackTurnResult,
	CoordinatorCallbackCurrentChild,
	CoordinatorCallbackReadyCoordinator,
	CoordinatorCallbackDeliveryPath,
	CallbackBufferOverflowReason,
	CoordinatorCallbackDeliveryReason,
	CoordinatorCallbackDelivery,
	CoordinatorCallbackHistory,
	CoordinatorCallbackClassification,
} from "@archboard/agent-workbench/runtime";

import type {
	CoordinatorCallbackSource as CoreSource,
	CoordinatorCallbackOptions as CoreOptions,
	CoordinatorCallbacks as CoreCallbacks,
} from "@archboard/agent-workbench/runtime";
import type {
	PaneFocusEvent,
	PaneSelectionEvent,
	SettledSemanticChangeEvent,
	SemanticContextPublisher,
} from "#runtime/schemas/semantic-context-types.ts";
export type SemanticCallbackSource =
	| SettledSemanticChangeEvent
	| PaneFocusEvent
	| PaneSelectionEvent;
export type CoordinatorCallbackSource = CoreSource | SemanticCallbackSource;
export type CoordinatorCallbackOptions = Omit<CoreOptions, "host"> & {
	readonly semantic: Pick<
		SemanticContextPublisher,
		"subscribeSettledChange" | "subscribePaneFocus" | "subscribePaneSelection"
	>;
	readonly canvas: () => import("@archboard/agent-workbench/runtime").CoordinatorCallbackCanvas;
};
export type CoordinatorCallbacks = Omit<CoreCallbacks, "enqueue" | "get"> & {
	readonly enqueue: (event: CoordinatorCallbackSource) => ReturnType<CoreCallbacks["enqueue"]>;
	readonly get: (event: CoordinatorCallbackSource) => ReturnType<CoreCallbacks["get"]>;
};
export interface CoordinatorCallbacksRetainedState {
	current: CoordinatorCallbacks | null;
}
