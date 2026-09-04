import type { BrowserCommandLease } from "../../../shared/codex-browser-model/index.js";
import {
	type BrowserCommandDraft,
	type BrowserWorkbenchTransport,
} from "../../workbench-transport/index.js";
import {
	parseRealtimeCorrelationId,
	parseRealtimeSessionId,
	type AppendOutcome,
	type CommandOutcome,
	type RealtimeCorrelation,
	type RealtimeHost,
} from "../../../shared/codex-realtime-host/index.js";
import {
	createRealtimeMediaSession,
	type RealtimeMediaSession,
	type RealtimeMediaSnapshot,
} from "../../codex-realtime/index.js";
interface MediaRun {
	readonly transport: BrowserWorkbenchTransport;
	remove: () => void;
	/** Releases this run's subscription to its own realtime media session. */
	releaseMedia: () => void;
	media: RealtimeMediaSession | null;
	handle: string | null;
	startOperation: { lease: BrowserCommandLease | null } | null;
	voiceStopRequested: boolean;
	readonly audioElements: Set<HTMLAudioElement>;
	closed: boolean;
}
export type BrowserWorkbenchMediaState =
	| { readonly state: "attaching" }
	| { readonly state: "ready" }
	| {
			readonly state: "unavailable";
			readonly reason:
				| "detached"
				| "socket_closed"
				| "media_api_unavailable"
				| "permission_denied"
				| "negotiation_failed";
			readonly message: string;
	  };
