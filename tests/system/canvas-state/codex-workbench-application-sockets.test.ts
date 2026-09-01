import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { WebSocket } from "ws";

import { createBrowserWorkbenchMediaOwner } from "../../../src/ui/codex-workbench-media/index.js";
import type { BrowserWorkbenchSocket } from "../../../src/ui/workbench-transport/index.js";
import { createCanvasWorkbenchSocketOwner } from "../../../src/ui/canvas/workbench-socket.js";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { createRequester, waitFor } from "./support/http.ts";

const repoRoot = resolve(import.meta.dir, "../../..");

interface WorkbenchResult {
	readonly ok: boolean;
	readonly value?: Record<string, unknown>;
	readonly error?: string;
}

interface ApplicationSocket {
	readonly socket: WebSocket;
	request(action: string, extra?: Record<string, unknown>): Promise<WorkbenchResult>;
	close(): Promise<void>;
}

class TransportSocketAdapter extends EventTarget implements BrowserWorkbenchSocket {
	private readonly socket: WebSocket;
	readonly sent: Record<string, unknown>[];

	constructor(socket: WebSocket, sent: Record<string, unknown>[]) {
		super();
		this.socket = socket;
		this.sent = sent;
		socket.on("message", this.onMessage);
		socket.on("close", this.onClose);
		socket.on("open", this.onOpen);
	}

	get readyState(): number {
		return this.socket.readyState;
	}

	send(raw: string): void {
		this.sent.push(JSON.parse(raw) as Record<string, unknown>);
		this.socket.send(raw);
	}

	dispose(): void {
		this.socket.off("message", this.onMessage);
		this.socket.off("close", this.onClose);
		this.socket.off("open", this.onOpen);
	}

	private readonly onMessage = (raw: WebSocket.RawData): void => {
		this.dispatchEvent(new MessageEvent("message", { data: raw.toString() }));
	};
	private readonly onClose = (): void => {
		this.dispatchEvent(new Event("close"));
	};
	private readonly onOpen = (): void => {
		this.dispatchEvent(new Event("open"));
	};
}

async function openApplicationSocket(base: string, clientId: string): Promise<ApplicationSocket> {
	const endpoint = new URL(base);
	endpoint.protocol = "ws:";
	endpoint.searchParams.set("clientId", clientId);
	const socket = new WebSocket(endpoint);
	const pending = new Map<string, (value: WorkbenchResult) => void>();
	let sequence = 0;
	socket.on("message", (raw) => {
		const message = JSON.parse(raw.toString()) as WorkbenchResult & { requestId?: unknown };
		if (typeof message.requestId !== "string") return;
		pending.get(message.requestId)?.(message);
		pending.delete(message.requestId);
	});
	await new Promise<void>((resolveOpen, reject) => {
		socket.once("open", resolveOpen);
		socket.once("error", reject);
	});
	return {
		socket,
		request(action, extra = {}) {
			const requestId = `application-${++sequence}`;
			const result = new Promise<WorkbenchResult>((resolveResult) => {
				pending.set(requestId, resolveResult);
			});
			socket.send(JSON.stringify({ type: "codex_workbench_request", requestId, action, ...extra }));
			return result;
		},
		async close() {
			if (socket.readyState === WebSocket.CLOSED) return;
			await new Promise<void>((resolveClose) => {
				socket.once("close", resolveClose);
				socket.close();
			});
		},
	};
}

