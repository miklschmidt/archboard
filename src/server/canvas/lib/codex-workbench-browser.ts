import { z } from "zod";
import { WebSocket } from "ws";

import type {
	BrowserConnectionInstance,
	BrowserGatewayMessage,
	BrowserSnapshot,
	BrowserWorkbenchConnection,
	CodexWorkbenchGateway,
} from "@/server/codex-workbench";
import type { BrowserGatewayAction } from "@/shared/codex-browser-gateway";

const RequestIdSchema = z.string().min(1).max(128);
const RequestBase = { type: z.literal("codex_workbench_request"), requestId: RequestIdSchema };

/**
 * The ingress arms name their action through the shared gateway envelope, so an
 * action the browser can send and this schema does not accept — or the reverse —
 * is a compile error rather than a request refused at runtime. The arms stay
 * written out because their payloads differ; only the action vocabulary is
 * shared.
 * @param action The action.
 * @returns The literal schema for it.
 */
function gatewayAction<Action extends BrowserGatewayAction>(action: Action): z.ZodLiteral<Action> {
	return z.literal(action);
}

const BrowserRequestSchema = z.discriminatedUnion("action", [
	z.object({ ...RequestBase, action: gatewayAction("connect") }).strict(),
	z.object({ ...RequestBase, action: gatewayAction("snapshot") }).strict(),
	z.object({ ...RequestBase, action: gatewayAction("claimLease") }).strict(),
	z.object({ ...RequestBase, action: gatewayAction("renewLease") }).strict(),
	z.object({ ...RequestBase, action: gatewayAction("releaseLease") }).strict(),
	z.object({ ...RequestBase, action: gatewayAction("mediaReady"), ready: z.boolean() }).strict(),
	z.object({ ...RequestBase, action: gatewayAction("accountRead") }).strict(),
	z.object({ ...RequestBase, action: gatewayAction("command"), command: z.unknown() }).strict(),
	z.object({ ...RequestBase, action: gatewayAction("subscribe") }).strict(),
	z.object({ ...RequestBase, action: gatewayAction("close") }).strict(),
]);

type BrowserRequest = z.infer<typeof BrowserRequestSchema>;

/** Every gateway action has an ingress arm; an unlisted one fails to compile. */
type AssertNoUnhandledAction<Action extends never> = Action;
type BrowserRequestActionsAreExhaustive = AssertNoUnhandledAction<
	Exclude<BrowserGatewayAction, BrowserRequest["action"]>
>;

interface CanvasCodexBrowserSocketSend {
	readonly send: (message: unknown) => Promise<void>;
}

interface CanvasCodexBrowserWebSocket {
	readonly readyState: number;
	readonly send: (data: string, callback: (error?: Error) => void) => void;
}

/**
 * Adapt the production callback-based WebSocket into an awaitable send
 * boundary.
 * @param socket The socket.
 * @returns The send boundary.
 */
function createCanvasCodexBrowserSocketSend(
	socket: CanvasCodexBrowserWebSocket,
): CanvasCodexBrowserSocketSend {
	return Object.freeze({
		/**
		 * Send one message and wait for the socket to have taken it, so a failed
		 * write is a failed publication rather than a silent one.
		 * @param message The message.
		 */
		send: async (message: unknown): Promise<void> => {
			if (socket.readyState !== WebSocket.OPEN) {
				throw new Error("The Codex browser WebSocket is not open.");
			}
			await new Promise<void>((resolve, reject) => {
				try {
					socket.send(JSON.stringify(message), (error) =>
						error === undefined ? resolve() : reject(error),
					);
				} catch (error) {
					reject(error);
				}
			});
		},
	});
}

interface CanvasCodexBrowserSocketOwnerOptions {
	readonly gateway: CodexWorkbenchGateway;
	/** Resolve the pane from server-owned socket registration, never request bytes. */
	readonly paneForBrowser: (browserId: string) => string | null;
}

