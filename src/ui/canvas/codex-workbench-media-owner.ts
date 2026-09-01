import type {
	BrowserCommandLease,
	BrowserSnapshot,
} from "../../shared/codex-browser-model/index.js";
import {
	parseRealtimeCorrelationId,
	parseRealtimeSessionId,
	type AnswerSdp,
	type AppendOutcome,
	type CommandOutcome,
	type RealtimeCorrelation,
	type RealtimeHost,
} from "../../shared/codex-realtime-host/index.js";
import {
	createRealtimeMediaSession,
	type RealtimeMediaSession,
	type RealtimeMediaSnapshot,
} from "../codex-realtime/index.js";

interface WorkbenchResult {
	readonly type: "codex_workbench_result";
	readonly requestId: string;
	readonly action: string;
	readonly ok: boolean;
	readonly value?: unknown;
	readonly error?: string;
}

interface WorkbenchSnapshotEnvelope {
	readonly kind: "snapshot";
	readonly sequence: number;
	readonly snapshot: BrowserSnapshot;
}

interface WorkbenchCommandResult {
	readonly kind: "command_result";
	readonly outcome: "delivered" | "not_delivered" | "outcome_unknown";
	readonly realtimeAnswer?: AnswerSdp;
	readonly realtimeSessionHandle?: string;
	readonly snapshot: BrowserSnapshot;
}

interface SocketRun {
	readonly socket: WebSocket;
	readonly pending: Map<
		string,
		{ resolve: (value: unknown) => void; reject: (error: Error) => void }
	>;
	readonly remove: () => void;
	snapshot: BrowserSnapshot | null;
	sequence: number;
	media: RealtimeMediaSession | null;
	handle: string | null;
	startLease: BrowserCommandLease | null;
	closed: boolean;
}

export interface BrowserWorkbenchMediaOwner {
	readonly attach: (socket: WebSocket) => Promise<void>;
	readonly detach: (socket: WebSocket) => Promise<void>;
	readonly start: () => Promise<RealtimeMediaSnapshot>;
	readonly appendText: (text: string) => Promise<AppendOutcome>;
	readonly stop: () => Promise<RealtimeMediaSnapshot>;
	readonly snapshot: () => RealtimeMediaSnapshot | null;
	readonly dispose: () => Promise<void>;
}

function record(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw new Error("The Codex workbench returned a malformed browser response.");
	return value as Record<string, unknown>;
}

function commandResult(value: unknown): WorkbenchCommandResult {
	const parsed = record(value);
	if (
		parsed.kind !== "command_result" ||
		(parsed.outcome !== "delivered" &&
			parsed.outcome !== "not_delivered" &&
			parsed.outcome !== "outcome_unknown")
	)
		throw new Error("The Codex workbench returned a malformed command result.");
	return parsed as unknown as WorkbenchCommandResult;
}

function target(lease: BrowserCommandLease) {
	return {
		kind: "browser_command" as const,
		commandId: lease.commandId,
		paneId: lease.paneId,
		childId: lease.childId,
		epoch: lease.epoch,
	};
}

function refusal<T extends RealtimeCorrelation>(
	correlation: T,
	outcome: WorkbenchCommandResult["outcome"],
): T &
	(
		| { readonly outcome: "not_delivered"; readonly reason: "rejected" }
		| {
				readonly outcome: "outcome_unknown";
				readonly reason: "response_lost";
		  }
	) {
	return outcome === "outcome_unknown"
		? { ...correlation, outcome, reason: "response_lost" }
		: { ...correlation, outcome: "not_delivered", reason: "rejected" };
}

function sendWorkbenchRequest(
	active: SocketRun,
	action: string,
	extra: Record<string, unknown> = {},
): Promise<unknown> {
	if (active.closed || active.socket.readyState !== WebSocket.OPEN)
		return Promise.reject(new Error("The Codex workbench socket is unavailable."));
	const requestId = globalThis.crypto.randomUUID();
	const result = new Promise<unknown>((resolve, reject) => {
		active.pending.set(requestId, { resolve, reject });
	});
	active.socket.send(
		JSON.stringify({ type: "codex_workbench_request", requestId, action, ...extra }),
	);
	return result;
}

