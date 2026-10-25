// One page view's voice client: it opens the socket with the tab's session
// id, attaches the transport and the media owner to it, publishes one frozen
// state, and runs each page action once. An uncertain delivery stays in that
// state as a failure the page shows; nothing retries it.

import type { RealtimeState } from "#shared/protocol/realtime-contract.ts";
import { INITIAL_REALTIME_STATE } from "#shared/rules/realtime-state.ts";
import type { BrowserWorkbenchMediaOwner } from "#ui/clients/media/media-state.ts";
import { createBrowserWorkbenchMediaOwner } from "#ui/clients/media/media-owner.ts";
import { createBrowserWorkbenchTransport } from "#ui/clients/transport/transport.ts";
import {
	BrowserWorkbenchTransportError,
	type BrowserCommandDraft,
	type BrowserWorkbenchSocket,
	type BrowserWorkbenchTransport,
} from "#ui/state/transport/contract.ts";
import type {
	VoiceClient,
	VoiceClientFailure,
	VoiceClientOptions,
	VoiceClientSnapshot,
	VoiceClientVoice,
} from "#ui/state/voice-client/contract.ts";

/** The socket the client opens: a pane socket it can also close. */
interface VoiceClientSocket extends BrowserWorkbenchSocket {
	readonly close: () => void;
}

/** What the client runs over; the real browser in production, doubles in tests. */
interface VoiceClientOwners {
	readonly transport: BrowserWorkbenchTransport;
	readonly media: BrowserWorkbenchMediaOwner;
	/** Open a socket to the URL. */
	readonly openSocket: (url: string) => VoiceClientSocket;
	/** The tab's session id, kept across reloads of this tab. */
	readonly tabSessionId: () => string;
	/** The page location that a socket path resolves against. */
	readonly pageUrl: () => string;
}

const UNCERTAIN = "Delivery is uncertain. Refresh the conversation before trying another action.";
const TAB_SESSION_KEY = "codex-realtime-voice:tab";

/**
 * Connect one page view to the voice server through the real browser.
 * @param options The socket path and the pane.
 * @returns The client. Call `connect()` to open the socket.
 */
function createVoiceClient(options: VoiceClientOptions): VoiceClient {
	return openVoiceClient(options, {
		transport: createBrowserWorkbenchTransport(),
		media: createBrowserWorkbenchMediaOwner(),
		/**
		 * A browser WebSocket.
		 * @param url Where it connects.
		 * @returns The socket.
		 */
		openSocket: (url) => new WebSocket(url),
		/**
		 * The id kept for this tab.
		 * @returns The id.
		 */
		tabSessionId: () => storedTabSessionId(TAB_SESSION_KEY),
		/**
		 * The page's own location.
		 * @returns The URL.
		 */
		pageUrl: () => location.href,
	});
}

/**
 * The client over the owners it is given.
 * @param options The socket path and the pane.
 * @param owners The transport, the media owner, the socket factory and the tab identity.
 * @returns The client.
 */
