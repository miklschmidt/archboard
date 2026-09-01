import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

import { createCodexApprovalBroker } from "../../../src/runtime/codex-approvals/index.js";
import type {
	ReverseResponse,
	TransportServerRequest,
} from "../../../src/runtime/codex-transport/server-requests.js";
import { createCodexBrowserModel } from "../../../src/shared/codex-browser-model/index.js";
import { createIdentityAuthorities } from "../../../src/shared/codex-workbench-identity/index.js";
import type {
	BrowserProjection,
	BrowserWorkbenchActions,
} from "../../../src/server/codex-workbench/index.js";
import { createCodexWorkbenchGateway } from "../../../src/server/codex-workbench/index.js";
import { createCanvasRealtimeActions } from "../../../src/server/canvas/codex-workbench-adapters.js";
import { createCanvasCodexBrowserSocketOwner } from "../../../src/server/canvas/codex-workbench-browser.js";

async function delivered() {
	return { outcome: "delivered" as const };
}

interface PublicSocketClient {
	readonly client: WebSocket;
	readonly events: Record<string, unknown>[];
	readonly request: (
		action: string,
		extra?: Record<string, unknown>,
	) => Promise<Record<string, unknown>>;
}

test("the live canvas socket crosses the real gateway and approval broker exactly once", async () => {
	const identity = createIdentityAuthorities();
	const model = createCodexBrowserModel(identity);
	const childId = identity.identity.validator.childId;
	const epoch = identity.identity.validator.epoch;
	const threadId = identity.identity.decoder.adoptThreadId("public-thread");
	const coordinatorThreadId = identity.identity.decoder.adoptThreadId("public-coordinator");
	const turnId = identity.identity.decoder.adoptTurnId("public-turn");
	const itemId = identity.identity.decoder.adoptItemId("public-item");
	const requestId = identity.identity.decoder.adoptJsonRpcRequestId("public-approval-request");
	const approvalId = identity.identity.decoder.adoptApprovalId("public-approval");
	const projectionListeners = new Set<() => void>();
	const reverseResponses: Array<{
		readonly request: TransportServerRequest;
		readonly response: ReverseResponse;
	}> = [];
	let approvals: ReturnType<typeof createCodexApprovalBroker> | null = null;
	let gateway: ReturnType<typeof createCodexWorkbenchGateway> | null = null;
	let owner: ReturnType<typeof createCanvasCodexBrowserSocketOwner> | null = null;
	let server: ReturnType<typeof createServer> | null = null;
	let sockets: WebSocketServer | null = null;
	let first: PublicSocketClient | null = null;
	let second: PublicSocketClient | null = null;
	let websocketUrl: string | null = null;
	const openClient = async (): Promise<PublicSocketClient> => {
		if (websocketUrl === null) throw new Error("The public WebSocket port is not ready.");
		const client = new WebSocket(websocketUrl);
		const pending = new Map<string, (value: Record<string, unknown>) => void>();
		const events: Record<string, unknown>[] = [];
		client.on("message", (raw) => {
			const message = JSON.parse(raw.toString()) as Record<string, unknown>;
			if (message.type === "codex_workbench_event") events.push(message);
			else if (typeof message.requestId === "string") {
				pending.get(message.requestId)?.(message);
				pending.delete(message.requestId);
			}
		});
		await new Promise<void>((resolve, reject) => {
			client.once("open", resolve);
			client.once("error", reject);
		});
		let sequence = 0;
		return {
			client,
			events,
			request: (action, extra = {}) => {
				const request = `public-${++sequence}`;
				const result = new Promise<Record<string, unknown>>((resolve) => {
					pending.set(request, resolve);
				});
				client.send(
					JSON.stringify({
						type: "codex_workbench_request",
						requestId: request,
						action,
						...extra,
					}),
				);
				return result;
			},
		};
	};
	try {
		const activeApprovals = createCodexApprovalBroker({
			identity: identity.identity,
			listenerOwnership: "composition",
			transport: {
				respond: async (request, _owner, response) => {
					reverseResponses.push({ request, response });
				},
			},
			now: () => 1_787_682_840_000,
			onChange: () => {
				for (const listener of projectionListeners) listener();
			},
		});
		approvals = activeApprovals;
		const link = {
			kind: "thread_link",
			state: "executable",
			childId,
			epoch,
			threadId,
			source: "appServer",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		} as const;
		const realtimeCalls: Array<{ readonly name: string; readonly input: unknown }> = [];
		const realtime = createCanvasRealtimeActions({
			coordinator: {
				snapshot: () => ({
					state: "ready",
					threadId: coordinatorThreadId,
					childId,
					epoch,
				}),
			},
			workhorse: { snapshot: () => ({ state: "ready", threadId }) },
			realtime: {
				createOffer: async (input: { sessionId: string; correlationId: string; sdp: string }) => {
					realtimeCalls.push({ name: "start", input });
					return { ...input, sdp: "v=0\r\na=public-answer" };
				},
				appendText: async (input: unknown) => void realtimeCalls.push({ name: "append", input }),
				stop: async (input: unknown) => void realtimeCalls.push({ name: "stop", input }),
			},
		} as never);
		const actions: BrowserWorkbenchActions = {
			account: {
				read: delivered,
				login: delivered,
				loginCancel: delivered,
				logout: delivered,
			},
			threadLinks: { create: delivered, attach: delivered, relink: delivered },
			text: { start: delivered, steer: delivered, interrupt: delivered },
			queue: {
				add: delivered,
				update: delivered,
				delete: delivered,
				reorder: delivered,
				start: delivered,
			},
			realtime,
			ordinaryApprovals: {
				pending: (candidate) => {
					try {
						return activeApprovals.toBrowserApproval(candidate);
					} catch {
						return null;
					}
				},
				resolve: async (command) => {
					await activeApprovals.resolve({
						requestId: command.requestId,
						approvalId: command.approvalId,
						response: command.response,
					});
					return { outcome: "delivered" };
				},
			},
			dynamicApprovals: {
				pending: () => [],
				resolve: async () => ({ outcome: "not_delivered" }),
			},
		};
		const projection = {
			read: (): BrowserProjection => ({
				readiness: { kind: "readiness", state: "thread_capable" },
				account: { kind: "account", state: "ready", accountType: "chatgpt" },
				login: { kind: "login", state: "idle" },
				timeline: null,
				queue: { kind: "queue", status: "empty", entries: [] },
				settings: [],
				approvals: activeApprovals
					.inspect()
					.flatMap((approval) =>
						approval.state === "pending"
							? [activeApprovals.toBrowserApproval(approval.requestId)]
							: [],
					),
				dynamicApprovals: [],
				semantic: null,
				coordinator: {
					kind: "coordinator",
					state: "ready",
					threadId: coordinatorThreadId,
					activeTurnId: null,
					model: "gpt-5.6-sol",
					effort: "xhigh",
					serviceTier: "priority",
					reason: null,
				},
				voice: {
					kind: "voice",
					state: "ready",
					realtimeSessionId: null,
					transcript: [],
					delivery: null,
					reason: null,
				},
			}),
			onChange: (listener: () => void) => {
				projectionListeners.add(listener);
				return () => projectionListeners.delete(listener);
			},
		};
		const activeGateway = createCodexWorkbenchGateway({
			identity,
			projection,
			threadLink: {
				read: (paneId) => ({
					paneId,
					revision: 1,
					link,
					cas: { revision: 1, paneId, childId, epoch, threadId },
				}),
			},
			actions,
			now: () => 1_787_682_840_000,
		});
		gateway = activeGateway;
		const activeOwner = createCanvasCodexBrowserSocketOwner({
			gateway: activeGateway,
			paneForBrowser: () => "pane-public",
		});
		owner = activeOwner;
		const activeServer = createServer();
		server = activeServer;
		const activeSockets = new WebSocketServer({ server: activeServer });
		sockets = activeSockets;
		activeSockets.on("connection", (socket) => {
			const instance = Object.freeze({ socket });
			socket.on("message", (raw) => {
				void activeOwner.handle(instance, "browser-public", JSON.parse(raw.toString()), {
					send: (message) => socket.send(JSON.stringify(message)),
				});
			});
			socket.on("close", () => void activeOwner.close(instance, "browser-public"));
		});
		await new Promise<void>((resolve) => activeServer.listen(0, "127.0.0.1", resolve));
		const address = activeServer.address();
		if (address === null || typeof address === "string") throw new Error("missing public port");
		websocketUrl = `ws://127.0.0.1:${address.port}`;
		const activeFirst = await openClient();
		first = activeFirst;
		await activeFirst.request("connect");
		await activeFirst.request("subscribe");
		const claimed = await activeFirst.request("claimLease");
		const lease = claimed.value as Record<string, unknown>;
		const approvalRequest = {
			child: childId,
			epoch,
			requestId,
			correlation: identity.identity.decoder.createWireRequestCorrelation({ requestId }),
			method: "item/commandExecution/requestApproval",
			owner: "codex-approvals",
			params: {
				threadId: String(threadId),
				turnId: String(turnId),
				itemId: String(itemId),
				kind: "command",
				startedAtMs: 10,
				approvalId: String(approvalId),
				environmentId: null,
				reason: "Run the public command",
				networkApprovalContext: null,
				command: "bun test",
				cwd: "/workspace/archboard",
				commandActions: null,
				additionalPermissions: null,
				proposedExecpolicyAmendment: null,
				proposedNetworkPolicyAmendments: null,
				availableDecisions: ["accept", "decline"],
			},
		} as TransportServerRequest;
		activeApprovals.receive(approvalRequest);
		const snapshot = await activeFirst.request("snapshot");
		const approval = (snapshot.value as { snapshot: { approvals: unknown[] } }).snapshot
			.approvals[0] as Record<string, unknown>;
		expect(approval).toMatchObject({
			kind: "approval",
			approvalKind: "command_execution",
			requestId,
			approvalId,
		});
		const approvalCommand = model.BrowserCommandSchema.parse({
			kind: "browser_command",
			command: "approvalRespond",
			commandId: lease.commandId,
			paneId: lease.paneId,
			childId: lease.childId,
			epoch: lease.epoch,
			requestId,
			approvalId,
			response: { approvalKind: "command_execution", decision: "accept" },
		});
		const firstApproval = await activeFirst.request("command", { command: approvalCommand });
		const duplicateApproval = await activeFirst.request("command", { command: approvalCommand });
		expect(firstApproval.value).toEqual(duplicateApproval.value);
		expect(reverseResponses).toHaveLength(1);

		const replacement = await openClient();
		second = replacement;
		await replacement.request("connect");
		const replacementLeaseResult = await replacement.request("claimLease");
		const replacementLease = replacementLeaseResult.value as Record<string, unknown>;
		activeFirst.client.close();
		await new Promise<void>((resolve) => activeFirst.client.once("close", resolve));
		const renewed = await replacement.request("renewLease");
		expect(renewed).toMatchObject({ ok: true, value: { commandId: replacementLease.commandId } });
		expect(await replacement.request("mediaReady", { ready: true })).toMatchObject({ ok: true });

		const startLease = (await replacement.request("claimLease")).value as Record<string, unknown>;
		const start = await replacement.request("command", {
			command: model.BrowserCommandSchema.parse({
				kind: "browser_command",
				command: "realtimeStart",
				commandId: startLease.commandId,
				paneId: startLease.paneId,
				childId: startLease.childId,
				epoch: startLease.epoch,
				threadId,
				sdp: "v=0\r\na=public-offer",
			}),
		});
		const startValue = start.value as Record<string, unknown>;
		expect(startValue).toMatchObject({
			outcome: "delivered",
			realtimeSessionHandle: startLease.commandId,
			realtimeAnswer: { sdp: "v=0\r\na=public-answer" },
		});
		const handle = startValue.realtimeSessionHandle;
		for (const command of ["realtimeAppendText", "realtimeStop"] as const) {
			const currentLease = (await replacement.request("claimLease")).value as Record<
				string,
				unknown
			>;
			const result = await replacement.request("command", {
				command: model.BrowserCommandSchema.parse({
					kind: "browser_command",
					command,
					commandId: currentLease.commandId,
					paneId: currentLease.paneId,
					childId: currentLease.childId,
					epoch: currentLease.epoch,
					threadId,
					realtimeSessionHandle: handle,
					...(command === "realtimeAppendText" ? { text: "same public session" } : {}),
				}),
			});
			expect(result).toMatchObject({ ok: true, value: { outcome: "delivered" } });
		}
		expect(realtimeCalls.map((call) => call.name)).toEqual(["start", "append", "stop"]);
		await replacement.request("subscribe");
		await activeGateway.dispose();
		for (let attempt = 0; attempt < 20 && replacement.events.length === 0; attempt += 1)
			await Bun.sleep(1);
		expect(replacement.events).toContainEqual(
			expect.objectContaining({
				type: "codex_workbench_event",
				message: expect.objectContaining({
					kind: "delta",
					delta: expect.objectContaining({
						voice: expect.objectContaining({ state: "unavailable" }),
					}),
				}),
			}),
		);
		replacement.client.close();
		await new Promise<void>((resolve) => replacement.client.once("close", resolve));
		second = null;
	} finally {
		second?.client.close();
		first?.client.close();
		if (sockets !== null) await new Promise<void>((resolve) => sockets?.close(() => resolve()));
		if (server?.listening)
			await new Promise<void>((resolve, reject) =>
				server?.close((error) => (error ? reject(error) : resolve())),
			);
		owner?.disposeForReload();
		if (gateway !== null) await gateway.dispose();
		approvals?.dispose();
	}
});