/** The media boundary accepts the shared transport, never a raw socket. */
export type BrowserWorkbenchMediaSource = BrowserWorkbenchTransport;
export interface BrowserWorkbenchMediaOwner {
	readonly attach: (transport: BrowserWorkbenchTransport) => Promise<BrowserWorkbenchMediaState>;
	readonly detach: (transport: BrowserWorkbenchTransport) => Promise<void>;
	readonly start: () => Promise<RealtimeMediaSnapshot>;
	readonly appendText: (text: string) => Promise<AppendOutcome>;
	/**
	 * Silences and restores the captured microphone. Neither claims a lease nor
	 * sends a command: the realtime session disables the local audio track it
	 * already owns, so there is no wire operation to authorize. The forwarded
	 * subscription below is what publishes the resulting phase.
	 */
	readonly mute: () => Promise<RealtimeMediaSnapshot>;
	readonly unmute: () => Promise<RealtimeMediaSnapshot>;
	readonly stop: () => Promise<RealtimeMediaSnapshot>;
	readonly snapshot: () => RealtimeMediaSnapshot | null;
	readonly state: () => BrowserWorkbenchMediaState;
	/**
	 * Fires whenever `snapshot()` or `state()` may have changed, including the
	 * browser-originated realtime publications — a lost microphone, a dropped ICE
	 * connection, a closed data channel, and every in-start phase — that reach
	 * only the inner realtime session. Without this a presentation adapter would
	 * still be showing "listening" after the microphone was unplugged.
	 */
	readonly subscribe: (listener: () => void) => () => void;
	readonly dispose: () => Promise<void>;
}
export interface BrowserWorkbenchMediaOwnerOptions {
	readonly createMediaSession?: typeof createRealtimeMediaSession;
}
function capabilityFailure(): BrowserWorkbenchMediaState | null {
	if (
		!globalThis.navigator?.mediaDevices?.getUserMedia ||
		typeof globalThis.RTCPeerConnection !== "function" ||
		typeof globalThis.MediaStream !== "function" ||
		typeof globalThis.AudioContext !== "function" ||
		typeof globalThis.requestAnimationFrame !== "function" ||
		typeof globalThis.document?.createElement !== "function"
	)
		return {
			state: "unavailable",
			reason: "media_api_unavailable",
			message: "This browser cannot install realtime microphone and audio support.",
		};
	return null;
}
function unavailableFromSnapshot(snapshot: RealtimeMediaSnapshot): BrowserWorkbenchMediaState {
	const reason = snapshot.state.reason;
	return {
		state: "unavailable",
		reason: reason === "permission_denied" ? "permission_denied" : "negotiation_failed",
		message:
			"message" in snapshot.state
				? snapshot.state.message
				: "Realtime media negotiation did not become ready.",
	};
}
function executableThread(transport: BrowserWorkbenchTransport): string {
	const link = transport.snapshot()?.threadLink;
	if (link?.state !== "executable" || link.threadId === null)
		throw new Error("Realtime requires an executable current pane thread link.");
	return link.threadId;
}
function sameLeaseTarget(
	left: Pick<BrowserCommandLease, "commandId" | "paneId" | "childId" | "epoch">,
	right: Pick<BrowserCommandLease, "commandId" | "paneId" | "childId" | "epoch">,
): boolean {
	return (
		left.commandId === right.commandId &&
		left.paneId === right.paneId &&
		left.childId === right.childId &&
		left.epoch === right.epoch
	);
}
function removeAudioElements(active: MediaRun): void {
	for (const element of active.audioElements) {
		element.pause();
		element.srcObject = null;
		element.remove();
		active.audioElements.delete(element);
	}
}
function refusal<T extends RealtimeCorrelation>(
	correlation: T,
	outcome: "not_delivered" | "outcome_unknown",
): T &
	(
		| { readonly outcome: "not_delivered"; readonly reason: "rejected" }
		| { readonly outcome: "outcome_unknown"; readonly reason: "response_lost" }
	) {
	return outcome === "outcome_unknown"
		? { ...correlation, outcome, reason: "response_lost" }
		: { ...correlation, outcome: "not_delivered", reason: "rejected" };
}
/** Own local realtime media while the workbench transport owns the canvas socket. */
export function createBrowserWorkbenchMediaOwner(
	options: BrowserWorkbenchMediaOwnerOptions = {},
): BrowserWorkbenchMediaOwner {
	const createMediaSession = options.createMediaSession ?? createRealtimeMediaSession;
	let run: MediaRun | null = null;
	let disposed = false;
	let ownerState: BrowserWorkbenchMediaState = {
		state: "unavailable",
		reason: "detached",
		message: "No Codex workbench transport is attached.",
	};
	const listeners = new Set<() => void>();
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
	/** Every owner-state write goes through here so no change is published silently. */
	const setOwnerState = (state: BrowserWorkbenchMediaState): BrowserWorkbenchMediaState => {
		ownerState = state;
		notify();
		return state;
	};
	const isCurrent = (active: MediaRun): boolean => !disposed && run === active && !active.closed;
	const requireCurrent = (active: MediaRun): void => {
		if (!isCurrent(active)) throw new Error("The Codex browser media run was replaced.");
	};
	const requireCurrentStart = (
		active: MediaRun,
		operation: NonNullable<MediaRun["startOperation"]>,
	): void => {
		requireCurrent(active);
		if (active.startOperation !== operation)
			throw new Error("The Codex browser media start was replaced.");
	};
	const claim = async (active: MediaRun): Promise<BrowserCommandLease> => {
		const lease = await active.transport.claimLease();
		requireCurrent(active);
		return lease;
	};
	const publishMediaReady = async (active: MediaRun, ready: boolean): Promise<void> => {
		requireCurrent(active);
		await active.transport.setMediaReady(ready);
		requireCurrent(active);
	};
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
	const host = (active: MediaRun): RealtimeHost => ({
		createOffer: async (offer) => {
			requireCurrent(active);
			const operation = active.startOperation;
			if (operation === null) throw new Error("The realtime start operation is absent.");
			requireCurrentStart(active, operation);
			const lease = operation.lease;
			if (lease === null) throw new Error("The realtime start lease is absent.");
			if (
				String(lease.commandId) !== String(offer.sessionId) ||
				String(lease.commandId) !== String(offer.correlationId)
			)
				throw new Error("The realtime offer does not belong to the current start operation.");
			const target = active.transport.captureCommandTarget();
			if (!sameLeaseTarget(target, lease))
				throw new Error("The realtime start lease is no longer the current command target.");
			const value = await active.transport.command({
				command: "realtimeStart",
				threadId: executableThread(active.transport),
				sdp: offer.sdp,
			} as BrowserCommandDraft);
			requireCurrentStart(active, operation);
			if (
				value.outcome !== "delivered" ||
				value.realtimeAnswer === undefined ||
				value.realtimeSessionHandle === undefined
			)
				throw new Error("Realtime negotiation was unavailable or failed.");
			if (
				value.realtimeAnswer.sessionId !== offer.sessionId ||
				value.realtimeAnswer.correlationId !== offer.correlationId ||
				value.realtimeSessionHandle !== String(lease.commandId)
			)
				throw new Error("The realtime answer did not match the exact start lease.");
			active.handle = value.realtimeSessionHandle;
			return value.realtimeAnswer;
		},
		attachRemoteMedia: (attachment) => {
			requireCurrent(active);
			const element = document.createElement("audio");
			element.autoplay = true;
			element.setAttribute("playsinline", "");
			element.hidden = true;
			document.body.append(element);
			active.audioElements.add(element);
			attachment.attachTo(element);
		},
		onSemanticEvent: () => () => undefined,
		appendText: async (request) => {
			requireCurrent(active);
			const handle = active.handle;
			if (handle === null) return { ...request, outcome: "not_delivered", reason: "stale_session" };
			await claim(active);
			requireCurrent(active);
			const value = await active.transport.command({
				command: "realtimeAppendText",
				threadId: executableThread(active.transport),
				realtimeSessionHandle: handle,
				text: request.text,
			} as BrowserCommandDraft);
			requireCurrent(active);
			return value.outcome === "delivered"
				? { ...request, outcome: "delivered" }
				: refusal(request, value.outcome);
		},
		appendSpeech: async (request) => ({
			...request,
			outcome: "not_delivered",
			reason: "rejected",
		}),
		stop: async (request): Promise<CommandOutcome> => {
			requireCurrent(active);
			const handle = active.handle;
			if (handle === null) return { ...request, outcome: "not_delivered", reason: "stale_session" };
			await claim(active);
			requireCurrent(active);
			const value = await active.transport.command({
				command: "realtimeStop",
				threadId: executableThread(active.transport),
				realtimeSessionHandle: handle,
			} as BrowserCommandDraft);
			requireCurrent(active);
			if (value.outcome === "delivered") {
				active.handle = null;
				return { ...request, outcome: "delivered" };
			}
			return refusal(request, value.outcome);
		},
		recover: async (request) => ({
			...request,
			outcome: "not_delivered",
			reason: "rejected",
		}),
	});

	const closeRun = async (active: MediaRun): Promise<void> => {
		if (active.closed) return;
		active.closed = true;
		active.remove();
		active.releaseMedia();
		active.releaseMedia = () => undefined;
		const media = active.media;
		active.media = null;
		active.handle = null;
		active.startOperation = null;
		removeAudioElements(active);
		await media?.dispose();
		notify();
	};

	const transportLost = (active: MediaRun): void => {
		if (!isCurrent(active)) return;
		setOwnerState({
			state: "unavailable",
			reason: "socket_closed",
			message: "The Codex workbench socket closed.",
		});
		void closeRun(active).finally(() => {
			if (run === active) run = null;
		});
	};

	const attachTransport = async (
		transport: BrowserWorkbenchTransport,
	): Promise<BrowserWorkbenchMediaState> => {
		if (run?.transport === transport && !run.closed) return ownerState;
		const previous = run;
		const active: MediaRun = {
			transport,
			remove: () => undefined,
			releaseMedia: () => undefined,
			media: null,
			handle: null,
			startOperation: null,
			voiceStopRequested: false,
			audioElements: new Set(),
			closed: false,
		};
		active.remove = transport.subscribe(() => {
			if (!isCurrent(active)) return;
			const state = transport.state();
			if (state.kind === "connection") {
				transportLost(active);
				return;
			}
			const media = active.media;
			const phase = media?.getSnapshot().state.phase;
			if (
				transport.snapshot()?.voice.state === "unavailable" &&
				!active.voiceStopRequested &&
				media !== null &&
				media !== undefined &&
				(phase === "listening" ||
					phase === "muted" ||
					phase === "processing" ||
					phase === "speaking")
			) {
				active.voiceStopRequested = true;
				void media
					.stop()
					.catch(() => undefined)
					.finally(() => removeAudioElements(active));
			}
		});
		run = active;
		setOwnerState({ state: "attaching" });
		try {
			if (previous !== null) await closeRun(previous);
			requireCurrent(active);
			if (transport.snapshot() === null) {
				const state = transport.state();
				await closeRun(active);
				if (run === active) run = null;
				return setOwnerState({
					state: "unavailable",
					reason:
						state.kind === "connection" && state.state !== "stopped" ? "socket_closed" : "detached",
					message:
						state.kind === "connection"
							? state.reason
							: "The Codex workbench transport has no full snapshot.",
				});
			}
			active.media = createMediaSession(host(active));
			// The realtime session publishes every browser-originated change — a
			// removed microphone, a dropped ICE connection, a closed data channel,
			// and each in-start phase — to its own subscribers alone. Forwarding it
			// is what lets a presentation adapter see them at all.
			active.releaseMedia = active.media.subscribe(() => {
				if (run === active && !active.closed) notify();
			});
			const unavailable = capabilityFailure();
			if (unavailable !== null) return publishUnavailable(active, unavailable);
			await publishMediaReady(active, true);
			requireCurrent(active);
			return setOwnerState({ state: "ready" });
		} catch (error) {
			const current = isCurrent(active);
			await closeRun(active);
			if (!current || run !== active || disposed) return ownerState;
			run = null;
			return setOwnerState({
				state: "unavailable",
				reason:
					transport.state().kind === "connection" && transport.state().state !== "stopped"
						? "socket_closed"
						: "negotiation_failed",
				message: error instanceof Error ? error.message : "Media attachment failed.",
			});
		}
	};

	/** The realtime session of the current, open run, or a refusal naming why not. */
	const activeMedia = (): RealtimeMediaSession => {
		const active = run;
		const media = active?.media;
		if (active === null || active.closed || media === null || media === undefined)
			throw new Error("No realtime media session is active.");
		return media;
	};

	const attach = async (
		transport: BrowserWorkbenchTransport,
	): Promise<BrowserWorkbenchMediaState> => {
		if (disposed) return ownerState;
		if (run?.transport === transport && !run.closed) return ownerState;
		return attachTransport(transport);
	};

	const detach = async (transport: BrowserWorkbenchTransport): Promise<void> => {
		const active = run;
		if (active === null || active.transport !== transport) return;
		await closeRun(active);
		if (run !== active || disposed) return;
		run = null;
		setOwnerState({
			state: "unavailable",
			reason: "detached",
			message: "No Codex workbench transport is attached.",
		});
	};

	return Object.freeze({
		attach,
		detach,
		start: async () => {
			const active = run;
			const media = active?.media;
			if (active === null || active.closed || media === null || media === undefined)
				throw new Error("The Codex browser media owner has no active transport.");
			const operation: NonNullable<MediaRun["startOperation"]> = {
				lease: null,
			};
			active.startOperation = operation;
			try {
				const unavailable = capabilityFailure();
				if (unavailable !== null) await publishUnavailable(active, unavailable);
				else await publishMediaReady(active, true);
				requireCurrentStart(active, operation);
				const startLease = await claim(active);
				requireCurrentStart(active, operation);
				active.voiceStopRequested = false;
				operation.lease = startLease;
				const correlation: RealtimeCorrelation = {
					sessionId: parseRealtimeSessionId(String(startLease.commandId)),
					correlationId: parseRealtimeCorrelationId(String(startLease.commandId)),
				};
				try {
					removeAudioElements(active);
					const snapshot = await media.start(correlation);
					requireCurrentStart(active, operation);
					if (snapshot.state.phase === "listening") setOwnerState({ state: "ready" });
					else await publishUnavailable(active, unavailableFromSnapshot(snapshot));
					return snapshot;
				} catch (error) {
					if (isCurrent(active) && active.startOperation === operation)
						await publishUnavailable(active, {
							state: "unavailable",
							reason: "negotiation_failed",
							message: error instanceof Error ? error.message : "Realtime negotiation failed.",
						});
					throw error;
				}
			} finally {
				if (isCurrent(active) && active.startOperation === operation) active.startOperation = null;
			}
		},
		appendText: async (text: string) => {
			const active = run;
			const snapshot = active?.media?.getSnapshot();
			if (active === null || snapshot?.correlation === null || snapshot?.correlation === undefined)
				throw new Error("No realtime media session is active.");
			return host(active).appendText({ ...snapshot.correlation, text });
		},
		mute: async () => {
			const media = activeMedia();
			return media.mute();
		},
		unmute: async () => {
			const media = activeMedia();
			return media.unmute();
		},
		stop: async () => {
			const active = run;
			const media = active?.media;
			if (active === null || media === null || media === undefined)
				throw new Error("No realtime media session is active.");
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
		},
		snapshot: () => run?.media?.getSnapshot() ?? null,
		state: () => ownerState,
		subscribe: (listener: () => void) => {
			if (disposed) return () => undefined;
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		dispose: async () => {
			if (disposed) return;
			disposed = true;
			const active = run;
			run = null;
			if (active !== null) await closeRun(active);
			setOwnerState({
				state: "unavailable",
				reason: "detached",
				message: "The Codex browser media owner is disposed.",
			});
			listeners.clear();
		},
	});
}
