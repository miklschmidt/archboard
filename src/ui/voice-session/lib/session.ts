import type { BrowserSnapshot } from "../../../shared/codex-browser-model/index.js";
import type {
	VoiceSession,
	VoiceSessionBinding,
	VoiceSessionFailure,
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
 * binding cannot be observed — a reconnect that has retired the snapshot is not
 * evidence that anything was replaced — and `"gone"` means a connected workbench
 * published a pane with no executable thread link at all.
 */
function observeBinding(transport: VoiceTransportPort): ObservedBinding {
	const state = transport.state();
	const snapshot = state.snapshot;
	if (snapshot === null) return null;
	const link = snapshot.threadLink;
	// Only a current readiness projection is evidence about the link. A stale
	// snapshot is a connected socket that lost its place in the stream, so what
	// it holds is not known to be current and cannot condemn a binding.
	if (link.state !== "executable") return state.kind === "readiness" ? "gone" : null;
	let paneId: string | null;
	try {
		paneId = text(transport.captureCommandTarget().paneId);
	} catch {
		// A pane whose socket has gone is unobservable, not replaced.
		paneId = null;
	}
	return {
		paneId: paneId ?? "",
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
	if (observed.paneId !== "" && observed.paneId !== bound.paneId) return true;
	// A coordinator the host has not published yet is not a replacement; a
	// different published coordinator is.
	return (
		observed.coordinatorThreadId !== null &&
		bound.coordinatorThreadId !== null &&
		observed.coordinatorThreadId !== bound.coordinatorThreadId
	);
}

function captureBinding(transport: VoiceTransportPort): VoiceSessionBinding {
	const target = transport.captureCommandTarget();
	const link = target.capturedThreadLink;
	if (link.state !== "executable" || link.threadId === null)
		throw new Error("A voice session requires an executable thread link to bind to.");
	return Object.freeze({
		paneId: String(target.paneId),
		childId: String(target.childId),
		epoch: String(target.epoch),
		workhorseThreadId: String(link.threadId),
		coordinatorThreadId: coordinatorThreadId(transport.snapshot()),
	});
}

/**
 * The React-facing presentation adapter. It owns exactly one binding, the
 * guards around it, and the projection; the media owner and the transport it
 * reads are constructed elsewhere and are never disposed here.
 */
export function createVoiceSession({ realtime, transport }: VoiceSessionPorts): VoiceSession {
	const listeners = new Set<() => void>();
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
			replaced: binding !== null && bindingReplaced(binding, observeBinding(transport)),
			busy,
			closed,
			closedSessionId,
			controlFailure,
		});

	let current = project();

	const publish = (): VoiceSessionView => {
		const next = project();
		if (JSON.stringify(next) === JSON.stringify(current)) return current;
		current = next;
		const notified = [...listeners];
		for (const listener of notified) {
			try {
				listener();
			} catch {
				// A subscriber cannot take ownership of the voice lifecycle.
			}
		}
		return current;
	};

	const republish = (): void => {
		if (disposed) return;
		publish();
	};
	const releaseTransport = transport.subscribe(republish);
	// The media owner's channel is the only one that carries a lost microphone,
	// a dropped ICE connection, or an in-start phase; the transport announces none
	// of them. refresh() remains an escape hatch, not the notification path.
	const releaseRealtime = realtime.subscribe(republish);

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
		binding = captureBinding(transport);
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
		},
	});
}
