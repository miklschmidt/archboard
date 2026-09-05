import { z } from "zod";
import { WebSocket } from "ws";

import type {
	BrowserConnectionInstance,
	BrowserGatewayMessage,
	BrowserSnapshot,
	BrowserWorkbenchConnection,
	CodexWorkbenchGateway,
} from "../../codex-workbench/index.js";
import type { BrowserGatewayAction } from "../../../shared/codex-browser-gateway/index.js";

const RequestIdSchema = z.string().min(1).max(128);
const RequestBase = { type: z.literal("codex_workbench_request"), requestId: RequestIdSchema };

/**
 * The ingress arms name their action through the shared gateway envelope, so an
 * action the browser can send and this schema does not accept — or the reverse —
 * is a compile error rather than a request refused at runtime. The arms stay
 * written out because their payloads differ; only the action vocabulary is
 * shared.
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

/** Adapt the production callback-based WebSocket into an awaitable send boundary. */
function createCanvasCodexBrowserSocketSend(
	socket: CanvasCodexBrowserWebSocket,
): CanvasCodexBrowserSocketSend {
	return Object.freeze({
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

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

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

async function sendPublishedResult(
	transport: CanvasCodexBrowserSocketSend,
	request: BrowserRequest,
	connection: BrowserWorkbenchConnection,
	value: { readonly snapshot: BrowserSnapshot },
): Promise<void> {
	await sendResult(transport, request, value);
	connection.confirmPublished(value.snapshot);
}

/** Own the public canvas WebSocket bridge for one installed gateway generation. */
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

	const accept = (instance: BrowserConnectionInstance, browserId: string): void => {
		if (disposed) {
			throw new Error("The Codex browser socket owner is stopped.");
		}
		if (options.paneForBrowser(browserId) === null) {
			return;
		}
		connectionFor(instance, browserId);
	};

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
			switch (request.action) {
				case "connect":
					await sendPublishedResult(transport, request, connection, connection.snapshot());
					return;
				case "snapshot":
					// The browser asked for current state, so cached owner state is
					// re-read before it is projected: this is what makes a queue
					// refresh a genuine read rather than a redraw of the last command.
					await connection.refreshProjection();
					await sendPublishedResult(transport, request, connection, connection.snapshot());
					return;
				case "claimLease":
					await sendResult(transport, request, connection.claimLease());
					return;
				case "renewLease":
					await sendResult(transport, request, connection.renewLease());
					return;
				case "releaseLease":
					await sendResult(transport, request, connection.releaseLease());
					return;
				case "mediaReady":
					await sendPublishedResult(
						transport,
						request,
						connection,
						connection.setMediaReady(request.ready),
					);
					return;
				case "accountRead":
					await sendPublishedResult(transport, request, connection, await connection.accountRead());
					return;
				case "command":
					await sendPublishedResult(
						transport,
						request,
						connection,
						await connection.command(request.command),
					);
					return;
				case "subscribe": {
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
					return;
				}
				case "close":
					await close(instance, browserId);
					await sendResult(transport, request, null);
					return;
			}
		} catch (error) {
			await failure(transport, request.requestId, request.action, error);
		}
	};

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

	const drain = async (): Promise<void> => {
		while (activeCloses.size > 0 || activePublications.size > 0) {
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
