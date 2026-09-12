import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { WebSocket } from "ws";

import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { createRequester, waitFor } from "./support/http.ts";
import { SEMANTIC_PANE_CONTEXT_ROUTE } from "@/shared/semantic-pane-context";

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
		if (message.type === "pane_board") {
			initial.resolve();
		}
		if (typeof message.requestId !== "string") {
			return;
		}
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
			if (socket.readyState === WebSocket.CLOSED) {
				return;
			}
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
			expect(
				(
					await request("/api/semantic-boards/create", {
						method: "POST",
						doing: "starting the board this pane shows",
						body: { board: "scratch", create: { nodes: [{ name: "Gateway", kind: "service" }] } },
					})
				).status,
			).toBe(200);
			first = await openApplicationSocket(canvas.base, clientId);
			await request("/api/panes", {
				method: "POST",
				doing: false,
				body: {
					clientId,
					paneId: clientId,
					primary: true,
					focused: true,
					board: "scratch",
					rect: { x: 0, y: 0, width: 1280, height: 800 },
				},
			});
			// What this pane is reading, which is keyed by the same client id the
			// socket is, so retiring one has to retire the other.
			expect(
				(
					await request(SEMANTIC_PANE_CONTEXT_ROUTE, {
						method: "POST",
						doing: false,
						body: {
							paneId: clientId,
							clientId,
							board: { name: "scratch", key: "scratch" },
							variant: null,
							view: null,
							selection: [{ id: "picked-by-replacement" }],
							version: null,
							at: new Date().toISOString(),
							sequence: 0,
						},
					})
				).status,
			).toBe(200);
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
				value: { commandId: replacementLease.value?.["commandId"] },
			});
			expect((await request<{ paneCount: number }>("/api/panes")).body.paneCount).toBe(1);
			// The pane is the same pane: replacing its transport did not erase what
			// it had already said it was reading, which is what "without erasing
			// current authority" means from the agent's side.
			const carried = await request<{ panes: Array<{ clientId: string; selection: unknown[] }> }>(
				SEMANTIC_PANE_CONTEXT_ROUTE,
			);
			expect(carried.body.panes.find((report) => report.clientId === clientId)).toMatchObject({
				selection: [{ id: "picked-by-replacement" }],
			});

			expect(await replacement.request("releaseLease")).toMatchObject({ ok: true });
			expect(await replacement.request("claimLease")).toMatchObject({ ok: true });
			await replacement.close();
			replacement = null;
			await waitFor(
				async () => (await request<{ paneCount: number }>("/api/panes")).body.paneCount === 0,
				"the exact replacement socket to retire its pane",
			);
			// The report went with the pane: a closed tab must not leave a
			// true-looking answer standing about what somebody is looking at.
			const reports = await request<{ panes: Array<{ clientId: string }> }>(
				SEMANTIC_PANE_CONTEXT_ROUTE,
			);
			expect(reports.status).toBe(200);
			expect(reports.body.panes.some((report) => report.clientId === clientId)).toBeFalse();
			// And the board is free: nothing the retired transport did holds it.
			const claimed = await request<{ claim?: { holder?: { claimed?: boolean } } }>(
				"/api/semantic-boards/claim?board=scratch",
				{ method: "POST", doing: false, body: { reason: "checking the board is free" } },
			);
			expect(claimed.status).toBe(200);
			expect(claimed.body.claim?.holder?.claimed).toBeTrue();
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
					board: "scratch",
					rect: { x: 0, y: 0, width: 1280, height: 800 },
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
				if (!existsSync(sendLog)) {
					return undefined;
				}
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