describe.serial("production canvas Codex WebSocket ownership", () => {
	test("a stale close cannot erase the replacement pane, selection, hold, or gateway lease", async () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-codex-application-sockets-"));
		const canvas = await startOwnedCanvas({
			serverPath: join(repoRoot, "src/server.ts"),
			vault: join(root, "vault"),
		});
		const request = createRequester(canvas);
		const clientId = "overlapping-codex-pane";
		let first: ApplicationSocket | null = null;
		let replacement: ApplicationSocket | null = null;
		try {
			first = await openApplicationSocket(canvas.base, clientId);
			await request("/api/panes", {
				method: "POST",
				doing: false,
				body: {
					clientId,
					paneId: clientId,
					primary: true,
					focused: true,
					elementCount: 0,
					board: "scratch",
					rect: { x: 0, y: 0, width: 1280, height: 800 },
					viewport: { x: 0, y: 0, width: 1280, height: 800, zoom: 1 },
				},
			});
			await request("/api/selection", {
				method: "POST",
				doing: false,
				body: { clientId, elementIds: ["selected-by-replacement"] },
			});
			const held = await request<{ created: boolean }>("/api/boards/hold?board=scratch", {
				method: "POST",
				doing: false,
				body: { clientId, reason: "editing on the canvas" },
			});
			expect(held.body.created).toBeTrue();
			expect(await first.request("connect")).toMatchObject({ ok: true });
			expect(await first.request("claimLease")).toMatchObject({ ok: true });

			replacement = await openApplicationSocket(canvas.base, clientId);
			// Acceptance, not the first workbench request, transfers exact gateway
			// ownership. The retired close may therefore arrive before B speaks.
			await first.close();
			first = null;
			expect(await replacement.request("connect")).toMatchObject({ ok: true });
			const replacementLease = await replacement.request("claimLease");
			expect(replacementLease).toMatchObject({ ok: true });

			expect(await replacement.request("renewLease")).toMatchObject({
				ok: true,
				value: { commandId: replacementLease.value?.commandId },
			});
			expect((await request<{ paneCount: number }>("/api/panes")).body.paneCount).toBe(1);
			expect(
				await request<{ clientId: string; elementIds: string[] }>("/api/selection"),
			).toMatchObject({
				body: { clientId, elementIds: ["selected-by-replacement"] },
			});
			expect(
				(
					await request<{ created: boolean }>("/api/boards/hold?board=scratch", {
						method: "POST",
						doing: false,
						body: { clientId },
					})
				).body.created,
			).toBeFalse();

			expect(await replacement.request("releaseLease")).toMatchObject({ ok: true });
			expect(await replacement.request("claimLease")).toMatchObject({ ok: true });
			await replacement.close();
			replacement = null;
			await waitFor(
				async () => (await request<{ paneCount: number }>("/api/panes")).body.paneCount === 0,
				"the exact replacement socket to retire its pane",
			);
			expect(
				await request<{ clientId: null; elementIds: string[] }>("/api/selection"),
			).toMatchObject({
				body: { clientId: null, elementIds: [] },
			});
			expect(
				(
					await request<{ created: boolean }>("/api/boards/hold?board=scratch", {
						method: "POST",
						doing: false,
						body: { clientId: "hold-probe" },
					})
				).body.created,
			).toBeTrue();
		} finally {
			await first?.close();
			await replacement?.close();
			await canvas.dispose();
			rmSync(root, { recursive: true, force: true });
		}
	}, 60_000);

	test("the production canvas socket composes one transport reducer with media behavior", async () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-codex-composed-socket-"));
		const canvas = await startOwnedCanvas({
			serverPath: join(repoRoot, "src/server.ts"),
			vault: join(root, "vault"),
		});
		const request = createRequester(canvas);
		const clientId = "composed-codex-pane";
		let application: ApplicationSocket | null = null;
		let adapter: TransportSocketAdapter | null = null;
		let stopCount = 0;
		const media = createBrowserWorkbenchMediaOwner({
			createMediaSession: () =>
				({
					getSnapshot: () =>
						({
							correlation: null,
							state: { phase: "listening", reason: "negotiation_succeeded" },
							inputLevel: 0,
						}) as never,
					subscribe: () => () => undefined,
					start: async () => ({}) as never,
					appendText: async () => ({}) as never,
					stop: async () => {
						stopCount += 1;
						return {} as never;
					},
					dispose: async () => undefined,
				}) as never,
		});
		const owner = createCanvasWorkbenchSocketOwner({ media });
		const sent: Record<string, unknown>[] = [];
		try {
			application = await openApplicationSocket(canvas.base, clientId);
			adapter = new TransportSocketAdapter(application.socket, sent);
			// A real canvas socket is open before the first pane report. The workbench
			// owner must remain silent until that authoritative registration succeeds.
			expect(sent.filter((message) => message.action === "subscribe")).toHaveLength(0);
			const registration = await request<{ registered: boolean }>("/api/panes", {
				method: "POST",
				doing: false,
				body: {
					clientId,
					paneId: clientId,
					primary: true,
					focused: true,
					elementCount: 0,
					board: "scratch",
					rect: { x: 0, y: 0, width: 1280, height: 800 },
					viewport: { x: 0, y: 0, width: 1280, height: 800, zoom: 1 },
				},
			});
			expect(registration.body.registered).toBeTrue();
			await owner.attach(adapter);
			const generation = owner.current();
			if (generation === null)
				throw new Error("the canvas socket owner did not retain a generation");
			const transport = generation.transport;
			expect(sent.filter((message) => message.action === "connect")).toHaveLength(0);
			expect(sent.filter((message) => message.action === "subscribe")).toHaveLength(1);
			expect(transport.snapshot()).not.toBeNull();
			const baselineSequence = transport.sequence();
			await transport.setMediaReady(true);
			await transport.setMediaReady(false);
			await Bun.sleep(0);
			expect(transport.sequence()).toBeGreaterThan(baselineSequence ?? -1);
			expect(transport.snapshot()?.voice.state).toBe("unavailable");
			expect(stopCount).toBe(1);
			expect(application.socket.readyState).toBe(WebSocket.OPEN);
			await owner.dispose();
			expect(application.socket.readyState).toBe(WebSocket.OPEN);
		} finally {
			await owner.dispose();
			adapter?.dispose();
			await application?.close();
			await canvas.dispose();
			rmSync(root, { recursive: true, force: true });
		}
	}, 60_000);
});
