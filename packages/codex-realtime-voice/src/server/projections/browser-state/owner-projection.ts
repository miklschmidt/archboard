import { isUnattended, type VoiceNarrativeAdapter } from "#server/services/voice/narrative.ts";
import type {
	BrowserOwnerProjection,
	CodexQueueProjectionInput,
} from "#server/protocol/projection/projection-contract.ts";
import type { CodexWorkbenchGatewayOptions } from "#server/protocol/gateway/contract.ts";
import type { CodexWorkbenchComponents } from "#server/services/generation/workbench.ts";
import type {
	CodexWorkbenchSessionComponents,
	CodexWorkbenchTabSession,
	CodexWorkbenchWorkhorse,
	CodexWorkbenchWorkhorseComponents,
	CodexWorkbenchWorkhorseState,
} from "#server/services/sessions/sessions.ts";
import type { WorkbenchDomainApprovals } from "#server/protocol/projection/domain-approvals.ts";
import type { ServerTimelineOwner, TimelineTarget } from "#server/projections/timeline/timeline.ts";
import { projectServerVoiceContext } from "#server/projections/browser-state/voice-context.ts";
import {
	projectServerBrowserReadiness,
	type ServerReadinessProcessFacts,
} from "#server/rules/generation/readiness.ts";
import { visibleApprovalViews } from "#server/services/actions/ordinary-approvals.ts";
import { readWorkhorseList } from "#server/projections/browser-state/workhorse-list.ts";
import { coordinatorTurnsShownIn } from "#server/services/sessions/delegations.ts";
import {
	UNAVAILABLE_QUEUE,
	type ServerBrowserBindingState,
} from "#server/projections/browser-state/binding-state.ts";

/** The tab session owners one projection read is taken from. */
type ProjectionComponents = CodexWorkbenchSessionComponents;

/** The owners of the workhorse a pane shows. */
type WorkhorseComponents = CodexWorkbenchWorkhorseComponents;

/** What the gateway hands a projection read: the pane, its binding, its lease. */
type ProjectionContext = Parameters<CodexWorkbenchGatewayOptions["projection"]["read"]>[0];

/** One record of a context delivery, as the controller kept it. */
type ContextDelivery = ReturnType<WorkhorseComponents["contextDelivery"]["inspect"]>[number];

/** The binding a context delivery was made under. */
type ContextDeliveryBinding = NonNullable<
	ReturnType<WorkhorseComponents["contextDelivery"]["snapshot"]>["binding"]
>;

/**
 * Everything a projection read needs: the pane's tab session, whose coordinator, voice and
 * approvals it is shown, the workhorse of the shown checkout, and what the generation shares.
 */
interface ServerOwnerProjectionInput {
	readonly approvals: CodexWorkbenchComponents["approvals"];
	readonly session: Pick<CodexWorkbenchTabSession, "components" | "state" | "workhorses">;
	/** The workhorse of the shown checkout, or null while that checkout has none. */
	readonly workhorse: Pick<CodexWorkbenchWorkhorse, "components" | "state"> | null;
	readonly dynamicApprovals: WorkbenchDomainApprovals | null;
	/** The host's narrative adapter, which says whether the live voice session is unattended. */
	readonly narrative?: VoiceNarrativeAdapter;
	readonly state: ServerBrowserBindingState;
	readonly timeline: ServerTimelineOwner;
	/** Reads the voice coordinator's thread, which is not any pane's link. */
	readonly coordinatorTimeline: ServerTimelineOwner;
	/** The live owned-process facts behind every child-lifecycle readiness arm. */
	readonly process: () => ServerReadinessProcessFacts;
	/** The name the workhorse list shows for a checkout. */
	readonly checkoutLabel: (checkout: string) => string;
}

/**
 * Whether the controller's current binding is the link this pane shows: the
 * same link revision and the same target. Which pane created it does not
 * matter, since every pane of a checkout shows its workhorse's one link.
 * @param binding The controller's binding.
 * @param context The pane being read.
 * @returns True when they are the same binding.
 */
function bindingIsForPane(binding: ContextDeliveryBinding, context: ProjectionContext): boolean {
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
	delivery: ContextDelivery | undefined,
	binding: ContextDeliveryBinding,
): boolean {
	return (
		delivery?.linkKey === binding.linkKey &&
		delivery.targetThreadId === binding.target.threadId &&
		delivery.targetChildId === binding.target.childId &&
		delivery.targetEpoch === binding.target.epoch &&
		delivery.targetOperationId === binding.target.operationId
	);
}

/**
 * The context delivery this pane may be shown.
 *
 * Delivery history is process-wide; only the exact current binding may publish
 * its result and freshness into a pane's snapshot, and every pane showing that
 * binding's link is shown the same one.
 * @param components The owners of the pane's workhorse.
 * @param context The pane being read.
 * @returns The delivery, or undefined when none of it is this pane's.
 */
function presentedContextDelivery(
	components: WorkhorseComponents,
	context: ProjectionContext,
): ContextDelivery | undefined {
	const binding = components.contextDelivery.snapshot().binding;
	if (binding === null || !bindingIsForPane(binding, context)) {
		return undefined;
	}
	const latest = components.contextDelivery.inspect().at(-1);
	return deliveryIsForBinding(latest, binding) ? latest : undefined;
}

