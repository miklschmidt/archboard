// The React-facing presentation adapter. It owns exactly one binding, the
// guards around it, and the projection; the media owner and the transport it
// reads are constructed elsewhere and are never disposed here.

import type { RealtimeState } from "@/ui/codex-realtime";
import type {
	VoiceSession,
	VoiceSessionBinding,
	VoiceSessionFailure,
	VoiceSessionPorts,
	VoiceSessionView,
} from "@/ui/voice-session/contract";
import { bindingReplaced, captureBinding, observeBinding } from "@/ui/voice-session/lib/binding";
import { presentedFailure } from "@/ui/voice-session/lib/failure";
import { createLevelChannel } from "@/ui/voice-session/lib/level-channel";
import { voiceControlsView, voiceWaveView } from "@/ui/voice-session/lib/presentation";
import { projectVoiceSession } from "@/ui/voice-session/lib/projection";
import { sameView } from "@/ui/voice-session/lib/view-equality";

/**
 * The message of a rejected control, or the fallback.
 * @param error What was thrown.
 * @param fallback The words to use otherwise.
 * @returns A message.
 */
function controlMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message !== "" ? error.message : fallback;
}

/**
 * Tells every subscriber.
 * @param subscribers The subscribers.
 */
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

/** The adapter's mutable state, kept together so every write is visible. */
interface SessionState {
	binding: VoiceSessionBinding | null;
	closed: boolean;
	closedSessionId: string | null;
	busy: boolean;
	disposed: boolean;
	controlFailure: VoiceSessionFailure | null;
	/**
	 * The exact realtime state a control failure was raised over. A refused
	 * control is only news until the run moves, so the next phase drops it.
	 */
	controlFailureState: RealtimeState | null;
	/** Bumped by every control, close, and dispose, so a late resolution is inert. */
	generation: number;
}

/**
 * Creates the adapter.
 * @param ports The media owner, the transport, and this pane's identity.
 * @returns The session.
 */