function executableThread(active: SocketRun): string {
	const link = active.snapshot?.threadLink;
	if (link?.state !== "executable" || link.threadId === null)
		throw new Error("Realtime requires an executable current pane thread link.");
	return link.threadId;
}

/** Own one exact browser socket, RTCPeerConnection, microphone, and remote audio attachment. */
export function createBrowserWorkbenchMediaOwner(): BrowserWorkbenchMediaOwner {
	let run: SocketRun | null = null;
	let disposed = false;
	const audioElements = new Set<HTMLAudioElement>();
	const removeAudioElements = (): void => {
		for (const element of audioElements) {
			element.pause();
			element.srcObject = null;
			element.remove();
			audioElements.delete(element);
		}
	};

	const claim = async (active: SocketRun): Promise<BrowserCommandLease> =>
		record(await sendWorkbenchRequest(active, "claimLease")) as unknown as BrowserCommandLease;

	const host = (active: SocketRun): RealtimeHost => ({
		createOffer: async (offer) => {
			const lease = active.startLease;
			if (lease === null) throw new Error("The realtime start lease is absent.");
			const value = commandResult(
				await sendWorkbenchRequest(active, "command", {
					command: {
						...target(lease),
						command: "realtimeStart",
						threadId: executableThread(active),
						sdp: offer.sdp,
					},
				}),
			);
			active.snapshot = value.snapshot;
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
			const element = document.createElement("audio");
			element.autoplay = true;
			element.setAttribute("playsinline", "");
			element.hidden = true;
			document.body.append(element);
			audioElements.add(element);
			attachment.attachTo(element);
		},
		onSemanticEvent: () => () => undefined,
		appendText: async (request) => {
			const handle = active.handle;
			if (handle === null) return { ...request, outcome: "not_delivered", reason: "stale_session" };
			const lease = await claim(active);
			const value = commandResult(
				await sendWorkbenchRequest(active, "command", {
					command: {
						...target(lease),
						command: "realtimeAppendText",
						threadId: executableThread(active),
						realtimeSessionHandle: handle,
						text: request.text,
					},
				}),
			);
			active.snapshot = value.snapshot;
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
			const handle = active.handle;
			if (handle === null) return { ...request, outcome: "not_delivered", reason: "stale_session" };
			const lease = await claim(active);
			const value = commandResult(
				await sendWorkbenchRequest(active, "command", {
					command: {
						...target(lease),
						command: "realtimeStop",
						threadId: executableThread(active),
						realtimeSessionHandle: handle,
					},
				}),
			);
			active.snapshot = value.snapshot;
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

	const closeRun = async (active: SocketRun): Promise<void> => {
		if (active.closed) return;
		active.closed = true;
		active.remove();
		for (const pending of active.pending.values())
			pending.reject(new Error("The exact Codex workbench socket closed."));
		active.pending.clear();
		await active.media?.dispose();
		active.media = null;
		active.handle = null;
		removeAudioElements();
	};

	const attach = async (socket: WebSocket): Promise<void> => {
		if (disposed) throw new Error("The Codex browser media owner is disposed.");
		if (run?.socket === socket && !run.closed) return;
		if (run !== null) await closeRun(run);
		const pending = new Map<
			string,
			{ resolve: (value: unknown) => void; reject: (error: Error) => void }
		>();
		let active!: SocketRun;
		const onMessage = (messageEvent: MessageEvent): void => {
			let value: unknown;
			try {
				value = JSON.parse(String(messageEvent.data));
			} catch {
				return;
			}
			const envelope = value as {
				type?: unknown;
				message?: {
					kind?: unknown;
					sequence?: unknown;
					snapshot?: BrowserSnapshot;
					delta?: Partial<BrowserSnapshot>;
				};
			};
			if (envelope.type === "codex_workbench_event" && envelope.message !== undefined) {
				const message = envelope.message;
				if (
					message.kind === "snapshot" &&
					typeof message.sequence === "number" &&
					message.snapshot !== undefined
				) {
					active.sequence = message.sequence;
					active.snapshot = message.snapshot;
				} else if (
					message.kind === "delta" &&
					typeof message.sequence === "number" &&
					message.sequence === active.sequence + 1 &&
					message.delta !== undefined &&
					active.snapshot !== null
				) {
					active.sequence = message.sequence;
					active.snapshot = { ...active.snapshot, ...message.delta };
				}
				if (active.snapshot?.voice.state === "unavailable" && active.media !== null)
					void active.media
						.stop()
						.catch(() => undefined)
						.finally(removeAudioElements);
				return;
			}
			const candidate = value as Partial<WorkbenchResult>;
			if (candidate.type !== "codex_workbench_result" || typeof candidate.requestId !== "string")
				return;
			const waiter = pending.get(candidate.requestId);
			if (waiter === undefined) return;
			pending.delete(candidate.requestId);
			if (candidate.ok) waiter.resolve(candidate.value);
			else waiter.reject(new Error(candidate.error ?? "The Codex workbench request failed."));
		};
		const onClose = (): void => void closeRun(active);
		socket.addEventListener("message", onMessage);
		socket.addEventListener("close", onClose);
		active = {
			socket,
			pending,
			remove: () => {
				socket.removeEventListener("message", onMessage);
				socket.removeEventListener("close", onClose);
			},
			snapshot: null,
			sequence: 0,
			media: null,
			handle: null,
			startLease: null,
			closed: false,
		};
		run = active;
		try {
			const connected = record(
				await sendWorkbenchRequest(active, "connect"),
			) as unknown as WorkbenchSnapshotEnvelope;
			if (connected.kind !== "snapshot")
				throw new Error("The Codex workbench connect result is invalid.");
			active.snapshot = connected.snapshot;
			active.media = createRealtimeMediaSession(host(active));
			const subscribed = record(
				await sendWorkbenchRequest(active, "subscribe"),
			) as unknown as WorkbenchSnapshotEnvelope & { readonly sequence: number };
			if (subscribed.kind !== "snapshot")
				throw new Error("The Codex workbench subscribe result is invalid.");
			active.sequence = subscribed.sequence;
			active.snapshot = subscribed.snapshot;
		} catch (error) {
			if (run === active) run = null;
			await closeRun(active);
			throw error;
		}
	};

	return Object.freeze({
		attach,
		detach: async (socket: WebSocket) => {
			if (run?.socket !== socket) return;
			const active = run;
			run = null;
			await closeRun(active);
		},
		start: async () => {
			const active = run;
			if (active === null || active.closed || active.media === null)
				throw new Error("The Codex browser media owner has no active socket.");
			active.startLease = await claim(active);
			const correlation = {
				sessionId: parseRealtimeSessionId(String(active.startLease.commandId)),
				correlationId: parseRealtimeCorrelationId(String(active.startLease.commandId)),
			};
			try {
				removeAudioElements();
				return await active.media.start(correlation);
			} finally {
				active.startLease = null;
			}
		},
		appendText: async (text: string) => {
			const active = run;
			const snapshot = active?.media?.getSnapshot();
			if (active === null || snapshot?.correlation === null || snapshot?.correlation === undefined)
				throw new Error("No realtime media session is active.");
			return host(active).appendText({ ...snapshot.correlation, text });
		},
		stop: async () => {
			const media = run?.media;
			if (media === null || media === undefined)
				throw new Error("No realtime media session is active.");
			try {
				return await media.stop();
			} finally {
				removeAudioElements();
			}
		},
		snapshot: () => run?.media?.getSnapshot() ?? null,
		dispose: async () => {
			if (disposed) return;
			disposed = true;
			const active = run;
			run = null;
			if (active !== null) await closeRun(active);
		},
	});
}
