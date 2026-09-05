// The browser media owner: one realtime media session per attached
// transport, readiness published through that transport, remote audio
// elements mounted and removed with each run, and every realtime publication
// forwarded to the owner's own subscribers.

import { createRealtimeMediaSession } from "@/ui/codex-realtime";
import type {
	RealtimeHost,
	RealtimeMediaSession,
	RealtimeMediaSnapshot,
} from "@/ui/codex-realtime";
import { createMediaHost } from "@/ui/codex-workbench-media/lib/media-host";
import type { StartOperation } from "@/ui/codex-workbench-media/lib/media-host";
import {
	browserAudioElements,
	browserMediaSupported,
	capabilityFailure,
	hostRevokedVoice,
	leaseCorrelation,
	noSnapshotState,
	removeAudioElements,
	socketLost,
	unavailableFromSnapshot,
} from "@/ui/codex-workbench-media/lib/media-state";
import type {
	BrowserWorkbenchMediaOwner,
	BrowserWorkbenchMediaOwnerOptions,
	BrowserWorkbenchMediaState,
	MediaRun,
} from "@/ui/codex-workbench-media/lib/media-state";
import type { BrowserWorkbenchTransport } from "@/ui/workbench-transport";

const DETACHED: BrowserWorkbenchMediaState = Object.freeze({
	state: "unavailable",
	reason: "detached",
	message: "No Codex workbench transport is attached.",
});

/**
 * Does nothing; the placeholder for a released subscription.
 */
function noop(): void {
	// Nothing to release.
}

/**
 * Creates the owner.
 * @param options The construction options.
 * @returns The owner.
 */
