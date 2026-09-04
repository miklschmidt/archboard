import type { BrowserSnapshot } from "../../../shared/codex-browser-model/index.js";
import type { RealtimeMediaSnapshot } from "../../codex-realtime/index.js";
import type { BrowserWorkbenchMediaState } from "../../codex-workbench-media/index.js";
import type { BrowserWorkbenchState } from "../../workbench-transport/index.js";
import type {
	VoiceSession,
	VoiceSessionBinding,
	VoiceSessionControls,
	VoiceSessionFailure,
	VoiceSessionOutcome,
	VoiceSessionPorts,
	VoiceSessionView,
	VoiceTransportPort,
} from "../contract.js";
import { presentedFailure } from "./failure.js";
import { projectVoiceSession } from "./projection.js";

/** What the current snapshot says this pane is bound to, when it can say. */
type ObservedBinding = VoiceSessionBinding | null | "gone";

function text(value: string | null | undefined): string | null {
	return value === null || value === undefined ? null : String(value);
}

function coordinatorThreadId(snapshot: BrowserSnapshot | null): string | null {
	return text(snapshot?.coordinator.threadId ?? null);
}

function controlMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * What the transport currently says this pane is bound to. `null` means the
 * binding cannot be observed — a reconnect that has retired the snapshot, or a
 * stale snapshot that lost its place in the stream, is not evidence that
 * anything was replaced — and `"gone"` means a current readiness projection
 * published a pane with no executable thread link at all.
 *
 * Every field is read from the published snapshot. Nothing here calls the
 * transport's lease surface, so a projection stays a read.
 */
function observeBinding(transport: VoiceTransportPort, paneId: string): ObservedBinding {
	const state = transport.state();
	// Only a current readiness projection is evidence about the link.
	if (state.kind !== "readiness") return null;
	const snapshot = state.snapshot;
	const link = snapshot.threadLink;
	if (link.state !== "executable") return "gone";
	return {
		paneId,
		childId: String(link.childId),
		epoch: String(link.epoch),
		workhorseThreadId: String(link.threadId),
		coordinatorThreadId: coordinatorThreadId(snapshot),
	};
}

function bindingReplaced(bound: VoiceSessionBinding, observed: ObservedBinding): boolean {
	if (observed === null) return false;
	if (observed === "gone") return true;
	if (observed.childId !== bound.childId) return true;
	if (observed.epoch !== bound.epoch) return true;
	if (observed.workhorseThreadId !== bound.workhorseThreadId) return true;
	// Unconditional: a binding must never be presented under a pane it was not
	// captured for. Within one adapter both sides are the caller's pane id, so
	// this holds by construction and fails loudly if that ever stops being true.
	if (observed.paneId !== bound.paneId) return true;
	// A coordinator the host has not published yet is not a replacement; a
	// different published coordinator is.
	return (
		observed.coordinatorThreadId !== null &&
		bound.coordinatorThreadId !== null &&
		observed.coordinatorThreadId !== bound.coordinatorThreadId
	);
}

function captureBinding(transport: VoiceTransportPort, paneId: string): VoiceSessionBinding {
	const snapshot = transport.snapshot();
	const link = snapshot?.threadLink;
	if (link === undefined || link.state !== "executable" || link.threadId === null)
		throw new Error("A voice session requires an executable thread link to bind to.");
	return Object.freeze({
		paneId,
		childId: String(link.childId),
		epoch: String(link.epoch),
		workhorseThreadId: String(link.threadId),
		coordinatorThreadId: coordinatorThreadId(snapshot),
	});
}

function sameFailure(left: VoiceSessionFailure | null, right: VoiceSessionFailure | null): boolean {
	if (left === null || right === null) return left === right;
	return (
		left.code === right.code &&
		left.recoverable === right.recoverable &&
		left.message === right.message
	);
}

function sameOutcome(left: VoiceSessionOutcome, right: VoiceSessionOutcome): boolean {
	if (left.kind !== right.kind) return false;
	if (left.kind === "none" || right.kind === "none") return true;
	if (left.label !== right.label || left.recovery !== right.recovery) return false;
	return left.kind !== "retry" || right.kind !== "retry" || left.control === right.control;
}