function openVoiceClient(options: VoiceClientOptions, owners: VoiceClientOwners): VoiceClient {
	const { transport, media } = owners;
	const listeners = new Set<() => void>();
	let socket: VoiceClientSocket | null = null;
	let failure: VoiceClientFailure | null = null;
	let pending = 0;
	let disposed = false;
	let current = read();

	/**
	 * Project the owners into one frozen state.
	 * @returns The state.
	 */
	function read(): VoiceClientSnapshot {
		const state = transport.state();
		return Object.freeze({
			connection: state.connection,
			server: state.snapshot,
			voice: voiceOf(media),
			busy: pending > 0,
			failure,
			intent: transport.capabilities().canCommand ? transport.captureCommandIntent() : null,
		});
	}

	/** Publish a new state to every listener. */
	const publish = () => {
		if (disposed) return;
		current = read();
		for (const listener of listeners) listener();
	};
	const unsubscribeTransport = transport.subscribe(publish);
	const unsubscribeMedia = media.subscribe(publish);

	/**
	 * Run one action, keeping its failure visible.
	 * @param operation The action.
	 * @param interrupt Whether it may run during another action.
	 * @returns Whether it completed.
	 */
	const run = async (operation: () => Promise<unknown>, interrupt = false): Promise<boolean> => {
		if ((pending > 0 && !interrupt) || disposed) return false;
		pending++;
		failure = null;
		publish();
		try {
			await operation();
			return true;
		} catch (error) {
			failure = failureOf(error);
			return false;
		} finally {
			pending--;
			publish();
		}
	};

	/**
	 * Deliver one human command once.
	 * @param draft The command.
	 */
	const command = async (draft: BrowserCommandDraft) => {
		delivered(await transport.executeCommand(draft));
	};

	/**
	 * The executable conversation, created when the link is still unbound.
	 * @returns The thread id.
	 */
	const ensureConversation = async () => {
		if (transport.snapshot()?.threadLink.state === "unbound")
			await command({ command: "threadLinkCreate" });
		const link = transport.snapshot()?.threadLink;
		if (link?.state !== "executable")
			throw new Error("The conversation is not ready. Refresh its state before continuing.");
		return link.threadId;
	};

	/** Release the socket and the owners attached to it. */
	const release = async () => {
		const previous = socket;
		if (previous === null) return;
		socket = null;
		await media.detach(transport);
		await transport.detach(previous);
		previous.close();
	};

	/**
	 * Open the socket again and attach the owners to it. A dispose while it
	 * runs opens no socket, or closes the one it opened.
	 * @returns Whether it opened.
	 */
	const connect = async () => {
		const completed = await run(async () => {
			await release();
			if (disposed) return;
			const next = owners.openSocket(socketUrl(options, owners.pageUrl(), owners.tabSessionId()));
			socket = next;
			await opened(next);
			if (disposed) return;
			await transport.attach(next);
			await media.attach(transport);
			await transport.accountRead();
		});
		return completed && !disposed;
	};

	/**
	 * Cancel the sign-in the server shows as pending.
	 * @returns Whether it completed.
	 */
	const cancelSignIn = () =>
		run(async () => {
			const login = transport.snapshot()?.login;
			if (login?.state === "pending")
				await command({ command: "accountLoginCancel", loginId: login.loginId });
		});

	/**
	 * Interrupt the workhorse's running turn, if one runs.
	 * @returns Whether it completed.
	 */
	const stopWork = () =>
		run(async () => {
			const state = transport.snapshot();
			const turn = state?.timeline?.turns.findLast((entry) => entry.status === "inProgress");
			if (state?.threadLink.state !== "executable" || turn === undefined) return;
			await command({
				command: "interrupt",
				threadId: state.threadLink.threadId,
				turnId: turn.turnId,
			});
		}, true);

	/**
	 * Answer one approval against the intent that rendered it.
	 * @param approval The request.
	 * @param response The answer.
	 * @param intent The rendered state's intent.
	 * @returns Whether it was delivered.
	 */
	const answerApproval: VoiceClient["answerApproval"] = (approval, response, intent) =>
		run(async () => {
			const draft: BrowserCommandDraft = {
				command: "approvalRespond",
				requestId: approval.requestId,
				approvalId: approval.approvalId,
				response,
			};
			delivered(await transport.executeCommand(draft, intent));
		});

	/**
	 * Hear every publication.
	 * @param listener The listener.
	 * @returns The unsubscribe.
	 */
	const subscribe = (listener: () => void) => {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	};

	/** Stop voice, release the socket and end every subscription. */
	const dispose = async () => {
		disposed = true;
		unsubscribeTransport();
		unsubscribeMedia();
		listeners.clear();
		try {
			await media.dispose();
		} finally {
			try {
				await transport.dispose();
			} finally {
				socket?.close();
				socket = null;
			}
		}
	};

	const client: VoiceClient = {
		connect,
		/**
		 * Read the server's state again.
		 * @returns Whether it completed.
		 */
		refresh: () => run(() => transport.refresh()),
		/**
		 * Start a sign-in.
		 * @param login How the account signs in.
		 * @returns Whether it was delivered.
		 */
		signIn: (login = { type: "chatgpt" }) => run(() => command({ command: "accountLogin", login })),
		cancelSignIn,
		/**
		 * Sign the account out.
		 * @returns Whether it was delivered.
		 */
		signOut: () => run(() => command({ command: "accountLogout" })),
		/**
		 * Send a message to the workhorse.
		 * @param message The message.
		 * @returns Whether it was delivered.
		 */
		send: (message) =>
			run(async () =>
				command({ command: "start", threadId: await ensureConversation(), prompt: message }),
			),
		/**
		 * Start the coordinator's voice once the conversation exists.
		 * @returns Whether it started.
		 */
		startVoice: () =>
			run(async () => {
				await ensureConversation();
				await media.start();
			}),
		/**
		 * Stop voice, even during another action.
		 * @returns Whether it stopped.
		 */
		stopVoice: () => run(() => media.stop(), true),
		/**
		 * Silence or restore the microphone.
		 * @param muted Whether to silence it.
		 * @returns Whether it changed.
		 */
		setMuted: (muted) => run(() => (muted ? media.mute() : media.unmute())),
		stopWork,
		answerApproval,
		/**
		 * The current state.
		 * @returns The state.
		 */
		snapshot: () => current,
		subscribe,
		dispose,
	};
	return Object.freeze(client);
}

