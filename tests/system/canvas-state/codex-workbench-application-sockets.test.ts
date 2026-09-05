import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { WebSocket } from "ws";

import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { createRequester, waitFor } from "./support/http.ts";

const repoRoot = resolve(import.meta.dir, "../../..");

interface WorkbenchResult {
	readonly ok: boolean;
	readonly value?: Record<string, unknown>;
	readonly error?: string;
}

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
	let resolveDeferred!: (value: T) => void;
	const promise = new Promise<T>((accept) => {
		resolveDeferred = accept;
	});
	return { promise, resolve: resolveDeferred };
}

interface ApplicationSocket {
	readonly socket: WebSocket;
	request(action: string, extra?: Record<string, unknown>): Promise<WorkbenchResult>;
	close(): Promise<void>;
}

async function openApplicationSocket(base: string, clientId: string): Promise<ApplicationSocket> {
	const endpoint = new URL(base);
	endpoint.protocol = "ws:";
	endpoint.searchParams.set("clientId", clientId);
	const socket = new WebSocket(endpoint);
	const pending = new Map<string, (value: WorkbenchResult) => void>();
	const initial = deferred<void>();
	let sequence = 0;
	socket.on("message", (raw) => {
		const message = JSON.parse(raw.toString()) as WorkbenchResult & {
			requestId?: unknown;
			type?: unknown;
		};
		if (message.type === "initial_elements") initial.resolve();
		if (typeof message.requestId !== "string") return;
		pending.get(message.requestId)?.(message);
		pending.delete(message.requestId);
	});
	await new Promise<void>((resolveOpen, reject) => {
		socket.once("open", resolveOpen);
		socket.once("error", reject);
	});
	await initial.promise;
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
	test("a successful replacement retires the prior transport without erasing current authority", async () => {
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

			const retired = first;
			replacement = await openApplicationSocket(canvas.base, clientId);
			expect(await replacement.request("connect")).toMatchObject({ ok: true });
			await waitFor(
				() => (retired.socket.readyState === WebSocket.CLOSED ? true : undefined),
				"successful replacement initialization to retire the prior transport",
			);
			first = null;
			const replacementLease = await replacement.request("claimLease");
			expect(replacementLease).toMatchObject({ ok: true });

			expect(await replacement.request("renewLease")).toMatchObject({
				ok: true,
				value: { commandId: replacementLease.value?.commandId },
			});
			expect((await request<{ paneCount: number }>("/api/panes")).body.paneCount).toBe(1);
			expect(
				await request<{ clientId: string; elementIds: string[] }>(
					`/api/selection?pane=${clientId}`,
				),
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
			const retiredSelection = await request<{ error: string }>(`/api/selection?pane=${clientId}`);
			expect(retiredSelection.status).toBe(400);
			expect(retiredSelection.body.error).toContain("No pane is open");
			expect(retiredSelection.body.error).toContain(`"${clientId}" names nothing`);
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

	test("a failed replacement initial send leaves the live original authoritative", async () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-codex-initial-send-failure-"));
		const sendLog = join(root, "initial-send.log");
		const canvas = await startOwnedCanvas({
			serverPath: join(
				repoRoot,
				"tests/system/canvas-state/fixtures/initial-send-failure-server.ts",
			),
			vault: join(root, "vault"),
			env: { ARCHBOARD_TEST_INITIAL_SEND_LOG: sendLog },
		});
		const request = createRequester(canvas);
		const clientId = "failed-initial-send-pane";
		let original: ApplicationSocket | null = null;
		let replacement: WebSocket | null = null;
		try {
			original = await openApplicationSocket(canvas.base, clientId);
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
			expect(await original.request("connect")).toMatchObject({ ok: true });
			replacement = new WebSocket(
				`${canvas.base.replace(/^http/u, "ws")}?clientId=${encodeURIComponent(clientId)}`,
			);
			replacement.on("error", () => undefined);
			const replacementClosed = new Promise<void>((resolveClosed) =>
				replacement!.once("close", () => resolveClosed()),
			);
			const sendRecords = await waitFor(() => {
				if (!existsSync(sendLog)) return undefined;
				const records = readFileSync(sendLog, "utf8").trim().split("\n");
				return records.length >= 2 ? records : undefined;
			}, "the replacement initial send attempt");
			expect(JSON.parse(sendRecords![1]!) as { count?: unknown; callback?: unknown }).toEqual({
				count: 2,
				callback: true,
			});
			await replacementClosed;
			replacement = null;
			expect(original.socket.readyState).toBe(WebSocket.OPEN);
			expect(await original.request("connect")).toMatchObject({ ok: true });
		} finally {
			await original?.close();
			replacement?.terminate();
			await canvas.dispose();
			rmSync(root, { recursive: true, force: true });
		}
	}, 60_000);
});
