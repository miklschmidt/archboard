import type {
	BrowserOwnerProjection,
	CodexQueueProjectionInput,
	CodexWorkbenchGatewayOptions,
} from "@/server/codex-workbench";
import type { CodexWorkbenchComponents } from "@/server/archboard/lib/codex-workbench";
import type {
	CodexWorkbenchSessionComponents,
	CodexWorkbenchTabSession,
	CodexWorkbenchTabSessionState,
} from "@/server/archboard/lib/codex-workbench-sessions";
import type { ServerDynamicApprovalOwner } from "@/server/archboard/lib/codex-workbench-approvals";
import type { ServerTimelineOwner } from "@/server/archboard/lib/codex-workbench-timeline";
import { projectServerVoiceContext } from "@/server/archboard/lib/codex-workbench-voice-context";
import {
	projectServerBrowserReadiness,
	type ServerReadinessProcessFacts,
} from "@/server/archboard/lib/codex-workbench-readiness";
import { visibleApprovalViews } from "@/server/archboard/lib/codex-workbench-ordinary-approvals";
import {
	UNAVAILABLE_QUEUE,
	type ServerBrowserBindingState,
} from "@/server/archboard/lib/codex-workbench-browser-state";

/** The tab session owners one projection read is taken from. */
type ProjectionComponents = CodexWorkbenchSessionComponents;

/** What the gateway hands a projection read: the pane, its binding, its lease. */
type ProjectionContext = Parameters<CodexWorkbenchGatewayOptions["projection"]["read"]>[0];

/** One record of a semantic context delivery, as the controller kept it. */
type SemanticDelivery = ReturnType<ProjectionComponents["semanticDelivery"]["inspect"]>[number];

/** The binding a semantic delivery was made under. */
type SemanticBinding = NonNullable<
	ReturnType<ProjectionComponents["semanticDelivery"]["snapshot"]>["binding"]
>;

/** Everything a projection read needs: the pane's tab session and what the generation shares. */
interface ServerOwnerProjectionInput {
	readonly approvals: CodexWorkbenchComponents["approvals"];
	readonly session: Pick<CodexWorkbenchTabSession, "components" | "state">;
	readonly dynamicApprovals: ServerDynamicApprovalOwner;
	readonly state: ServerBrowserBindingState;
	readonly timeline: ServerTimelineOwner;
	/** The live owned-process facts behind every child-lifecycle readiness arm. */
	readonly process: () => ServerReadinessProcessFacts;
}

/**
 * Whether the controller's current binding is the link this pane shows: the
 * same link revision and the same target. Which pane created it does not
 * matter, since every pane of a server shows the one link.
 * @param binding The controller's binding.
 * @param context The pane being read.
 * @returns True when they are the same binding.
 */
function bindingIsForPane(binding: SemanticBinding, context: ProjectionContext): boolean {
	return (
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
 * @returns True when the delivery belongs to the binding.
 */
function deliveryIsForBinding(
	delivery: SemanticDelivery | undefined,
	binding: SemanticBinding,
): boolean {
	return (
		delivery?.paneId === binding.paneId &&
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
 * its result and freshness into a pane's snapshot, and every pane showing that
 * binding's link is shown the same one.
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
	return deliveryIsForBinding(latest, binding) ? latest : undefined;
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
 * @param state The session's cached queue facts.
 * @param context The pane being read.
 * @returns The queue, or the unavailable queue.
 */
function presentedQueue(
	state: Pick<CodexWorkbenchTabSessionState, "queue" | "queueThreadId">,
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
	input: ServerOwnerProjectionInput,
	context: ProjectionContext,
): BrowserOwnerProjection {
	const { dynamicApprovals, state } = input;
	const { components } = input.session;
	if (context.lease?.state === "active") {
		dynamicApprovals.bindLease(context.paneId, context.lease.commandId);
	}
	const coordinator = components.coordinator.snapshot();
	const workhorse = components.workhorse.snapshot();
	const realtimeGeneration = components.realtime.generation();
	const readiness = projectServerBrowserReadiness({
		process: input.process(),
		account: state.account,
		login: state.login,
	});
	return {
		readiness,
		account: state.account,
		login: state.login,
		timeline: input.timeline.read(
			context.paneId,
			context.binding.revision,
			context.binding.link,
			readiness.state === "thread_capable",
			context.connection,
		),
		queue: presentedQueue(input.session.state, context),
		settings: [...workhorseSettings(workhorse), ...coordinatorSettings(coordinator)],
		approvals: visibleApprovalViews(input.approvals),
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
			recording: components.realtime.presentation()?.recording === true,
			coordinatorState: coordinator.state,
			transcript: components.realtime.transcript(),
		},
		spokenApproval: components.spokenApproval.snapshot(),
		voiceContext: projectServerVoiceContext(realtimeGeneration, components.callbacks),
	};
}

export { readBrowserOwnerProjection, type ServerOwnerProjectionInput };
