import { z } from "zod";

import type {
	BrowserConnectionInstance,
	BrowserGatewayMessage,
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
	readonly handle: (
		instance: BrowserConnectionInstance,
		browserId: string,
		input: unknown,
		transport: CanvasCodexBrowserSocketSend,
	) => Promise<void>;
	readonly close: (instance: BrowserConnectionInstance, browserId: string) => Promise<void>;
	/** Reload removes subscriptions but does not release browser lease authority. */
	readonly disposeForReload: () => void;
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

/** Own the public canvas WebSocket bridge for one installed gateway generation. */
export function createCanvasCodexBrowserSocketOwner(
	options: CanvasCodexBrowserSocketOwnerOptions,
): CanvasCodexBrowserSocketOwner {
	const subscriptions = new Map<BrowserConnectionInstance, () => void>();
	const connections = new Map<BrowserConnectionInstance, BrowserWorkbenchConnection>();
	let disposed = false;

	const connectionFor = (
		instance: BrowserConnectionInstance,
		browserId: string,
	): BrowserWorkbenchConnection => {
		if (disposed) throw new Error("The Codex browser socket owner is reloading.");
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
					sendResult(transport, request, connection.snapshot());
					return;
				case "snapshot":
					sendResult(transport, request, connection.snapshot());
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
				case "accountRead":
					sendResult(transport, request, await connection.accountRead());
					return;
				case "command":
					sendResult(transport, request, await connection.command(request.command));
					return;
				case "subscribe": {
					subscriptions.get(instance)?.();
					const unsubscribe = connection.subscribe((message: BrowserGatewayMessage) => {
						transport.send({ type: "codex_workbench_event", message });
					});
					subscriptions.set(instance, unsubscribe);
					sendResult(transport, request, connection.snapshot());
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

	const close = async (instance: BrowserConnectionInstance, _browserId: string): Promise<void> => {
		subscriptions.get(instance)?.();
		subscriptions.delete(instance);
		const connection = connections.get(instance);
		connections.delete(instance);
		await connection?.close();
	};

	const disposeForReload = (): void => {
		if (disposed) return;
		disposed = true;
		for (const unsubscribe of subscriptions.values()) unsubscribe();
		subscriptions.clear();
		connections.clear();
	};

	return Object.freeze({ handle, close, disposeForReload });
}
