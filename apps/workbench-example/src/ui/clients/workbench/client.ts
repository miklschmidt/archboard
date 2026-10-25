import {
	createBrowserWorkbenchTransport,
	createBrowserWorkbenchMediaOwner,
	BrowserWorkbenchTransportError,
	type BrowserCommandDraft,
	type BrowserWorkbenchCommandIntent,
} from "@archboard/codex-realtime-voice/browser";
import {
	ExampleConfigurationSchema,
	type ExampleConfiguration,
} from "#shared/protocol/application.ts";

/**
 * Own the page connection and compose the shared transport and media owners.
 * @returns The operation result or its completion.
 */
function createExampleClient() {
	const transport = createBrowserWorkbenchTransport();
	const media = createBrowserWorkbenchMediaOwner();
	const listeners = new Set<() => void>();
	let configuration: ExampleConfiguration | null = null;
	let socket: WebSocket | null = null;
	let error: string | null = null;
	let pending = 0;
	let disposed = false;
	/**
	 * Project the current shared owners for the page.
	 * @returns The operation result or its completion.
	 */
	const read = () => ({
		configuration,
		transport: transport.state(),
		media: media.snapshot(),
		mediaState: media.state(),
		busy: pending > 0,
		error,
		intent: transport.capabilities().canCommand ? transport.captureCommandIntent() : null,
	});
	let current = read();
	/**
	 * Notify subscribers after owner or action state changes.
	 */
	const publish = () => {
		if (disposed) return;
		current = read();
		for (const listener of listeners) listener();
	};
	const unsubscribeTransport = transport.subscribe(publish);
	const unsubscribeMedia = media.subscribe(publish);

	/**
	 * Run one page action and preserve uncertain delivery as an error.
	 * @param operation The action to complete.
	 * @param interrupt Whether this stop can run during another action.
	 * @returns The operation result or its completion.
	 */
	const run = async (operation: () => Promise<unknown>, interrupt = false): Promise<boolean> => {
		if ((pending > 0 && !interrupt) || disposed) return false;
		pending++;
		error = null;
		publish();
		try {
			await operation();
			return true;
		} catch (failure) {
			error = actionError(failure);
			return false;
		} finally {
			pending--;
			publish();
		}
	};
	/**
	 * Deliver one human command through shared authority acquisition.
	 * @param draft The command composed by the user.
	 * @returns The operation result or its completion.
	 */
	const command = async (draft: BrowserCommandDraft) => {
		const result = await transport.executeCommand(draft);
		if (result.outcome !== "delivered")
			throw new Error(
				result.outcome === "outcome_unknown"
					? "Delivery is uncertain. Refresh the conversation before trying another action."
					: (result.message ?? "The action was not delivered."),
			);
	};
	/**
	 * Create a conversation only when the current link is unbound.
	 * @returns The operation result or its completion.
	 */
	const ensureConversation = async () => {
		if (transport.snapshot()?.threadLink.state === "unbound")
			await command({ command: "threadLinkCreate" });
		const link = transport.snapshot()?.threadLink;
		if (link?.state !== "executable")
			throw new Error("The conversation is not ready. Refresh its state before continuing.");
		return link.threadId;
	};
	/**
	 * Connect this page with its stable tab identity.
	 * @returns The operation result or its completion.
	 */
	const connect = () =>
		run(async () => {
			if (socket !== null) {
				await media.detach(transport);
				await transport.detach(socket);
				socket.close();
			}
			const response = await fetch("/api/config");
			if (!response.ok)
				throw new Error(`The workbench configuration could not be read (${response.status}).`);
			configuration = ExampleConfigurationSchema.parse(await response.json());
			if (disposed) return;
			const key = "codex-workbench-tab";
			const tab = sessionStorage.getItem(key) ?? crypto.randomUUID();
			sessionStorage.setItem(key, tab);
			const url = new URL(configuration.socketPath, location.href);
			url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
			url.searchParams.set("paneId", "main");
			url.searchParams.set("tabSessionId", tab);
			const next = new WebSocket(url);
			socket = next;
			await new Promise<void>((resolve, reject) => {
				next.addEventListener("open", () => resolve(), { once: true });
				next.addEventListener(
					"error",
					() => reject(new Error("The workbench connection failed. Reconnect to try again.")),
					{ once: true },
				);
				next.addEventListener(
					"close",
					() => reject(new Error("The workbench connection closed.")),
					{ once: true },
				);
			});
			await transport.attach(next);
			await media.attach(transport);
			await transport.accountRead();
		});
	return Object.freeze({
		connect,
		/**
		 * Read the stable page projection.
		 * @returns The operation result or its completion.
		 */
		snapshot: () => current,
		/**
		 * Observe page changes and return subscription cleanup.
		 * @param listener The page change subscriber.
		 * @returns The operation result or its completion.
		 */
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		/**
		 * Read current server state without repeating a command.
		 * @returns The operation result or its completion.
		 */
		refresh: () => run(() => transport.refresh()),
		/**
		 * Start a private ChatGPT account sign-in.
		 * @returns The operation result or its completion.
		 */
		login: () => run(() => command({ command: "accountLogin", login: { type: "chatgpt" } })),
		/**
		 * Cancel the currently displayed login.
		 * @returns The operation result or its completion.
		 */
		cancelLogin: () =>
			run(async () => {
				const login = transport.snapshot()?.login;
				if (login?.state === "pending")
					await command({ command: "accountLoginCancel", loginId: login.loginId });
			}),
		/**
		 * Send one prompt to the admitted checkout workhorse.
		 * @param prompt The prompt to deliver.
		 * @returns The operation result or its completion.
		 */
		send: (prompt: string) =>
			run(async () => command({ command: "start", threadId: await ensureConversation(), prompt })),
		/**
		 * Start shared media after the conversation is ready.
		 * @returns The operation result or its completion.
		 */
		startVoice: () =>
			run(async () => {
				await ensureConversation();
				await media.start();
			}),
		/**
		 * Stop voice while retaining the workhorse.
		 * @returns The operation result or its completion.
		 */
		stopVoice: () => run(() => media.stop(), true),
		/**
		 * Change only the local microphone capture state.
		 * @returns The operation result or its completion.
		 */
		toggleMute: () =>
			run(() => (media.snapshot()?.state.phase === "muted" ? media.unmute() : media.mute())),
		/**
		 * Interrupt the current workhorse without stopping voice.
		 * @returns The operation result or its completion.
		 */
		stopWork: () =>
			run(async () => {
				const state = transport.snapshot();
				const turn = state?.timeline?.turns.findLast((entry) => entry.status === "inProgress");
				if (state?.threadLink.state !== "executable" || turn === undefined) return;
				await command({
					command: "interrupt",
					threadId: state.threadLink.threadId,
					turnId: turn.turnId,
				});
			}, true),
		/**
		 * Deliver one response against its displayed request and intent.
		 * @param draft The command composed by the user.
		 * @param intent The intent captured with the displayed request.
		 * @returns The operation result or its completion.
		 */
		respond: (
			draft: Extract<BrowserCommandDraft, { command: "approvalRespond" }>,
			intent: BrowserWorkbenchCommandIntent,
		) => {
			return run(async () => {
				const result = await transport.executeCommand(draft, intent);
				if (result.outcome !== "delivered")
					throw new Error(result.message ?? `Approval response: ${result.outcome}.`);
			});
		},
		/**
		 * Release the page media, transport, and socket owners.
		 * @returns The operation result or its completion.
		 */
		dispose: async () => {
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
				}
			}
		},
	});
}

/**
 * Describe failed delivery without suggesting an automatic retry.
 * @param failure The failure value.
 * @returns The operation result or its completion.
 */
function actionError(failure: unknown): string {
	if (failure instanceof BrowserWorkbenchTransportError && failure.outcome === "outcome_unknown")
		return "Delivery is uncertain. Refresh the conversation before trying another action.";
	return failure instanceof Error ? failure.message : String(failure);
}

type ExampleClient = ReturnType<typeof createExampleClient>;
type ExampleClientSnapshot = ReturnType<ExampleClient["snapshot"]>;
export { createExampleClient, type ExampleClient, type ExampleClientSnapshot };