function sameControls(left: VoiceSessionControls, right: VoiceSessionControls): boolean {
	return (
		left.canStart === right.canStart &&
		left.canStop === right.canStop &&
		left.canRestart === right.canRestart &&
		left.canClose === right.canClose
	);
}

function sameBinding(left: VoiceSessionBinding | null, right: VoiceSessionBinding | null): boolean {
	if (left === null || right === null) return left === right;
	return (
		left.paneId === right.paneId &&
		left.childId === right.childId &&
		left.epoch === right.epoch &&
		left.workhorseThreadId === right.workhorseThreadId &&
		left.coordinatorThreadId === right.coordinatorThreadId
	);
}

/** Field-wise, because this runs on every published change and JSON does not. */
function sameView(left: VoiceSessionView, right: VoiceSessionView): boolean {
	return (
		left.status === right.status &&
		left.label === right.label &&
		left.detail === right.detail &&
		left.accessibleStatus === right.accessibleStatus &&
		left.sessionId === right.sessionId &&
		sameFailure(left.failure, right.failure) &&
		sameOutcome(left.outcome, right.outcome) &&
		sameControls(left.controls, right.controls) &&
		sameBinding(left.binding, right.binding)
	);
}

function announce(subscribers: Set<() => void>): void {
	const notified = [...subscribers];
	for (const listener of notified) {
		try {
			listener();
		} catch {
			// A subscriber cannot take ownership of the voice lifecycle.
		}
	}
}

/**
 * The React-facing presentation adapter. It owns exactly one binding, the
 * guards around it, and the projection; the media owner and the transport it
 * reads are constructed elsewhere and are never disposed here.
 */