interface CanvasCodexBrowserSocketOwner {
	/**
	 * Establish replacement ownership at socket acceptance, before the retired
	 * instance can deliver its close event. A first-time pane may still defer
	 * connection until it has registered its authoritative pane id.
	 */
	readonly accept: (instance: BrowserConnectionInstance, browserId: string) => void;
	readonly handle: (
		instance: BrowserConnectionInstance,
		browserId: string,
		input: unknown,
		transport: CanvasCodexBrowserSocketSend,
	) => Promise<void>;
	readonly close: (instance: BrowserConnectionInstance, browserId: string) => Promise<void>;
	/** Wait for every event publication and close already owned by this generation. */
	readonly drain: () => Promise<void>;
	readonly dispose: () => void;
}

/** Everything one ingress arm answers a request from. */
interface BrowserRequestCall {
	readonly request: BrowserRequest;
	readonly connection: BrowserWorkbenchConnection;
	readonly transport: CanvasCodexBrowserSocketSend;
	readonly instance: BrowserConnectionInstance;
	readonly browserId: string;
}

/**
 * What one failure says to the browser, whether or not it was thrown as an
 * Error.
 * @param error What failed.
 * @returns The wording.
 */
function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Answer one request.
 * @param transport The socket.
 * @param request What was asked.
 * @param value The answer.
 */
async function sendResult(
	transport: CanvasCodexBrowserSocketSend,
	request: BrowserRequest,
	value: unknown,
): Promise<void> {
	await transport.send({
		type: "codex_workbench_result",
		requestId: request.requestId,
		action: request.action,
		ok: true,
		value,
	});
}

/**
 * Answer one request with a snapshot, and only then tell the gateway the
 * browser has it: a publication the socket never took must not be counted.
 * @param transport The socket.
 * @param request What was asked.
 * @param connection The gateway connection.
 * @param value The answer.
 * @param value.snapshot The snapshot the browser now has.
 */
async function sendPublishedResult(
	transport: CanvasCodexBrowserSocketSend,
	request: BrowserRequest,
	connection: BrowserWorkbenchConnection,
	value: { readonly snapshot: BrowserSnapshot },
): Promise<void> {
	await sendResult(transport, request, value);
	connection.confirmPublished(value.snapshot);
}

/**
 * Own the public canvas WebSocket bridge for one installed gateway generation.
 * @param options The gateway, and how a browser's pane is resolved.
 * @returns The owner.
 */
