import { describe, expect, test } from "bun:test";
import { WebSocket } from "ws";

import type {
	BrowserGatewayMessage,
	BrowserGatewaySnapshotMessage,
	BrowserSnapshot,
	BrowserWorkbenchConnection,
	CodexWorkbenchGateway,
} from "../../codex-workbench/index.js";
import {
	createCanvasCodexBrowserSocketOwner,
	createCanvasCodexBrowserSocketSend,
} from "../codex-workbench-browser.js";

async function rejectedSend(error: Error): Promise<void> {
	throw error;
}

describe("canvas Codex publication boundary", () => {
	test("the production socket adapter rejects closing and callback-failed sends", async () => {
		let attempts = 0;
		const closing = createCanvasCodexBrowserSocketSend({
			readyState: WebSocket.CLOSING,
			send: () => {
				attempts += 1;
			},
		});
		await expect(closing.send({ closing: true })).rejects.toThrow("not open");
		expect(attempts).toBe(0);

		let failWrite!: (error: Error) => void;
		const callbackReady = Promise.withResolvers<void>();
		let settled = false;
		const callbackFailure = createCanvasCodexBrowserSocketSend({
			readyState: WebSocket.OPEN,
			send: (_data, callback) => {
				attempts += 1;
				failWrite = (error) => callback(error);
				callbackReady.resolve();
			},
		});
		const sending = callbackFailure.send({ callback: true });
		void sending.then(
			() => void (settled = true),
			() => void (settled = true),
		);
		await callbackReady.promise;
		expect(settled).toBeFalse();
		failWrite(new Error("write callback failed"));
		await expect(sending).rejects.toThrow("write callback failed");
		expect(settled).toBeTrue();
		expect(attempts).toBe(1);
	});

	test("an asynchronous result-send failure cannot confirm its snapshot", async () => {
		const instance = Object.freeze({ socket: "publication" });
		let confirmations = 0;
		const connection = {
			browserId: "browser-publication",
			paneId: "pane-publication",
			instance,
			snapshot: () => ({ kind: "snapshot", sequence: 0, snapshot: { approvals: [] } }) as never,
			confirmPublished: () => {
				confirmations += 1;
			},
		} as unknown as BrowserWorkbenchConnection;
		const gateway = { connect: () => connection } as unknown as CodexWorkbenchGateway;
		const owner = createCanvasCodexBrowserSocketOwner({
			gateway,
			paneForBrowser: () => "pane-publication",
		});
		const messages: unknown[] = [];
		try {
			await owner.handle(
				instance,
				"browser-publication",
				{ type: "codex_workbench_request", requestId: "failed", action: "snapshot" },
				{
					send: (message) => {
						if ((message as { ok?: unknown }).ok === true)
							return rejectedSend(new Error("asynchronous socket send failed"));
						messages.push(message);
						return Promise.resolve();
					},
				},
			);

			expect(confirmations).toBe(0);
			expect(messages).toContainEqual(expect.objectContaining({ requestId: "failed", ok: false }));
		} finally {
			owner.dispose();
		}
	});

	test("a successful event remains published when the following media result send fails", async () => {
		const instance = Object.freeze({ socket: "media-event" });
		const event = {
			kind: "delta",
			sequence: 1,
			delta: {},
		} satisfies BrowserGatewayMessage;
		const result = {
			kind: "snapshot",
			sequence: 2,
			snapshot: { approvals: [{ requestId: "terminal-from-result" }] },
		} as never;
		const published: unknown[] = [];
		let listener: ((message: BrowserGatewayMessage) => void) | null = null;
		const connection = {
			browserId: "browser-media-event",
			paneId: "pane-media-event",
			instance,
			snapshot: () => ({ kind: "snapshot", sequence: 0, snapshot: { approvals: [] } }) as never,
			confirmPublished: (payload: unknown) => void published.push(payload),
			setMediaReady: () => {
				listener?.(event);
				return result;
			},
			subscribe: (next: (message: BrowserGatewayMessage) => void) => {
				listener = next;
				return () => {
					listener = null;
				};
			},
		} as unknown as BrowserWorkbenchConnection;
		const gateway = { connect: () => connection } as unknown as CodexWorkbenchGateway;
		const owner = createCanvasCodexBrowserSocketOwner({
			gateway,
			paneForBrowser: () => connection.paneId,
		});
		const messages: unknown[] = [];
		const transport = {
			send: (message: unknown) => {
				if (
					(message as { type?: unknown }).type === "codex_workbench_result" &&
					(message as { action?: unknown }).action === "mediaReady" &&
					(message as { ok?: unknown }).ok === true
				)
					return rejectedSend(new Error("media result send failed"));
				messages.push(message);
				return Promise.resolve();
			},
		};
		try {
			await owner.handle(
				instance,
				connection.browserId,
				{ type: "codex_workbench_request", requestId: "subscribe", action: "subscribe" },
				transport,
			);
			published.length = 0;
			messages.length = 0;

			await owner.handle(
				instance,
				connection.browserId,
				{
					type: "codex_workbench_request",
					requestId: "media",
					action: "mediaReady",
					ready: true,
				},
				transport,
			);
			await owner.drain();

			expect(messages).toContainEqual(expect.objectContaining({ requestId: "media", ok: false }));
			expect(published).toEqual([event]);
		} finally {
			owner.dispose();
		}
	});

	test("a failed event send is reported once and a later snapshot republishes it", async () => {
		const instance = Object.freeze({ socket: "event-recovery" });
		const browserId = "browser-event-recovery";
		const paneId = "pane-event-recovery";
		const terminal = { requestId: "terminal-event-recovery" };
		const event = {
			kind: "delta",
			sequence: 4,
			delta: { approvals: [terminal] },
		} as unknown as BrowserGatewayMessage;
		const recovered: BrowserGatewaySnapshotMessage = {
			kind: "snapshot",
			sequence: 5,
			snapshot: { approvals: [terminal] } as unknown as BrowserSnapshot,
		};
		const empty: BrowserGatewaySnapshotMessage = {
			kind: "snapshot",
			sequence: 3,
			snapshot: { approvals: [] } as unknown as BrowserSnapshot,
		};
		let terminalPending = false;
		const listeners = new Set<(message: BrowserGatewayMessage) => void>();
		const confirmed: unknown[] = [];
		const connection = {
			browserId,
			paneId,
			instance,
			snapshot: () => (terminalPending ? recovered : empty),
			confirmPublished: (payload: unknown) => {
				confirmed.push(payload);
				if (payload === recovered.snapshot) terminalPending = false;
			},
			subscribe: (next: (message: BrowserGatewayMessage) => void) => {
				listeners.add(next);
				return () => listeners.delete(next);
			},
		} as unknown as BrowserWorkbenchConnection;
		const gateway = { connect: () => connection } as unknown as CodexWorkbenchGateway;
		const owner = createCanvasCodexBrowserSocketOwner({ gateway, paneForBrowser: () => paneId });
		const eventSendFailure = new Error("event write callback failed");
		const transport = createCanvasCodexBrowserSocketSend({
			readyState: WebSocket.OPEN,
			send: (raw, callback) => {
				const message = JSON.parse(raw) as { type?: unknown };
				queueMicrotask(() =>
					message.type === "codex_workbench_event" ? callback(eventSendFailure) : callback(),
				);
			},
		});
		try {
			await owner.handle(
				instance,
				browserId,
				{ type: "codex_workbench_request", requestId: "subscribe", action: "subscribe" },
				transport,
			);
			confirmed.length = 0;
			terminalPending = true;
			for (const next of listeners) next(event);

			let drainFailure: unknown = null;
			try {
				await owner.drain();
			} catch (error) {
				drainFailure = error;
			}
			expect(drainFailure).toBeInstanceOf(AggregateError);
			expect(drainFailure).toMatchObject({
				message: expect.stringContaining("Codex browser drain failed"),
			});
			const failures = (drainFailure as AggregateError).errors;
			expect(failures).toHaveLength(1);
			expect(failures[0]).toMatchObject({
				message: `Codex browser event publication failed for browser "${browserId}", pane "${paneId}", delta sequence 4: event write callback failed`,
				cause: eventSendFailure,
			});
			expect(confirmed).toEqual([]);
			expect(terminalPending).toBeTrue();
			await owner.drain();

			await owner.handle(
				instance,
				browserId,
				{ type: "codex_workbench_request", requestId: "recover", action: "snapshot" },
				transport,
			);
			expect(confirmed).toEqual([recovered.snapshot]);
			expect(terminalPending).toBeFalse();
		} finally {
			owner.dispose();
		}
	});
});
