import { z } from "zod";

import type {
	BrowserConnectionInstance,
	BrowserGatewayMessage,
	BrowserSnapshot,
	BrowserWorkbenchConnection,
	CodexWorkbenchGateway,
} from "../../codex-workbench/index.js";

const RequestIdSchema = z.string().min(1).max(128);
const RequestBase = { type: z.literal("codex_workbench_request"), requestId: RequestIdSchema };
const BrowserRequestSchema = z.discriminatedUnion("action", [
	z.object({ ...RequestBase, action: z.literal("connect") }).strict(),
	z.object({ ...RequestBase, action: z.literal("snapshot") }).strict(),
	z.object({ ...RequestBase, action: z.literal("claimLease") }).strict(),
	z.object({ ...RequestBase, action: z.literal("renewLease") }).strict(),
	z.object({ ...RequestBase, action: z.literal("releaseLease") }).strict(),
	z.object({ ...RequestBase, action: z.literal("mediaReady"), ready: z.boolean() }).strict(),
	z.object({ ...RequestBase, action: z.literal("accountRead") }).strict(),
	z.object({ ...RequestBase, action: z.literal("command"), command: z.unknown() }).strict(),
	z.object({ ...RequestBase, action: z.literal("subscribe") }).strict(),
	z.object({ ...RequestBase, action: z.literal("close") }).strict(),
]);

type BrowserRequest = z.infer<typeof BrowserRequestSchema>;

export interface CanvasCodexBrowserSocketSend {
	readonly send: (message: unknown) => void;
}

export interface CanvasCodexBrowserSocketOwnerOptions {
	readonly gateway: CodexWorkbenchGateway;
	/** Resolve the pane from server-owned socket registration, never request bytes. */
	readonly paneForBrowser: (browserId: string) => string | null;
}

export interface CanvasCodexBrowserSocketOwner {
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
	/** Wait for every normal-close or teardown close already owned by this generation. */
	readonly drain: () => Promise<void>;
	readonly dispose: () => void;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function sendResult(
	transport: CanvasCodexBrowserSocketSend,
	request: BrowserRequest,
	value: unknown,
): void {
	transport.send({
		type: "codex_workbench_result",
		requestId: request.requestId,
		action: request.action,
		ok: true,
		value,
	});
}

function sendPublishedResult(
	transport: CanvasCodexBrowserSocketSend,
	request: BrowserRequest,
	connection: BrowserWorkbenchConnection,
	value: { readonly snapshot: BrowserSnapshot },
): void {
	sendResult(transport, request, value);
	connection.confirmPublished(value.snapshot);
}

/** Own the public canvas WebSocket bridge for one installed gateway generation. */
export function createCanvasCodexBrowserSocketOwner(
	options: CanvasCodexBrowserSocketOwnerOptions,
): CanvasCodexBrowserSocketOwner {
	const subscriptions = new Map<BrowserConnectionInstance, () => void>();
	const connections = new Map<BrowserConnectionInstance, BrowserWorkbenchConnection>();
	const closePromises = new WeakMap<BrowserConnectionInstance, Promise<void>>();
	const activeCloses = new Set<Promise<void>>();
	const closeFailures: unknown[] = [];
	let disposed = false;

	const connectionFor = (
		instance: BrowserConnectionInstance,
		browserId: string,
	): BrowserWorkbenchConnection => {
		if (disposed) throw new Error("The Codex browser socket owner is stopped.");
		const paneId = options.paneForBrowser(browserId);
		if (paneId === null)
			throw new Error("The browser has not registered an authoritative canvas pane.");
		const previous = connections.get(instance);
		if (previous?.paneId === paneId) return previous;
		subscriptions.get(instance)?.();
		subscriptions.delete(instance);
		const connection = options.gateway.connect(browserId, paneId, instance);
		connections.set(instance, connection);
		return connection;
	};

	const accept = (instance: BrowserConnectionInstance, browserId: string): void => {
		if (disposed) throw new Error("The Codex browser socket owner is stopped.");
		if (options.paneForBrowser(browserId) === null) return;
		connectionFor(instance, browserId);
	};

	const failure = (
		transport: CanvasCodexBrowserSocketSend,
		requestId: string | null,
		action: string | null,
		error: unknown,
	): void =>
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
			failure(transport, null, null, new Error("The Codex browser request is malformed."));
			return;
		}
		const request = parsed.data;
		try {
			const connection = connectionFor(instance, browserId);
			switch (request.action) {
				case "connect":
					sendPublishedResult(transport, request, connection, connection.snapshot());
					return;
				case "snapshot":
					sendPublishedResult(transport, request, connection, connection.snapshot());
					return;
				case "claimLease":
					sendResult(transport, request, connection.claimLease());
					return;
				case "renewLease":
					sendResult(transport, request, connection.renewLease());
					return;
				case "releaseLease":
					sendResult(transport, request, connection.releaseLease());
					return;
				case "mediaReady":
					sendPublishedResult(
						transport,
						request,
						connection,
						connection.setMediaReady(request.ready),
					);
					return;
				case "accountRead":
					sendPublishedResult(transport, request, connection, await connection.accountRead());
					return;
				case "command":
					sendPublishedResult(
						transport,
						request,
						connection,
						await connection.command(request.command),
					);
					return;
				case "subscribe": {
					subscriptions.get(instance)?.();
					const unsubscribe = connection.subscribe((message: BrowserGatewayMessage) => {
						transport.send({ type: "codex_workbench_event", message });
					});
					subscriptions.set(instance, unsubscribe);
					sendPublishedResult(transport, request, connection, connection.snapshot());
					return;
				}
				case "close":
					await close(instance, browserId);
					sendResult(transport, request, null);
					return;
			}
		} catch (error) {
			failure(transport, request.requestId, request.action, error);
		}
	};

	const close = (instance: BrowserConnectionInstance, browserId: string): Promise<void> => {
		const existing = closePromises.get(instance);
		if (existing !== undefined) return existing;
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
			if (paneId !== null) await options.gateway.closeConnection(browserId, paneId, instance);
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
		while (activeCloses.size > 0) await Promise.allSettled(activeCloses);
		if (closeFailures.length === 0) return;
		const failures = closeFailures.splice(0);
		throw new AggregateError(
			failures,
			`Codex browser cleanup failed: ${failures.map(errorMessage).join("; ")}`,
		);
	};

	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		for (const unsubscribe of subscriptions.values()) unsubscribe();
		subscriptions.clear();
		connections.clear();
	};

	return Object.freeze({ accept, handle, close, drain, dispose });
}
