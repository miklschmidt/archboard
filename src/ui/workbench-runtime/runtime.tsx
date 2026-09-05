// The one authoritative Codex runtime for the workbench: the assistant-ui
// external-store adapter over the transport's published state, the
// `WorkbenchView` projection and the `WorkbenchActions` implementation the
// presentation consumes. The provider wraps its renderer in the assistant-ui
// runtime provider; the renderer receives the view, the actions and the
// visible status.

import {
	AssistantRuntimeProvider,
	MessageNotSentError,
	useExternalStoreRuntime,
} from "@assistant-ui/react";
import type { AppendMessage, AssistantRuntime } from "@assistant-ui/react";
import {
	createElement,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from "react";
import type { ComponentType, ReactNode } from "react";

import type { WorkbenchActions, WorkbenchView, WorkbenchVoiceView } from "@/ui/workbench/contracts";
import { activeTurnId as activeTurnOf } from "@/ui/workbench/session-projection";
import {
	createWorkbenchComposerController,
	type WorkbenchComposerController,
	type WorkbenchComposerDelivery,
	type WorkbenchComposerSubmissionResult,
} from "@/ui/workbench-composer";
import {
	createWorkbenchActions,
	type WorkbenchRuntimeHost,
} from "@/ui/workbench-runtime/lib/actions";
import { toThreadMessageLike } from "@/ui/workbench-runtime/lib/messages";
import { sessionView } from "@/ui/workbench-runtime/lib/session-view";
import {
	createWorkbenchRuntimeStore,
	type WorkbenchRuntimeLocalState,
	type WorkbenchRuntimeStore,
} from "@/ui/workbench-runtime/lib/store";
import {
	projectWorkbenchRuntime,
	readonlyStatus,
	type WorkbenchRuntimeView,
	type WorkbenchVisibleStatus,
} from "@/ui/workbench-runtime/lib/view";
import type { WorkbenchTurnProjection } from "@/ui/workbench-timeline";
import type { BrowserWorkbenchState, BrowserWorkbenchTransport } from "@/ui/workbench-transport";

/** What the renderer receives. */
interface WorkbenchRuntimeRenderContext {
	readonly view: WorkbenchView;
	readonly actions: WorkbenchActions;
	readonly runtimeView: WorkbenchRuntimeView;
	readonly status: WorkbenchVisibleStatus;
	readonly assistantRuntime: AssistantRuntime;
}

type WorkbenchRuntimeRenderer = ComponentType<WorkbenchRuntimeRenderContext>;

/** What the hook needs beyond the transport. */
interface WorkbenchRuntimeOptions {
	readonly host: WorkbenchRuntimeHost;
	/** The live voice view; unavailable when the host has no voice. */
	readonly voice?: WorkbenchVoiceView;
	readonly reducedMotion?: boolean;
	readonly now?: () => number;
}

/** The provider's inputs: the transport, the options, and the renderer. */
interface WorkbenchRuntimeProviderProps extends WorkbenchRuntimeOptions {
	readonly transport: BrowserWorkbenchTransport;
	readonly render: WorkbenchRuntimeRenderer;
}

/** What the hook returns. */
interface WorkbenchRuntimeHandle {
	readonly runtime: AssistantRuntime;
	readonly view: WorkbenchView;
	readonly actions: WorkbenchActions;
	readonly runtimeView: WorkbenchRuntimeView;
	readonly status: WorkbenchVisibleStatus;
}

const NO_VOICE: WorkbenchVoiceView = {
	controls: {
		available: false,
		sessionState: "unavailable",
		muted: false,
		pending: false,
		failure: null,
	},
	wave: { state: "inactive", level: 0 },
};

/**
 * The text of a user submission, or null when it is not plain text.
 * @param message The appended message.
 * @returns The text, or null.
 */
function submissionText(message: AppendMessage): string | null {
	if (message.role !== "user") {
		return null;
	}
	const parts = message.content.map((part) => (part.type === "text" ? part.text : null));
	if (parts.some((part) => part === null)) {
		return null;
	}
	const text = parts.join("");
	return text.length === 0 ? null : text;
}

/**
 * The delivery a submission uses: queued when chosen, steer while a turn runs
 * and the person left the toggle there, send otherwise.
 * @param local The runtime's local state.
 * @param running Whether a turn is running.
 * @returns The delivery.
 */
function deliveryFor(
	local: WorkbenchRuntimeLocalState,
	running: boolean,
): WorkbenchComposerDelivery {
	if (local.queueInstead) {
		return "queue";
	}
	return running && local.intent === "steer" ? "steer" : "send";
}

/**
 * A visible status.
 * @param state The state.
 * @param message The words.
 * @param recovery The next action, or null.
 * @returns The status.
 */
function status(
	state: WorkbenchVisibleStatus["state"],
	message: string,
	recovery: string | null,
): WorkbenchVisibleStatus {
	return { role: "status", label: "Codex workbench status", state, message, recovery };
}

/**
 * The status a settled submission publishes, and whether the runtime keeps
 * the draft by throwing.
 * @param result The composer's result.
 * @param turnKnown Whether a delivered turn has appeared in the authoritative timeline.
 * @returns The status.
 */
function submissionStatus(
	result: WorkbenchComposerSubmissionResult,
	turnKnown: boolean,
): WorkbenchVisibleStatus {
	switch (result.outcome) {
		case "not_delivered":
			return status(
				"not_delivered",
				result.reason,
				"The draft was restored. Correct the problem and send it again.",
			);
		case "outcome_unknown":
			return status(
				"outcome_unknown",
				result.reason,
				"Inspect the current workhorse before deciding whether to send again.",
			);
		case "queued":
			return status("queued", "Codex parked the message in the thread queue.", null);
		default:
			return turnKnown
				? status(
						"delivered",
						"Codex accepted the submission and published its authoritative turn.",
						null,
					)
				: status(
						"outcome_unknown",
						"Codex reported delivery, but the authoritative turn has not appeared.",
						"Inspect the current workhorse before deciding whether to send again.",
					);
	}
}

/**
 * Whether a turn is in the transport's authoritative timeline.
 * @param transport The transport.
 * @param turnId The turn.
 * @returns True when published.
 */
function turnIsAuthoritative(transport: BrowserWorkbenchTransport, turnId: string): boolean {
	return transport.snapshot()?.timeline?.turns.some((turn) => turn.turnId === turnId) ?? false;
}

/**
 * The status of the whole runtime: a read-only reason wins over the last
 * submission's status.
 * @param runtimeView The runtime view.
 * @param local The runtime's local state.
 * @returns The status.
 */
function visibleStatus(
	runtimeView: WorkbenchRuntimeView,
	local: WorkbenchRuntimeLocalState,
): WorkbenchVisibleStatus {
	return runtimeView.mode === "readonly" ? readonlyStatus(runtimeView) : local.status;
}

/** The per-transport owners the hook keeps for one transport generation. */
interface TransportOwners {
	readonly transport: BrowserWorkbenchTransport;
	readonly composer: WorkbenchComposerController;
	readonly store: WorkbenchRuntimeStore;
}

/**
 * Subscribe to the transport's published state.
 * @param transport The transport.
 * @returns The state.
 */
function useTransportState(transport: BrowserWorkbenchTransport): BrowserWorkbenchState {
	return useSyncExternalStore(transport.subscribe, transport.state, transport.state);
}

/**
 * Subscribe to the runtime's local state.
 * @param store The store.
 * @returns The local state.
 */
function useLocalState(store: WorkbenchRuntimeStore): WorkbenchRuntimeLocalState {
	return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/**
 * The composer submission handler for one transport generation. A settlement
 * that arrives after the transport was replaced or the hook unmounted is
 * dropped: it belongs to a workbench that is no longer shown.
 * @param owners The transport, composer and store.
 * @param current Whether the owners are still the mounted ones.
 * @returns The `onNew` handler.
 */
function useSubmit(
	owners: TransportOwners,
	current: () => boolean,
): (message: AppendMessage) => Promise<void> {
	return useCallback(
		async (message: AppendMessage): Promise<void> => {
			const { transport, composer, store } = owners;
			const text = submissionText(message);
			if (text === null) {
				throw new MessageNotSentError("The workbench accepts non-empty text submissions only.");
			}
			const snapshot = transport.snapshot();
			const running = snapshot !== null && activeTurnOf(snapshot) !== null;
			const result = await composer.submit({
				text,
				delivery: deliveryFor(store.getSnapshot(), running),
			});
			if (!current()) {
				return;
			}
			const turnKnown =
				result.outcome === "delivered" && turnIsAuthoritative(transport, result.turnId);
			store.update({ status: submissionStatus(result, turnKnown) });
			if (result.outcome === "not_delivered") {
				throw new MessageNotSentError(result.reason);
			}
		},
		[owners, current],
	);
}

/**
 * The one authoritative Codex runtime over a transport: the assistant-ui
 * runtime for the provider, the `WorkbenchView`, and the `WorkbenchActions`.
 * @param transport The transport.
 * @param options The host and presentation inputs.
 * @returns The runtime, view and actions.
 */
function useWorkbenchRuntime(
	transport: BrowserWorkbenchTransport,
	options: WorkbenchRuntimeOptions,
): WorkbenchRuntimeHandle {
	const { host, voice = NO_VOICE, reducedMotion = false, now = Date.now } = options;
	const owners = useMemo<TransportOwners>(
		() => ({
			transport,
			composer: createWorkbenchComposerController({ transport }),
			store: createWorkbenchRuntimeStore(),
		}),
		[transport],
	);
	const mounted = useRef<TransportOwners | null>(null);
	useEffect(() => {
		mounted.current = owners;
		return () => {
			mounted.current = null;
		};
	}, [owners]);
	const current = useCallback(() => mounted.current === owners, [owners]);
	const state = useTransportState(transport);
	const local = useLocalState(owners.store);
	const runtimeView = useMemo(() => projectWorkbenchRuntime(state), [state]);
	const snapshot = state.snapshot;
	const activeTurn = useMemo(() => (snapshot === null ? null : activeTurnOf(snapshot)), [snapshot]);
	const actions = useMemo(
		() =>
			createWorkbenchActions({
				transport: owners.transport,
				composer: owners.composer,
				store: owners.store,
				host,
			}),
		[owners, host],
	);
	const onNew = useSubmit(owners, current);
	const onCancel = useCallback(async () => {
		actions.stopTurn();
	}, [actions]);
	const runtime = useExternalStoreRuntime<WorkbenchTurnProjection>({
		messages: runtimeView.turns,
		convertMessage: toThreadMessageLike,
		isRunning: activeTurn !== null,
		isDisabled: runtimeView.mode === "readonly",
		onNew,
		onCancel,
		unstable_capabilities: { copy: true },
	});
	const view = useMemo<WorkbenchView>(
		() => ({
			session: sessionView(state),
			composer: { intent: local.intent, queueInstead: local.queueInstead },
			busyApprovals: local.busyApprovals,
			voice,
			nowMs: now(),
			reducedMotion,
		}),
		[state, local, voice, now, reducedMotion],
	);
	return { runtime, view, actions, runtimeView, status: visibleStatus(runtimeView, local) };
}

/**
 * The provider: the assistant-ui runtime provider around the renderer, with
 * the view, actions and status the renderer needs.
 * @param props The transport, options and renderer.
 * @returns The provider tree.
 */
function WorkbenchRuntimeProvider(props: WorkbenchRuntimeProviderProps): ReactNode {
	const { transport, render, ...options } = props;
	const handle = useWorkbenchRuntime(transport, options);
	return createElement(
		AssistantRuntimeProvider,
		{ runtime: handle.runtime },
		createElement(render, {
			view: handle.view,
			actions: handle.actions,
			runtimeView: handle.runtimeView,
			status: handle.status,
			assistantRuntime: handle.runtime,
		}),
	);
}

export {
	WorkbenchRuntimeProvider,
	useWorkbenchRuntime,
	type WorkbenchRuntimeHandle,
	type WorkbenchRuntimeOptions,
	type WorkbenchRuntimeProviderProps,
	type WorkbenchRuntimeRenderContext,
	type WorkbenchRuntimeRenderer,
};
