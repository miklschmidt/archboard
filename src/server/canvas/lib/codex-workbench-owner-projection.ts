import type {
	BrowserOwnerProjection,
	CodexQueueProjectionInput,
	CodexWorkbenchGatewayOptions,
} from "@/server/codex-workbench";
import type { CodexWorkbenchComponents } from "@/server/canvas/lib/codex-workbench";
import type { CanvasDynamicApprovalOwner } from "@/server/canvas/lib/codex-workbench-approvals";
import type { CanvasTimelineOwner } from "@/server/canvas/lib/codex-workbench-timeline";
import { projectCanvasVoiceContext } from "@/server/canvas/lib/codex-workbench-voice-context";
import {
	projectCanvasBrowserReadiness,
	type CanvasReadinessProcessFacts,
} from "@/server/canvas/lib/codex-workbench-readiness";
import { visibleApprovalViews } from "@/server/canvas/lib/codex-workbench-ordinary-approvals";
import {
	UNAVAILABLE_QUEUE,
	type CanvasBrowserBindingState,
} from "@/server/canvas/lib/codex-workbench-browser-state";

/** The runtime owners one projection read is taken from. */
type ProjectionComponents = Omit<CodexWorkbenchComponents, "gateway">;

/** What the gateway hands a projection read: the pane, its binding, its lease. */
type ProjectionContext = Parameters<CodexWorkbenchGatewayOptions["projection"]["read"]>[0];

/** One record of a semantic context delivery, as the controller kept it. */
type SemanticDelivery = ReturnType<ProjectionComponents["semanticDelivery"]["inspect"]>[number];

/** The binding a semantic delivery was made under. */
type SemanticBinding = NonNullable<
	ReturnType<ProjectionComponents["semanticDelivery"]["snapshot"]>["binding"]
>;

/** Everything a projection read needs beyond the components themselves. */
interface CanvasOwnerProjectionInput {
	readonly components: ProjectionComponents;
	readonly dynamicApprovals: CanvasDynamicApprovalOwner;
	readonly state: CanvasBrowserBindingState;
	readonly candidates: { readonly read: () => BrowserOwnerProjection["threadCandidates"] };
	readonly timeline: CanvasTimelineOwner;
	/** The live owned-process facts behind every child-lifecycle readiness arm. */
	readonly process: () => CanvasReadinessProcessFacts;
}

/**
 * Whether the controller's current binding is this pane's exact one: the same
 * pane, the same link revision, and the same target.
 * @param binding The controller's binding.
 * @param context The pane being read.
 * @returns True when they are the same binding.
 */
function bindingIsForPane(binding: SemanticBinding, context: ProjectionContext): boolean {
	return (
		binding.paneId === context.paneId &&
		binding.link.revision === context.binding.revision &&
		binding.target.threadId === context.binding.link.threadId &&
		binding.target.childId === context.binding.link.childId &&
		binding.target.epoch === context.binding.link.epoch
	);
}

/**
 * Whether one delivery was the one made under this binding, rather than an
 * earlier delivery left in the process-wide history.
 * @param delivery The most recent delivery, or undefined when there is none.
 * @param binding The binding.
 * @param paneId The pane.
 * @returns True when the delivery belongs to the binding.
 */
function deliveryIsForBinding(
	delivery: SemanticDelivery | undefined,
	binding: SemanticBinding,
	paneId: string,
): boolean {
	return (
		delivery?.paneId === paneId &&
		delivery.targetThreadId === binding.target.threadId &&
		delivery.targetChildId === binding.target.childId &&
		delivery.targetEpoch === binding.target.epoch &&
		delivery.targetOperationId === binding.target.operationId
	);
}

/**
 * The semantic delivery this pane may be shown.
 *
 * Delivery history is process-wide; only the exact current binding may publish
 * its result and freshness into this pane's snapshot.
 * @param components The runtime owners.
 * @param context The pane being read.
 * @returns The delivery, or undefined when none of it is this pane's.
 */
function presentedSemantic(
	components: ProjectionComponents,
	context: ProjectionContext,
): SemanticDelivery | undefined {
	const binding = components.semanticDelivery.snapshot().binding;
	if (binding === null || !bindingIsForPane(binding, context)) {
		return undefined;
	}
	const latest = components.semanticDelivery.inspect().at(-1);
	return deliveryIsForBinding(latest, binding, context.paneId) ? latest : undefined;
}

/**
 * The semantic panel: the outcome of this pane's own delivery, and how fresh
 * the brief behind it is.
 * @param delivery This pane's delivery, or undefined when it has none.
 * @param publisher What knows the brief's freshness.
 * @returns The panel.
 */
function semanticPanel(
	delivery: SemanticDelivery | undefined,
	publisher: ProjectionComponents["semanticPublisher"],
): BrowserOwnerProjection["semantic"] {
	if (delivery === undefined) {
		return { kind: "codex_semantic", outcome: null, freshness: null };
	}
	return {
		kind: "codex_semantic",
		outcome: {
			targetThreadId: delivery.targetThreadId,
			outcome: delivery.outcome,
			reason: delivery.reason,
		},
		freshness: publisher.freshBrief().freshness,
	};
}