function createCanvasCodexBrowserSocketOwner(
	options: CanvasCodexBrowserSocketOwnerOptions,
): CanvasCodexBrowserSocketOwner {
	const subscriptions = new Map<BrowserConnectionInstance, () => void>();
	const connections = new Map<BrowserConnectionInstance, BrowserWorkbenchConnection>();
	const closePromises = new WeakMap<BrowserConnectionInstance, Promise<void>>();
	const activeCloses = new Set<Promise<void>>();
	const activePublications = new Set<Promise<void>>();
	const closeFailures: unknown[] = [];
	// One event failure is enough to fail drain. Retaining only the first keeps a
	// broken socket from growing an error history before teardown observes it.
	let publicationFailure: Error | null = null;
	let disposed = false;

	/**
	 * The gateway connection one socket is served by, replaced when the browser
	 * has moved to another pane.
	 * @param instance The socket.
	 * @param browserId The browser.
	 * @returns The connection.
	 */
	const connectionFor = (
		instance: BrowserConnectionInstance,
		browserId: string,
	): BrowserWorkbenchConnection => {
		if (disposed) {
			throw new Error("The Codex browser socket owner is stopped.");
		}
		const paneId = options.paneForBrowser(browserId);
		if (paneId === null) {
			throw new Error("The browser has not registered an authoritative canvas pane.");
		}
		const previous = connections.get(instance);
		if (previous?.paneId === paneId) {
			return previous;
		}
		subscriptions.get(instance)?.();
		subscriptions.delete(instance);
		const connection = options.gateway.connect(browserId, paneId, instance);
		connections.set(instance, connection);
		return connection;
	};

	/**
	 * Take ownership of one accepted socket, deferring a browser that has not
	 * registered its pane yet.
	 * @param instance The socket.
	 * @param browserId The browser.
	 */
	const accept = (instance: BrowserConnectionInstance, browserId: string): void => {
		if (disposed) {
			throw new Error("The Codex browser socket owner is stopped.");
		}
		if (options.paneForBrowser(browserId) === null) {
			return;
		}
		connectionFor(instance, browserId);
	};

	/**
	 * Hold one publication until it settles, so teardown waits for it and its
	 * failure is not lost.
	 * @param publication The publication.
	 * @param connection The connection it was published on.
	 * @param message What was published.
	 */
	const trackPublication = (
		publication: Promise<void>,
		connection: BrowserWorkbenchConnection,
		message: BrowserGatewayMessage,
	): void => {
		activePublications.add(publication);
		void publication.then(
			() => activePublications.delete(publication),
			(error) => {
				activePublications.delete(publication);
				publicationFailure ??= new Error(
					`Codex browser event publication failed for browser ${JSON.stringify(connection.browserId)}, pane ${JSON.stringify(connection.paneId)}, ${message.kind} sequence ${message.sequence}: ${errorMessage(error)}`,
					{ cause: error },
				);
			},
		);
	};

	/**
	 * Tell the browser one request failed, and why.
	 * @param transport The socket.
	 * @param requestId What was asked, when the request parsed.
	 * @param action What it asked for, when the request parsed.
	 * @param error What failed.
	 * @returns When the socket has taken the refusal.
	 */
	const failure = async (
		transport: CanvasCodexBrowserSocketSend,
		requestId: string | null,
		action: string | null,
		error: unknown,
	): Promise<void> =>
		transport.send({
			type: "codex_workbench_result",
			requestId,
			action,
			ok: false,
			error: errorMessage(error),
		});

	/**
	 * Close one socket's connection, once: a second close is the first one's
	 * outcome, so a close is never done twice.
	 * @param instance The socket.
	 * @param browserId The browser.
	 * @returns The close.
	 */
	const close = (instance: BrowserConnectionInstance, browserId: string): Promise<void> => {
		const existing = closePromises.get(instance);
		if (existing !== undefined) {
			return existing;
		}
		const owned = (async (): Promise<void> => {
			subscriptions.get(instance)?.();
			subscriptions.delete(instance);
			const connection = connections.get(instance);
			connections.delete(instance);
			if (connection !== undefined) {
				await connection.close();
				return;
			}
			const paneId = options.paneForBrowser(browserId);
			if (paneId !== null) {
				await options.gateway.closeConnection(browserId, paneId, instance);
			}
		})();
		closePromises.set(instance, owned);
		activeCloses.add(owned);
		void owned.then(
			() => activeCloses.delete(owned),
			(error) => {
				activeCloses.delete(owned);
				closeFailures.push(error);
			},
		);
		return owned;
	};

	/**
	 * One ingress arm per action the browser can send. The table is keyed by the
	 * action vocabulary itself, so an action without an arm fails to compile;
	 * each arm re-reads the action it is keyed by, which is what narrows the
	 * request to the payload that arm answers.
	 */
	const requests: Readonly<
		Record<BrowserRequest["action"], (call: BrowserRequestCall) => Promise<void>>
	> = {
		/**
		 * Answer with the pane's current snapshot.
		 * @param call The request, the connection it acts on, and the socket.
		 */
		connect: async (call) => {
			const { request, connection, transport } = call;
			await sendPublishedResult(transport, request, connection, connection.snapshot());
		},
		/**
		 * Re-read cached owner state before projecting it: this is what makes a
		 * queue refresh a genuine read rather than a redraw of the last command.
		 * @param call The request, the connection it acts on, and the socket.
		 */
		snapshot: async (call) => {
			const { request, connection, transport } = call;
			await connection.refreshProjection();
			await sendPublishedResult(transport, request, connection, connection.snapshot());
		},
		/**
		 * Take the pane's write lease.
		 * @param call The request, the connection it acts on, and the socket.
		 */
		claimLease: async (call) => {
			const { request, connection, transport } = call;
			await sendResult(transport, request, connection.claimLease());
		},
		/**
		 * Keep the pane's write lease.
		 * @param call The request, the connection it acts on, and the socket.
		 */
		renewLease: async (call) => {
			const { request, connection, transport } = call;
			await sendResult(transport, request, connection.renewLease());
		},
		/**
		 * Give up the pane's write lease.
		 * @param call The request, the connection it acts on, and the socket.
		 */
		releaseLease: async (call) => {
			const { request, connection, transport } = call;
			await sendResult(transport, request, connection.releaseLease());
		},
		/**
		 * Say whether this pane can play voice yet.
		 * @param call The request, the connection it acts on, and the socket.
		 */
		mediaReady: async (call) => {
			const { request, connection, transport } = call;
			if (request.action !== "mediaReady") return;
			await sendPublishedResult(
				transport,
				request,
				connection,
				connection.setMediaReady(request.ready),
			);
		},
		/**
		 * Read the Codex account.
		 * @param call The request, the connection it acts on, and the socket.
		 */
		accountRead: async (call) => {
			const { request, connection, transport } = call;
			await sendPublishedResult(transport, request, connection, await connection.accountRead());
		},
		/**
		 * Run one workbench command.
		 * @param call The request, the connection it acts on, and the socket.
		 */
		command: async (call) => {
			const { request, connection, transport } = call;
			if (request.action !== "command") return;
			await sendPublishedResult(
				transport,
				request,
				connection,
				await connection.command(request.command),
			);
		},
		/**
		 * Start publishing events to this socket, replacing any earlier
		 * subscription it had.
		 * @param call The request, the connection it acts on, and the socket.
		 */
		subscribe: async (call) => {
			const { request, connection, transport, instance } = call;
			subscriptions.get(instance)?.();
			const unsubscribe = connection.subscribe((message: BrowserGatewayMessage) => {
				const publication = (async (): Promise<void> => {
					await transport.send({ type: "codex_workbench_event", message });
					connection.confirmPublished(message);
				})();
				trackPublication(publication, connection, message);
			});
			subscriptions.set(instance, unsubscribe);
			await sendPublishedResult(transport, request, connection, connection.snapshot());
		},
		/**
		 * Close this socket's connection.
		 * @param call The request, the connection it acts on, and the socket.
		 */
		close: async (call) => {
			const { request, transport, instance, browserId } = call;
			await close(instance, browserId);
			await sendResult(transport, request, null);
		},
	};

	/**
	 * Take one request off the socket: parse it, resolve the connection it acts
	 * on, and answer it or say why it failed.
	 * @param instance The socket.
	 * @param browserId The browser.
	 * @param input The request bytes as they arrived.
	 * @param transport The socket.
	 */
	const handle = async (
		instance: BrowserConnectionInstance,
		browserId: string,
		input: unknown,
		transport: CanvasCodexBrowserSocketSend,
	): Promise<void> => {
		const parsed = BrowserRequestSchema.safeParse(input);
		if (!parsed.success) {
			await failure(transport, null, null, new Error("The Codex browser request is malformed."));
			return;
		}
		const request = parsed.data;
		try {
			const connection = connectionFor(instance, browserId);
			await requests[request.action]({ request, connection, transport, instance, browserId });
		} catch (error) {
			await failure(transport, request.requestId, request.action, error);
		}
	};

	/**
	 * Wait for every close and publication this generation owns, and fail with
	 * everything that failed rather than the first thing.
	 */
	const drain = async (): Promise<void> => {
		while (activeCloses.size > 0 || activePublications.size > 0) {
			// oxlint-disable-next-line no-await-in-loop -- settling one round can start another; the loop is what waits for the work to actually stop arriving
			await Promise.allSettled([...activeCloses, ...activePublications]);
		}
		const failures = closeFailures.splice(0);
		if (publicationFailure !== null) {
			failures.push(publicationFailure);
			publicationFailure = null;
		}
		if (failures.length === 0) {
			return;
		}
		throw new AggregateError(
			failures,
			`Codex browser drain failed: ${failures.map(errorMessage).join("; ")}`,
		);
	};

	/** Stop this owner: no socket is served, and nothing is published, after it. */
	const dispose = (): void => {
		if (disposed) {
			return;
		}
		disposed = true;
		for (const unsubscribe of subscriptions.values()) {
			unsubscribe();
		}
		subscriptions.clear();
		connections.clear();
	};

	return Object.freeze({ accept, handle, close, drain, dispose });
}

export {
	type BrowserRequestActionsAreExhaustive,
	type CanvasCodexBrowserSocketSend,
	type CanvasCodexBrowserWebSocket,
	createCanvasCodexBrowserSocketSend,
	type CanvasCodexBrowserSocketOwnerOptions,
	type CanvasCodexBrowserSocketOwner,
	createCanvasCodexBrowserSocketOwner,
};