function createBrowserWorkbenchMediaOwner(
	options: BrowserWorkbenchMediaOwnerOptions = {},
): BrowserWorkbenchMediaOwner {
	const createMediaSession = options.createMediaSession ?? createRealtimeMediaSession;
	const audioElements = options.audioElements ?? browserAudioElements();
	const mediaSupported = options.mediaSupported ?? browserMediaSupported;
	let run: MediaRun | null = null;
	let disposed = false;
	let ownerState: BrowserWorkbenchMediaState = DETACHED;
	const listeners = new Set<() => void>();

	/**
	 * Tells every subscriber something may have changed.
	 */
	const notify = (): void => {
		const notified = [...listeners];
		for (const listener of notified) {
			try {
				listener();
			} catch {
				// A subscriber cannot take ownership of the media lifecycle.
			}
		}
	};

	/**
	 * Every owner-state write goes through here so no change is published silently.
	 * @param state The state.
	 * @returns The same state.
	 */
	const setOwnerState = (state: BrowserWorkbenchMediaState): BrowserWorkbenchMediaState => {
		ownerState = state;
		notify();
		return state;
	};

	/**
	 * Whether a run is the open, current one.
	 * @param active The run.
	 * @returns True when current.
	 */
	const isCurrent = (active: MediaRun): boolean => !disposed && run === active && !active.closed;

	/**
	 * Throws once a run was replaced.
	 * @param active The run.
	 */
	const requireCurrent = (active: MediaRun): void => {
		if (!isCurrent(active)) {
			throw new Error("The Codex browser media run was replaced.");
		}
	};

	/**
	 * Throws once a run or its start was replaced.
	 * @param active The run.
	 * @param operation The start.
	 */
	const requireCurrentStart = (active: MediaRun, operation: StartOperation): void => {
		requireCurrent(active);
		if (active.startOperation !== operation) {
			throw new Error("The Codex browser media start was replaced.");
		}
	};

	/**
	 * The current run when it is open, with its session and host.
	 * @returns The run, or null.
	 */
	const openRun = (): (MediaRun & { media: RealtimeMediaSession; host: RealtimeHost }) | null => {
		const active = run;
		if (active === null || active.closed || active.media === null || active.host === null) {
			return null;
		}
		return { ...active, media: active.media, host: active.host };
	};

	/**
	 * Publishes readiness through the transport.
	 * @param active The run.
	 * @param ready Whether media is ready.
	 */
	const publishMediaReady = async (active: MediaRun, ready: boolean): Promise<void> => {
		requireCurrent(active);
		await active.transport.setMediaReady(ready);
		requireCurrent(active);
	};

	/**
	 * Publishes unavailability locally and through the transport.
	 * @param active The run.
	 * @param state The unavailability.
	 * @returns The state.
	 */
	const publishUnavailable = async (
		active: MediaRun,
		state: BrowserWorkbenchMediaState,
	): Promise<BrowserWorkbenchMediaState> => {
		requireCurrent(active);
		setOwnerState(state);
		await publishMediaReady(active, false).catch(() => undefined);
		requireCurrent(active);
		return state;
	};

	/**
	 * Closes a run: subscriptions, elements, and its realtime session.
	 * @param active The run.
	 */
	const closeRun = async (active: MediaRun): Promise<void> => {
		if (active.closed) {
			return;
		}
		active.closed = true;
		active.remove();
		active.releaseMedia();
		active.releaseMedia = noop;
		const media = active.media;
		active.media = null;
		active.host = null;
		active.handle = null;
		active.startOperation = null;
		removeAudioElements(active);
		await media?.dispose();
		notify();
	};

	/**
	 * The transport's socket closed under the run.
	 * @param active The run.
	 */
	const transportLost = (active: MediaRun): void => {
		if (!isCurrent(active)) {
			return;
		}
		setOwnerState({
			state: "unavailable",
			reason: "socket_closed",
			message: "The Codex workbench socket closed.",
		});
		void closeRun(active).finally(() => {
			if (run === active) {
				run = null;
			}
		});
	};

	/**
	 * Reacts to one transport publication for a run.
	 * @param active The run.
	 */
	const onTransportChange = (active: MediaRun): void => {
		if (!isCurrent(active)) {
			return;
		}
		if (active.transport.state().kind === "connection") {
			transportLost(active);
			return;
		}
		const media = active.media;
		if (media !== null && hostRevokedVoice(active)) {
			active.voiceStopRequested = true;
			void media
				.stop()
				.catch(() => undefined)
				.finally(() => {
					removeAudioElements(active);
				});
		}
	};

	/**
	 * A fresh run over one transport.
	 * @param transport The transport.
	 * @returns The run.
	 */
	const createMediaRun = (transport: BrowserWorkbenchTransport): MediaRun => {
		const active: MediaRun = {
			transport,
			mountedElements: new Set(),
			remove: noop,
			releaseMedia: noop,
			media: null,
			host: null,
			handle: null,
			startOperation: null,
			voiceStopRequested: false,
			closed: false,
		};
		active.remove = transport.subscribe(() => {
			onTransportChange(active);
		});
		return active;
	};

	/**
	 * Builds the run's realtime session over its host and forwards its publications.
	 * @param active The run.
	 */
	const installMedia = (active: MediaRun): void => {
		const host = createMediaHost({
			transport: active.transport,
			audioElements,
			mountedElements: active.mountedElements,
			session: active,
			/**
			 * Throws once replaced.
			 */
			requireCurrent: () => {
				requireCurrent(active);
			},
			/**
			 * Throws once the start was replaced.
			 * @param operation The start.
			 */
			requireCurrentStart: (operation) => {
				requireCurrentStart(active, operation);
			},
		});
		const media = createMediaSession(
			host,
			options.environment === undefined ? {} : { environment: options.environment },
		);
		active.media = media;
		active.host = host;
		// The realtime session publishes every browser-originated change to its
		// own subscribers alone; forwarding is what lets a presentation see them.
		active.releaseMedia = media.subscribe(() => {
			if (run === active && !active.closed) {
				notify();
			}
		});
	};

	/**
	 * What an attach that threw publishes.
	 * @param active The run.
	 * @param error What was thrown.
	 * @returns The state.
	 */
	const attachFailure = async (
		active: MediaRun,
		error: unknown,
	): Promise<BrowserWorkbenchMediaState> => {
		const current = isCurrent(active);
		await closeRun(active);
		if (!current || run !== active || disposed) {
			return ownerState;
		}
		run = null;
		return setOwnerState({
			state: "unavailable",
			reason: socketLost(active.transport) ? "socket_closed" : "negotiation_failed",
			message: error instanceof Error ? error.message : "Media attachment failed.",
		});
	};

	/**
	 * Attaches a run's media once the previous run is closed.
	 * @param active The run.
	 * @param previous The run being replaced.
	 * @returns The state.
	 */
	const attachRun = async (
		active: MediaRun,
		previous: MediaRun | null,
	): Promise<BrowserWorkbenchMediaState> => {
		if (previous !== null) {
			await closeRun(previous);
		}
		requireCurrent(active);
		if (active.transport.snapshot() === null) {
			await closeRun(active);
			if (run === active) {
				run = null;
			}
			return setOwnerState(noSnapshotState(active.transport));
		}
		installMedia(active);
		const unavailable = capabilityFailure(mediaSupported);
		if (unavailable !== null) {
			return publishUnavailable(active, unavailable);
		}
		await publishMediaReady(active, true);
		requireCurrent(active);
		return setOwnerState({ state: "ready" });
	};

	/**
	 * Attaches a transport, replacing any previous run.
	 * @param transport The transport.
	 * @returns The state.
	 */
	const attachTransport = async (
		transport: BrowserWorkbenchTransport,
	): Promise<BrowserWorkbenchMediaState> => {
		const previous = run;
		const active = createMediaRun(transport);
		run = active;
		setOwnerState({ state: "attaching" });
		try {
			return await attachRun(active, previous);
		} catch (error) {
			return attachFailure(active, error);
		}
	};

	/**
	 * The realtime session of the current, open run.
	 * @returns The session.
	 */
	const activeMedia = (): RealtimeMediaSession => {
		const open = openRun();
		if (open === null) {
			throw new Error("No realtime media session is active.");
		}
		return open.media;
	};

	/**
	 * Publishes readiness or unavailability before a start.
	 * @param active The run.
	 */
	const publishStartReadiness = async (active: MediaRun): Promise<void> => {
		const unavailable = capabilityFailure(mediaSupported);
		if (unavailable === null) {
			await publishMediaReady(active, true);
		} else {
			await publishUnavailable(active, unavailable);
		}
	};

	/**
	 * Runs one start on the current run.
	 * @param active The run.
	 * @param media The session.
	 * @param operation The start.
	 * @returns The snapshot the start ended on.
	 */
	const startMedia = async (
		active: MediaRun,
		media: RealtimeMediaSession,
		operation: StartOperation,
	): Promise<RealtimeMediaSnapshot> => {
		await publishStartReadiness(active);
		requireCurrentStart(active, operation);
		const lease = await active.transport.claimLease();
		requireCurrentStart(active, operation);
		active.voiceStopRequested = false;
		operation.lease = lease;
		removeAudioElements(active);
		const snapshot = await media.start(leaseCorrelation(lease));
		requireCurrentStart(active, operation);
		if (snapshot.state.phase === "listening") {
			setOwnerState({ state: "ready" });
		} else {
			await publishUnavailable(active, unavailableFromSnapshot(snapshot));
		}
		return snapshot;
	};

	/**
	 * Publishes a start that threw, then rethrows.
	 * @param active The run.
	 * @param operation The start.
	 * @param error What was thrown.
	 * @returns Never resolves.
	 */
	const startFailure = async (
		active: MediaRun,
		operation: StartOperation,
		error: unknown,
	): Promise<never> => {
		if (isCurrent(active) && active.startOperation === operation) {
			await publishUnavailable(active, {
				state: "unavailable",
				reason: "negotiation_failed",
				message: error instanceof Error ? error.message : "Realtime negotiation failed.",
			});
		}
		throw error;
	};

	/**
	 * Starts realtime media on the current run.
	 * @returns The snapshot the start ended on.
	 */
	const start = async (): Promise<RealtimeMediaSnapshot> => {
		const open = openRun();
		const active = run;
		if (open === null || active === null) {
			throw new Error("The Codex browser media owner has no active transport.");
		}
		const operation: StartOperation = { lease: null };
		active.startOperation = operation;
		try {
			return await startMedia(active, open.media, operation);
		} catch (error) {
			return startFailure(active, operation, error);
		} finally {
			if (isCurrent(active) && active.startOperation === operation) {
				active.startOperation = null;
			}
		}
	};

	/**
	 * Stops realtime media on the current run.
	 * @returns The snapshot the stop ended on.
	 */
	const stop = async (): Promise<RealtimeMediaSnapshot> => {
		const active = run;
		const media = active?.media;
		if (active === null || media === null || media === undefined) {
			throw new Error("No realtime media session is active.");
		}
		try {
			const snapshot = await media.stop();
			if (isCurrent(active)) {
				await publishMediaReady(active, true);
				requireCurrent(active);
				setOwnerState({ state: "ready" });
			}
			return snapshot;
		} finally {
			removeAudioElements(active);
		}
	};

	/**
	 * Appends text to the active session.
	 * @param text The text.
	 * @returns The append outcome.
	 */
	const appendText: BrowserWorkbenchMediaOwner["appendText"] = (text) => {
		const open = openRun();
		const correlation = open?.media.getSnapshot().correlation ?? null;
		if (open === null || correlation === null) {
			throw new Error("No realtime media session is active.");
		}
		return open.host.appendText({ ...correlation, text });
	};

	return Object.freeze({
		/**
		 * Attaches a transport.
		 * @param transport The transport.
		 * @returns The state.
		 */
		attach: (transport: BrowserWorkbenchTransport) => {
			if (disposed || (run?.transport === transport && !run.closed)) {
				return Promise.resolve(ownerState);
			}
			return attachTransport(transport);
		},
		/**
		 * Detaches a transport.
		 * @param transport The transport.
		 */
		detach: async (transport: BrowserWorkbenchTransport) => {
			const active = run;
			if (active === null || active.transport !== transport) {
				return;
			}
			await closeRun(active);
			if (run !== active || disposed) {
				return;
			}
			run = null;
			setOwnerState(DETACHED);
		},
		start,
		appendText,
		/**
		 * Mutes the microphone.
		 * @returns The snapshot.
		 */
		mute: () => Promise.resolve().then(() => activeMedia().mute()),
		/**
		 * Unmutes the microphone.
		 * @returns The snapshot.
		 */
		unmute: () => Promise.resolve().then(() => activeMedia().unmute()),
		stop,
		/**
		 * The active session's snapshot.
		 * @returns The snapshot, or null.
		 */
		snapshot: () => run?.media?.getSnapshot() ?? null,
		/**
		 * The owner's state.
		 * @returns The state.
		 */
		state: () => ownerState,
		/**
		 * The active session's output level source.
		 * @returns The source, or null.
		 */
		outputLevel: () => run?.media?.outputLevel ?? null,
		/**
		 * Subscribes to changes.
		 * @param listener The listener.
		 * @returns The unsubscribe function.
		 */
		subscribe: (listener: () => void) => {
			if (disposed) {
				return noop;
			}
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		/**
		 * Disposes the owner.
		 */
		dispose: async () => {
			if (disposed) {
				return;
			}
			disposed = true;
			const active = run;
			run = null;
			if (active !== null) {
				await closeRun(active);
			}
			setOwnerState({
				state: "unavailable",
				reason: "detached",
				message: "The Codex browser media owner is disposed.",
			});
			listeners.clear();
		},
	});
}

export { createBrowserWorkbenchMediaOwner };