/**
 * The settings the workhorse was started with, shown only once it has started.
 * @param workhorse The workhorse snapshot.
 * @returns The one settings panel, or none.
 */
function workhorseSettings(
	workhorse: ReturnType<ProjectionComponents["workhorse"]["snapshot"]>,
): BrowserOwnerProjection["settings"] {
	const start = workhorse.start;
	if (start === null) {
		return [];
	}
	return [
		{
			kind: "codex_thread_settings",
			owner: "workhorse",
			settings: {
				model: start.model,
				effort: null,
				serviceTier: start.serviceTier,
				approvalPolicy: start.approvalPolicy,
				approvalsReviewer: start.approvalsReviewer,
				sandboxPolicy: start.sandbox,
				activePermissionProfile: start.activePermissionProfile,
			},
		},
	];
}

/**
 * The coordinator's settings, shown only once every one of them is known: a
 * half-known panel would present a default as the agent's actual policy.
 * @param coordinator The coordinator snapshot.
 * @returns The one settings panel, or none.
 */
function coordinatorSettings(
	coordinator: ReturnType<ProjectionComponents["coordinator"]["snapshot"]>,
): BrowserOwnerProjection["settings"] {
	const { effective, approvalPolicy, approvalsReviewer, sandboxPolicy } = coordinator;
	if (
		effective === null ||
		approvalPolicy === null ||
		approvalsReviewer === null ||
		sandboxPolicy === null
	) {
		return [];
	}
	return [
		{
			kind: "codex_thread_settings",
			owner: "coordinator",
			settings: {
				model: effective.model,
				effort: effective.effort,
				serviceTier: effective.serviceTier,
				approvalPolicy,
				approvalsReviewer,
				sandboxPolicy,
				activePermissionProfile: coordinator.activePermissionProfile,
			},
		},
	];
}

/**
 * The queue this pane may be shown.
 *
 * Cached submissions belong to one workhorse thread; a pane looking at another
 * link is told the queue is unavailable, never shown the wrong one.
 * @param state The cached account and queue facts.
 * @param context The pane being read.
 * @returns The queue, or the unavailable queue.
 */
function presentedQueue(
	state: CanvasBrowserBindingState,
	context: ProjectionContext,
): CodexQueueProjectionInput {
	if (state.queueThreadId === null || state.queueThreadId !== context.binding.link.threadId) {
		return UNAVAILABLE_QUEUE;
	}
	return state.queue;
}

/**
 * One complete snapshot of the workbench as one pane is shown it, read from
 * the live owners rather than from anything the adapter stored.
 * @param input The owners, the cached facts, and the pane-side owners.
 * @param context The pane, its binding, and its lease.
 * @returns The projection.
 */
function readBrowserOwnerProjection(
	input: CanvasOwnerProjectionInput,
	context: ProjectionContext,
): BrowserOwnerProjection {
	const { components, dynamicApprovals, state } = input;
	if (context.lease?.state === "active") {
		dynamicApprovals.bindLease(context.paneId, context.lease.commandId);
	}
	const coordinator = components.coordinator.snapshot();
	const workhorse = components.workhorse.snapshot();
	const realtimeGeneration = components.realtime.generation();
	const readiness = projectCanvasBrowserReadiness({
		process: input.process(),
		account: state.account,
		login: state.login,
		coordinatorReady: coordinator.state === "ready",
	});
	return {
		readiness,
		account: state.account,
		login: state.login,
		threadCandidates: input.candidates.read(),
		timeline: input.timeline.read(
			context.paneId,
			context.binding.revision,
			context.binding.link,
			readiness.state === "thread_capable",
			context.connection,
		),
		queue: presentedQueue(state, context),
		settings: [...workhorseSettings(workhorse), ...coordinatorSettings(coordinator)],
		approvals: visibleApprovalViews(components.approvals),
		dynamicApprovals: dynamicApprovals.pending(),
		semantic: semanticPanel(presentedSemantic(components, context), components.semanticPublisher),
		coordinator: {
			kind: "codex_coordinator",
			state: coordinator.state,
			threadId: coordinator.threadId,
			configured: coordinator.configured,
			effective: coordinator.effective,
			reason: coordinator.reason,
		},
		voice: {
			kind: "codex_voice",
			mediaReady: context.mediaReady,
			generation: realtimeGeneration,
			coordinatorState: coordinator.state,
			transcript: components.realtime.transcript(),
		},
		spokenApproval: components.spokenApproval.snapshot(),
		voiceContext: projectCanvasVoiceContext(realtimeGeneration, components.callbacks),
	};
}

export { readBrowserOwnerProjection, type CanvasOwnerProjectionInput };