function createVoiceSession(ports: VoiceSessionPorts): VoiceSession {
	const { realtime, transport, paneId } = ports;
	const listeners = new Set<() => void>();
	const levels = createLevelChannel();
	const state: SessionState = {
		binding: null,
		closed: false,
		closedSessionId: null,
		busy: false,
		disposed: false,
		controlFailure: null,
		controlFailureState: null,
		generation: 0,
	};

	/**
	 * Projects the current sources.
	 * @returns The view.
	 */
	const project = (): VoiceSessionView =>
		projectVoiceSession({
			media: realtime.snapshot(),
			mediaState: realtime.state(),
			transportState: transport.state(),
			capabilities: transport.capabilities(),
			binding: state.binding,
			replaced:
				state.binding !== null && bindingReplaced(state.binding, observeBinding(transport, paneId)),
			busy: state.busy,
			closed: state.closed,
			closedSessionId: state.closedSessionId,
			controlFailure: state.controlFailure,
		});

	let current = project();
	levels.follow(realtime.outputLevel());

	/**
	 * Drops a control failure the run has moved past.
	 */
	const clearStaleControlFailure = (): void => {
		if (state.controlFailure === null) {
			return;
		}
		if ((realtime.snapshot()?.state ?? null) === state.controlFailureState) {
			return;
		}
		state.controlFailure = null;
		state.controlFailureState = null;
	};

	/**
	 * Clears any control failure.
	 */
	const clearControlFailure = (): void => {
		state.controlFailure = null;
		state.controlFailureState = null;
	};

	/**
	 * Re-projects and publishes when the view changed.
	 * @returns The current view.
	 */
	const publish = (): VoiceSessionView => {
		clearStaleControlFailure();
		levels.follow(realtime.outputLevel());
		const next = project();
		if (sameView(next, current)) {
			return current;
		}
		current = next;
		announce(listeners);
		return current;
	};

	/**
	 * Republishes on a source notification.
	 */
	const republish = (): void => {
		if (!state.disposed) {
			publish();
		}
	};
	const releaseTransport = transport.subscribe(republish);
	// The media owner's channel is the only one that carries a lost microphone,
	// a dropped ICE connection, or an in-start phase; the transport announces
	// none of them. refresh() remains an escape hatch, not the notification path.
	const releaseRealtime = realtime.subscribe(republish);

	/**
	 * Runs one control, discarding its result when a later control superseded it.
	 * @param operation The control.
	 * @param fallbackMessage The words for a rejection without a message.
	 * @returns The view once the control settled.
	 */
	const run = async (
		operation: () => Promise<unknown>,
		fallbackMessage: string,
	): Promise<VoiceSessionView> => {
		state.generation += 1;
		const token = state.generation;
		state.busy = true;
		clearControlFailure();
		publish();
		try {
			await operation();
		} catch (error) {
			if (token !== state.generation) {
				return current;
			}
			state.controlFailure = presentedFailure("realtime", controlMessage(error, fallbackMessage));
			state.controlFailureState = realtime.snapshot()?.state ?? null;
		}
		if (token !== state.generation) {
			return current;
		}
		state.busy = false;
		return publish();
	};

	/**
	 * Captures a fresh binding for a new session.
	 */
	const bindNewSession = (): void => {
		state.binding = captureBinding(transport, paneId);
		state.closed = false;
		state.closedSessionId = null;
	};

	/**
	 * Runs a control when the projection offers it.
	 * @param offered Whether the current view offers the control.
	 * @param operation The control.
	 * @param fallbackMessage The words for a rejection without a message.
	 * @returns The view.
	 */
	const control = (
		offered: (view: VoiceSessionView) => boolean,
		operation: () => Promise<unknown>,
		fallbackMessage: string,
	): Promise<VoiceSessionView> => {
		if (state.disposed) {
			return Promise.resolve(current);
		}
		const view = publish();
		return offered(view) ? run(operation, fallbackMessage) : Promise.resolve(view);
	};

	/**
	 * Starts a new session on a fresh binding.
	 */
	const startNew = async (): Promise<void> => {
		bindNewSession();
		await realtime.start();
	};

	/**
	 * Stops, then starts again only once the stop confirmed closed.
	 */
	const restartRun = async (): Promise<void> => {
		// codex-realtime refuses a start until the previous run confirms closed,
		// so the stop leg is awaited and its phase is the gate, never a timer.
		const stopped = await realtime.stop();
		if (stopped.state.phase !== "closed") {
			return;
		}
		await startNew();
	};

	/**
	 * Retires a terminal or replaced session, stopping whatever it still holds.
	 * @returns The view.
	 */
	const close = async (): Promise<VoiceSessionView> => {
		if (state.disposed) {
			return current;
		}
		const view = publish();
		if (!view.controls.canClose) {
			return view;
		}
		state.generation += 1;
		const token = state.generation;
		state.busy = true;
		clearControlFailure();
		publish();
		// A replaced or terminal session may still hold the microphone and the
		// remote audio element; retiring the binding without stopping it would
		// leave a live capture behind a UI that says the session is over.
		await realtime.stop().catch(() => undefined);
		if (token !== state.generation) {
			return current;
		}
		state.binding = null;
		state.closed = true;
		state.closedSessionId = view.sessionId;
		state.busy = false;
		clearControlFailure();
		return publish();
	};

	return Object.freeze({
		/**
		 * The current view.
		 * @returns The view.
		 */
		view: () => current,
		/**
		 * Subscribes to view changes.
		 * @param listener The listener.
		 * @returns The unsubscribe function.
		 */
		subscribe: (listener: () => void) => {
			if (state.disposed) {
				return () => undefined;
			}
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		level: levels.level,
		subscribeLevel: levels.subscribe,
		/**
		 * The wave inputs.
		 * @returns The wave inputs.
		 */
		wave: () => voiceWaveView(realtime.snapshot()?.state.phase ?? null, levels.level()),
		/**
		 * The controls' inputs.
		 * @returns The controls' view.
		 */
		controlsView: () => voiceControlsView(current),
		/**
		 * Re-reads and republishes.
		 * @returns The view.
		 */
		refresh: () => (state.disposed ? current : publish()),
		/**
		 * Starts voice.
		 * @returns The view.
		 */
		start: () =>
			control(
				(view) => view.controls.canStart,
				startNew,
				"The realtime voice session could not be started.",
			),
		/**
		 * Mutes the microphone.
		 * @returns The view.
		 */
		mute: () =>
			control((view) => view.controls.canMute, realtime.mute, "The microphone could not be muted."),
		/**
		 * Unmutes the microphone.
		 * @returns The view.
		 */
		unmute: () =>
			control(
				(view) => view.controls.canUnmute,
				realtime.unmute,
				"The microphone could not be unmuted.",
			),
		/**
		 * Stops voice.
		 * @returns The view.
		 */
		stop: () =>
			control(
				(view) => view.controls.canStop,
				realtime.stop,
				"The realtime voice session could not be stopped.",
			),
		/**
		 * Restarts voice.
		 * @returns The view.
		 */
		restart: () =>
			control(
				(view) => view.controls.canRestart,
				restartRun,
				"The realtime voice session could not be restarted.",
			),
		close,
		/**
		 * Releases the adapter's subscriptions.
		 */
		dispose: () => {
			if (state.disposed) {
				return;
			}
			state.disposed = true;
			state.generation += 1;
			state.busy = false;
			releaseTransport();
			releaseRealtime();
			listeners.clear();
			levels.dispose();
		},
	});
}

export { createVoiceSession };