/**
 * The tab's session id, minted once and kept in `sessionStorage`.
 * @param key The storage key.
 * @returns The id.
 */
function storedTabSessionId(key: string): string {
	const id = sessionStorage.getItem(key) ?? crypto.randomUUID();
	sessionStorage.setItem(key, id);
	return id;
}

/**
 * The socket URL with the pane and tab identity.
 * @param options The socket path and the pane.
 * @param pageUrl The page location the path resolves against.
 * @param tabSessionId The tab's session id.
 * @returns The URL.
 */
function socketUrl(options: VoiceClientOptions, pageUrl: string, tabSessionId: string): string {
	const url = new URL(options.socketPath, pageUrl);
	if (url.protocol === "http:") url.protocol = "ws:";
	if (url.protocol === "https:") url.protocol = "wss:";
	url.searchParams.set("paneId", options.paneId ?? "main");
	url.searchParams.set("tabSessionId", tabSessionId);
	return url.href;
}

/**
 * The voice run as the page shows it.
 * @param media The media owner.
 * @returns The phase, whether a run can start, and the problem.
 */
function voiceOf(media: BrowserWorkbenchMediaOwner): VoiceClientVoice {
	const owner = media.state();
	const run = media.snapshot()?.state ?? INITIAL_REALTIME_STATE;
	const problem = owner.state === "unavailable" ? owner.message : runProblem(run);
	return Object.freeze({ phase: run.phase, available: owner.state === "ready", problem });
}

/**
 * Why a voice run failed.
 * @param run The run's state.
 * @returns The reason, or null while it has not failed.
 */
function runProblem(run: RealtimeState): string | null {
	return run.phase === "recoverable_error" || run.phase === "terminal_error" ? run.reason : null;
}

/**
 * Refuse a command result that was not delivered.
 * @param result The command result.
 * @param result.outcome Whether it reached the server.
 * @param result.message The server's words for a refusal.
 */
function delivered(result: { readonly outcome: string; readonly message: string | null }): void {
	if (result.outcome === "delivered") return;
	if (result.outcome === "outcome_unknown") throw new UncertainDelivery();
	throw new Error(result.message ?? "The action was not delivered.");
}

/** A command whose delivery cannot be known. */
class UncertainDelivery extends Error {
	override readonly name = "UncertainDelivery";

	/** Build it with the words the page shows. */
	constructor() {
		super(UNCERTAIN);
	}
}

/**
 * The failure the page shows for a thrown value.
 * @param error The thrown value.
 * @returns The failure, uncertain when the delivery cannot be known.
 */
function failureOf(error: unknown): VoiceClientFailure {
	if (
		error instanceof UncertainDelivery ||
		(error instanceof BrowserWorkbenchTransportError && error.outcome === "outcome_unknown")
	)
		return Object.freeze({ message: UNCERTAIN, uncertain: true });
	return Object.freeze({
		message: error instanceof Error ? error.message : String(error),
		uncertain: false,
	});
}

/**
 * Wait for a socket to open.
 * @param socket The socket.
 * @returns Its opening, or the failure that ended it.
 */
function opened(socket: VoiceClientSocket): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		socket.addEventListener("open", () => resolve(), { once: true });
		socket.addEventListener(
			"error",
			() => reject(new Error("The voice connection failed. Reconnect to try again.")),
			{ once: true },
		);
		socket.addEventListener("close", () => reject(new Error("The voice connection closed.")), {
			once: true,
		});
	});
}

export { createVoiceClient, openVoiceClient, type VoiceClientOwners, type VoiceClientSocket };