export function createVoiceSession({
	realtime,
	transport,
	paneId,
}: VoiceSessionPorts): VoiceSession {
	const listeners = new Set<() => void>();
	const levelListeners = new Set<() => void>();
	let binding: VoiceSessionBinding | null = null;
	let closed = false;
	let closedSessionId: string | null = null;
	let busy = false;
	let disposed = false;
	let controlFailure: VoiceSessionFailure | null = null;
	/** Bumped by every control, close, and dispose, so a late resolution is inert. */
	let generation = 0;

	const project = (): VoiceSessionView =>
		projectVoiceSession({
			media: realtime.snapshot(),
			mediaState: realtime.state(),
			transportState: transport.state(),
			capabilities: transport.capabilities(),
			binding,
			replaced: binding !== null && bindingReplaced(binding, observeBinding(transport, paneId)),
			busy,
			closed,
			closedSessionId,
			controlFailure,
		});

	let current = project();
	let inputLevel = realtime.snapshot()?.inputLevel ?? 0;
	/** The exact source objects `current` was projected from. */
	let seenMedia: RealtimeMediaSnapshot | null = realtime.snapshot();
	let seenMediaState: BrowserWorkbenchMediaState = realtime.state();
	let seenTransportState: BrowserWorkbenchState = transport.state();

	const readLevel = (media: RealtimeMediaSnapshot | null): void => {
		const next = media?.inputLevel ?? 0;
		if (next === inputLevel) return;
		inputLevel = next;
		announce(levelListeners);
	};

	const remember = (
		media: RealtimeMediaSnapshot | null,
		mediaState: BrowserWorkbenchMediaState,
		transportState: BrowserWorkbenchState,
	): void => {
		seenMedia = media;
		seenMediaState = mediaState;
		seenTransportState = transportState;
	};

	const publish = (): VoiceSessionView => {
		const media = realtime.snapshot();
		const next = project();
		remember(media, realtime.state(), transport.state());
		readLevel(media);
		if (sameView(next, current)) return current;
		current = next;
		announce(listeners);
		return current;
	};

	/**
	 * The realtime meter republishes from an animation frame, and only the level
	 * moves: the module reuses the same frozen state and correlation objects. That
	 * identity is the fast path — no projection, and no status subscriber woken —
	 * so sixty level frames a second cost sixty meter renders, not sixty of every
	 * status consumer in the pane.
	 */
	const levelOnly = (): boolean => {
		const media = realtime.snapshot();
		if (media === null || seenMedia === null) return false;
		if (media.state !== seenMedia.state || media.correlation !== seenMedia.correlation)
			return false;
		if (realtime.state() !== seenMediaState || transport.state() !== seenTransportState)
			return false;
		remember(media, seenMediaState, seenTransportState);
		readLevel(media);
		return true;
	};

	/**
	 * The transport is always projected in full. Its notification carries changes
	 * the identity gate cannot see: `capabilities()` builds a fresh record on every
	 * call and the transport moves it on lease claim, renewal, release, and expiry
	 * without touching the state object the gate compares. The meter is the only
	 * channel that repeats itself, and it is the only one gated.
	 */
	const republishTransport = (): void => {
		if (disposed) return;
		publish();
	};
	const republishRealtime = (): void => {
		if (disposed) return;
		if (levelOnly()) return;
		publish();
	};
	const releaseTransport = transport.subscribe(republishTransport);
	// The media owner's channel is the only one that carries a lost microphone,
	// a dropped ICE connection, or an in-start phase; the transport announces none
	// of them. refresh() remains an escape hatch, not the notification path.
	const releaseRealtime = realtime.subscribe(republishRealtime);

	/** Runs one control, discarding its result when a later control superseded it. */
	const run = async (
		operation: () => Promise<unknown>,
		fallbackMessage: string,
	): Promise<VoiceSessionView> => {
		const token = (generation += 1);
		busy = true;
		controlFailure = null;
		publish();
		try {
			await operation();
		} catch (error) {
			if (token !== generation) return current;
			controlFailure = presentedFailure("realtime", controlMessage(error, fallbackMessage));
		}
		if (token !== generation) return current;
		busy = false;
		return publish();
	};

	const bindNewSession = (): void => {
		binding = captureBinding(transport, paneId);
		closed = false;
		closedSessionId = null;
	};

	const start = async (): Promise<VoiceSessionView> => {
		if (disposed) return current;
		const view = publish();
		if (!view.controls.canStart) return view;
		return run(async () => {
			bindNewSession();
			await realtime.start();
		}, "The realtime voice session could not be started.");
	};

	const stop = async (): Promise<VoiceSessionView> => {
		if (disposed) return current;
		const view = publish();
		if (!view.controls.canStop) return view;
		return run(() => realtime.stop(), "The realtime voice session could not be stopped.");
	};

	const restart = async (): Promise<VoiceSessionView> => {
		if (disposed) return current;
		const view = publish();
		if (!view.controls.canRestart) return view;
		return run(async () => {
			// codex-realtime refuses a start until the previous run confirms closed,
			// so the stop leg is awaited and its phase is the gate, never a timer.
			const stopped = await realtime.stop();
			if (stopped.state.phase !== "closed") return;
			bindNewSession();
			await realtime.start();
		}, "The realtime voice session could not be restarted.");
	};

	const close = async (): Promise<VoiceSessionView> => {
		if (disposed) return current;
		const view = publish();
		if (!view.controls.canClose) return view;
		const token = (generation += 1);
		busy = true;
		controlFailure = null;
		publish();
		try {
			// A replaced or terminal session may still hold the microphone and the
			// remote audio element. Retiring the binding without stopping it would
			// leave a live capture behind a UI that says the session is over.
			await realtime.stop();
		} catch {
			// The media owner publishes its own failure state; the close still
			// releases this adapter's binding rather than stranding the person.
		}
		if (token !== generation) return current;
		binding = null;
		closed = true;
		closedSessionId = view.sessionId;
		busy = false;
		controlFailure = null;
		return publish();
	};

	return Object.freeze({
		view: () => current,
		subscribe: (listener: () => void) => {
			if (disposed) return () => undefined;
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		level: () => inputLevel,
		subscribeLevel: (listener: () => void) => {
			if (disposed) return () => undefined;
			levelListeners.add(listener);
			return () => levelListeners.delete(listener);
		},
		refresh: () => (disposed ? current : publish()),
		start,
		stop,
		restart,
		close,
		dispose: () => {
			if (disposed) return;
			disposed = true;
			generation += 1;
			busy = false;
			releaseTransport();
			releaseRealtime();
			listeners.clear();
			levelListeners.clear();
		},
	});
}