/**
 * The context delivery panel: the outcome of this pane's own delivery, and the window in which
 * the change it told was fresh.
 * @param delivery This pane's delivery, or undefined when it has none.
 * @returns The panel.
 */
function contextDeliveryPanel(
	delivery: ContextDelivery | undefined,
): BrowserOwnerProjection["contextDelivery"] {
	if (delivery === undefined) {
		return { kind: "codex_context_delivery", outcome: null, freshness: null };
	}
	return {
		kind: "codex_context_delivery",
		outcome: {
			targetThreadId: delivery.targetThreadId,
			outcome: delivery.outcome,
			reason: delivery.reason,
		},
		freshness: delivery.freshness,
	};
}

/**
 * The settings the workhorse was started with, shown only once it has started.
 * @param workhorse The workhorse snapshot.
 * @returns The one settings panel, or none.
 */
function workhorseSettings(
	workhorse: ReturnType<WorkhorseComponents["workhorse"]["snapshot"]>,
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
 * @param state The cached queue facts of the pane's workhorse.
 * @param context The pane being read.
 * @returns The queue, or the unavailable queue.
 */
function presentedQueue(
	state: Pick<CodexWorkbenchWorkhorseState, "queue" | "queueThreadId">,
	context: ProjectionContext,
): CodexQueueProjectionInput {
	if (state.queueThreadId === null || state.queueThreadId !== context.binding.link.threadId) {
		return UNAVAILABLE_QUEUE;
	}
	return state.queue;
}

/**
 * What a pane is shown of the workhorse of its checkout: its settings, its queue and its board
 * news. A checkout no workhorse was started for yet shows none of them.
 * @param workhorse The workhorse, or null while the checkout has none.
 * @param context The pane being read.
 * @returns The workhorse's parts of the projection.
 */
function workhorsePanels(
	workhorse: ServerOwnerProjectionInput["workhorse"],
	context: ProjectionContext,
): Pick<BrowserOwnerProjection, "settings" | "queue" | "contextDelivery"> {
	if (workhorse === null) {
		return {
			settings: [],
			queue: UNAVAILABLE_QUEUE,
			contextDelivery: { kind: "codex_context_delivery", outcome: null, freshness: null },
		};
	}
	const { components, state } = workhorse;
	return {
		settings: workhorseSettings(components.workhorse.snapshot()),
		queue: presentedQueue(state, context),
		contextDelivery: contextDeliveryPanel(presentedContextDelivery(components, context)),
	};
}

/**
 * Where the tab's voice coordinator's turns are read from. The key holds what makes one
 * coordinator's history another's: its thread, and the child epoch it runs on.
 * @param coordinator The tab's coordinator.
 * @param paneId The pane that is shown them.
 * @param threadCapable Whether the workbench can serve threads yet.
 * @returns The target, whose thread is null while the coordinator has none.
 */
function coordinatorTarget(
	coordinator: ReturnType<ProjectionComponents["coordinator"]["snapshot"]>,
	paneId: string,
	threadCapable: boolean,
): TimelineTarget {
	const { threadId, childId, epoch } = coordinator;
	return {
		key: JSON.stringify([paneId, threadId, childId, epoch, threadCapable]),
		threadId,
		childId,
		epoch,
	};
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
		dynamicApprovals?.bindLease(context.tabSessionId, context.paneId, context.lease.commandId);
	}
	const coordinator = components.coordinator.snapshot();
	const owned = workhorsePanels(input.workhorse, context);
	const realtimeGeneration = components.realtime.generation();
	const readiness = projectServerBrowserReadiness({
		process: input.process(),
		account: state.account,
		login: state.login,
	});
	const threadCapable = readiness.state === "thread_capable";
	return {
		readiness,
		account: state.account,
		login: state.login,
		timeline: input.timeline.read(
			context.paneId,
			context.binding.revision,
			context.binding.link,
			threadCapable,
			context.connection,
		),
		coordinatorTimeline: input.coordinatorTimeline.readTarget(
			context.paneId,
			coordinatorTarget(coordinator, context.paneId, threadCapable),
			threadCapable,
			context.connection,
			coordinatorTurnsShownIn(input.session.state.coordinatorTurnHomes, context.checkout),
		),
		delegations: input.session.state.delegations,
		queue: owned.queue,
		settings: [...owned.settings, ...coordinatorSettings(coordinator)],
		approvals: visibleApprovalViews(input.approvals, context.tabSessionId, context.checkout),
		dynamicApprovals: dynamicApprovals?.pending(context.tabSessionId) ?? [],
		contextDelivery: owned.contextDelivery,
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
			unattended: isUnattended(input.narrative, components.realtime.narrative()),
			coordinatorState: coordinator.state,
			transcript: components.realtime.transcript(),
		},
		spokenApproval: components.spokenApproval.snapshot(),
		voiceContext: projectServerVoiceContext(realtimeGeneration, components.callbacks),
		workhorses: readWorkhorseList({
			tabSessionId: context.tabSessionId,
			session: input.session,
			approvals: input.approvals,
			shown: context.checkout,
			checkoutLabel: input.checkoutLabel,
		}),
	};
}

export { readBrowserOwnerProjection, type ServerOwnerProjectionInput };
