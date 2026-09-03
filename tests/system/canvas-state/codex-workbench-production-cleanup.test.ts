import { describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import {
	createServer as createNetServer,
	type Server as NetServer,
	type Socket as NetSocket,
} from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WebSocket } from "ws";

import { processExists, startOwnedCanvas, waitForProcessExit } from "../support/owned-canvas.ts";
import {
	openApplicationSocket,
	prepareProductionFixture,
	type FixtureSetupFailure,
} from "./support/codex-production.ts";
import { createRequester } from "./support/http.ts";
import {
	canvasChildPids,
	loggedRequestFailure,
	publicStartEnvironment,
	runPublicCanvas,
	runPublicCanvasAsync,
	writePublicCodexExecutable,
} from "./support/public-codex-startup.ts";

const serverPath = join(import.meta.dir, "fixtures/codex-production-server.ts");
const executableSource = join(import.meta.dir, "fixtures/fake-codex-production.ts");

interface ProcessRecord {
	readonly kind?: string;
	readonly pid?: number;
}

function processRecords(logPath: string): ProcessRecord[] {
	if (!existsSync(logPath)) return [];
	return readFileSync(logPath, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as ProcessRecord);
}

async function assertProcessesStopped(records: readonly ProcessRecord[]): Promise<void> {
	const pids = [
		...new Set(records.flatMap((record) => (record.pid === undefined ? [] : [record.pid]))),
	];
	for (const pid of pids) {
		if (processExists(pid)) await waitForProcessExit(pid);
		expect(processExists(pid), `pid ${pid}`).toBeFalse();
	}
}

async function closeServer(server: Server): Promise<void> {
	if (!server.listening) return;
	server.closeAllConnections();
	await new Promise<void>((resolve, reject) =>
		server.close((error) =>
			error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
				? reject(error)
				: resolve(),
		),
	);
}

interface LoopbackPeer {
	readonly base: string;
	readonly server: NetServer;
	readonly close: () => Promise<void>;
}

function baseFor(server: NetServer): string {
	const address = server.address();
	if (address === null || typeof address === "string")
		throw new Error("The loopback peer has no TCP port.");
	return `http://127.0.0.1:${address.port}`;
}

async function listenLoopbackPeer(
	onConnection: (socket: NetSocket) => void,
): Promise<LoopbackPeer> {
	const sockets = new Set<NetSocket>();
	const server = createNetServer((socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
		onConnection(socket);
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
	});
	return {
		base: baseFor(server),
		server,
		close: async () => {
			for (const socket of sockets) socket.destroy();
			if (!server.listening) return;
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error === undefined ? resolve() : reject(error))),
			);
		},
	};
}

async function closedLoopbackEndpoint(): Promise<string> {
	const reservation = await listenLoopbackPeer((socket) => socket.destroy());
	const base = reservation.base;
	await reservation.close();
	return base;
}

const pane = (clientId: string, primary: boolean, focused: boolean) => ({
	clientId,
	paneId: `${clientId}-pane`,
	primary,
	focused,
	elementCount: 0,
	board: "scratch",
	rect: { x: 0, y: 0, width: 1280, height: 800 },
	viewport: { x: 0, y: 0, width: 1280, height: 800, zoom: 1 },
});

describe.serial("production Codex setup cleanup", () => {
	test("public start reports every executable refusal once and preserves prior Codex state", async () => {
		for (const scenario of [
			"missing",
			"non-file",
			"unexecutable",
			"wrong-version",
			"verification-timeout",
			"early-exit",
		] as const) {
			const root = mkdtempSync(join(tmpdir(), `archboard-public-${scenario}-`));
			try {
				const base = await closedLoopbackEndpoint();
				const executable = join(root, "codex");
				const pidLog = join(root, "child.pid");
				if (scenario === "non-file") mkdirSync(executable, { mode: 0o700 });
				if (scenario === "unexecutable") {
					writeFileSync(executable, "not executable");
					chmodSync(executable, 0o600);
				}
				if (scenario === "wrong-version")
					writePublicCodexExecutable(executable, 'console.log("codex-cli 0.150.0");');
				if (scenario === "early-exit")
					writePublicCodexExecutable(
						executable,
						`if (process.argv.includes("--version")) console.log("codex-cli 0.151.0"); else { require("node:fs").writeFileSync(${JSON.stringify(pidLog)}, String(process.pid)); process.exit(19); }`,
					);
				const environment = publicStartEnvironment(root, base, executable);
				if (scenario === "verification-timeout")
					environment.ARCHBOARD_TEST_PUBLIC_CODEX_PROOF_FAILURE = "verification_timeout";
				const result = runPublicCanvas("start", environment);
				expect(result.status, scenario).not.toBe(0);
				const lines = result.stderr.split(/\r?\n/u).filter(Boolean);
				expect(lines, scenario).toHaveLength(1);
				expect(lines[0], scenario).toMatch(/Codex|canvas child/iu);
				expect(lines[0], scenario).not.toMatch(/\bat\s+\S+|AggregateError/iu);
				expect(
					readFileSync(
						join(root, "state/excalidraw-canvas/codex-workbench/pre-existing-sentinel"),
						"utf8",
					),
				).toBe("preserve me");
				if (existsSync(pidLog)) {
					const pid = Number(readFileSync(pidLog, "utf8"));
					expect(processExists(pid), `${scenario}:pid ${pid}`).toBeFalse();
				}
				const port = Number(new URL(base).port);
				expect(
					existsSync(join(root, `state/excalidraw-canvas/server-${port}.pid`)),
					scenario,
				).toBeFalse();
				await expect(
					fetch(`${base}/health`, { signal: AbortSignal.timeout(100) }),
				).rejects.toThrow();
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	}, 20_000);
	test("concurrent public starts share one Codex owner and one canvas", async () => {
		const resources = new AsyncDisposableStack();
		let environment: NodeJS.ProcessEnv | null = null;
		let spawned: ProcessRecord[] = [];
		try {
			const fixture = prepareProductionFixture(resources, executableSource);
			environment = publicStartEnvironment(
				fixture.root,
				await closedLoopbackEndpoint(),
				fixture.executablePath,
			);
			const starts = await Promise.all([
				runPublicCanvasAsync("start", environment),
				runPublicCanvasAsync("start", environment),
			]);
			for (const start of starts) expect(start.status, start.stderr).toBe(0);
			spawned = processRecords(fixture.logPath).filter(
				(record) => record.kind === "app_server_spawn",
			);
			expect(spawned).toHaveLength(1);
			expect(runPublicCanvas("stop", environment).status).toBe(0);
		} finally {
			if (environment !== null) runPublicCanvas("stop", environment);
			await resources.disposeAsync();
		}
		await assertProcessesStopped(spawned);
	}, 20_000);
	test("public start keeps signed-out and logged-error service state running", async () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-public-signed-out-"));
		let socket: Awaited<ReturnType<typeof openApplicationSocket>> | null = null;
		let environment: NodeJS.ProcessEnv | null = null;
		let canvasPid: number | null = null;
		try {
			const base = await closedLoopbackEndpoint();
			environment = publicStartEnvironment(root, base);
			const started = runPublicCanvas("start", environment);
			expect(started.status).toBe(0);
			const pidMatch = started.stdout.match(/"pid":\s*(\d+)/u);
			if (pidMatch?.[1] === undefined)
				throw new Error(`Public start returned no pid: ${started.stdout}`);
			canvasPid = Number(pidMatch[1]);
			expect(processExists(canvasPid)).toBeTrue();
			const childPids = canvasChildPids(canvasPid);
			expect(childPids).toHaveLength(1);
			expect(processExists(childPids[0]!)).toBeTrue();
			expect(await loggedRequestFailure(base, root)).toMatchObject({
				status: 500,
				health: { pid: canvasPid },
				logged: true,
			});
			socket = await openApplicationSocket(base, "signed-out-client");
			const request = createRequester({ base, assertRunning: async () => undefined });
			expect(
				(
					await request("/api/panes", {
						method: "POST",
						doing: false,
						body: pane("signed-out-client", true, true),
					})
				).status,
			).toBe(200);
			const connected = await socket.request("connect");
			expect(connected).toMatchObject({ ok: true });
			const snapshot = connected.value?.snapshot as Record<string, unknown> | undefined;
			expect(snapshot?.account).toMatchObject({ state: "signed_out" });
			expect(snapshot?.readiness).toMatchObject({ state: "signed_out" });
			const lease = await socket.request("claimLease");
			const target = lease.value ?? {};
			const action = await socket.request("command", {
				command: {
					kind: "browser_command",
					command: "threadLinkCreate",
					commandId: target.commandId,
					paneId: target.paneId,
					childId: target.childId,
					epoch: target.epoch,
				},
			});
			expect(action.value).not.toMatchObject({ outcome: "delivered" });
			await request("/api/elements?board=scratch", {
				method: "POST",
				doing: "persisting the reload census proof",
				body: { type: "rectangle", x: 0, y: 0, width: 20, height: 20 },
			});
			expect(
				(
					await request("/api/boards/open", {
						method: "POST",
						doing: false,
						body: { board: "scratch", pane: "signed-out-client", reload: true },
					})
				).status,
			).toBe(200);
			expect(canvasChildPids(canvasPid)).toEqual(childPids);

			await socket.close();
			socket = null;
			const stopped = runPublicCanvas("stop", environment);
			expect(stopped.status).toBe(0);
			await waitForProcessExit(canvasPid);
			await waitForProcessExit(childPids[0]!);
			expect(processExists(canvasPid)).toBeFalse();
			expect(processExists(childPids[0]!)).toBeFalse();
			expect(
				existsSync(
					join(
						root,
						"state/excalidraw-canvas/codex-workbench/codex-home/.archboard-codex-process.lock",
					),
				),
			).toBeFalse();
		} finally {
			await socket?.close();
			if (environment !== null && canvasPid !== null && processExists(canvasPid))
				runPublicCanvas("stop", environment);
			rmSync(root, { recursive: true, force: true });
		}
	}, 20_000);

	for (const failAt of [
		"root_setup",
		"fixture_setup",
	] as const satisfies readonly FixtureSetupFailure[]) {
		test(`${failAt} removes the registered temp root`, async () => {
			const resources = new AsyncDisposableStack();
			let root: string | null = null;
			try {
				expect(() =>
					prepareProductionFixture(resources, executableSource, {
						failAt,
						onRoot: (value) => void (root = value),
					}),
				).toThrow(`injected production ${failAt.replace("_", " ")} failure`);
			} finally {
				await resources.disposeAsync();
			}
			expect(root).not.toBeNull();
			expect(existsSync(root!)).toBeFalse();
		});
	}

	test("listen failure reaps the spawned server and closes the occupied listener", async () => {
		const resources = new AsyncDisposableStack();
		let root = "";
		let records: ProcessRecord[] = [];
		let blocker: Server | null = null;
		try {
			const fixture = prepareProductionFixture(resources, executableSource, {
				onRoot: (value) => void (root = value),
			});
			blocker = createServer((_request, response) => {
				response.setHeader("content-type", "application/json");
				setTimeout(() => response.end(JSON.stringify({ pid: process.pid })), 50);
			});
			await new Promise<void>((resolve, reject) => {
				blocker?.once("error", reject);
				blocker?.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
			});
			resources.defer(() => closeServer(blocker!));
			const address = blocker.address();
			if (address === null || typeof address === "string") throw new Error("missing blocked port");
			const failure = await startOwnedCanvas({
				serverPath,
				port: address.port,
				vault: fixture.vault,
				env: {
					ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
					ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
					ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
					XDG_STATE_HOME: join(root, "state"),
				},
			}).then(
				() => null,
				(error: unknown) => error,
			);
			expect(failure).toBeInstanceOf(Error);
			records = processRecords(fixture.logPath);
			expect(records.some((record) => record.kind === "canvas_fixture_spawn")).toBeTrue();
		} finally {
			await resources.disposeAsync();
		}
		expect(blocker?.listening).toBeFalse();
		expect(existsSync(root)).toBeFalse();
		await assertProcessesStopped(records);
	}, 20_000);

	test("real first-socket failures close listeners and preserve production recovery", async () => {
		const resources = new AsyncDisposableStack();
		let root = "";
		let canvasPid: number | null = null;
		let records: ProcessRecord[] = [];
		const cleanupOrder: string[] = [];
		try {
			const fixture = prepareProductionFixture(resources, executableSource, {
				onRoot: (value) => void (root = value),
				onRootCleanup: () => void cleanupOrder.push("root"),
			});
			const canvas = await startOwnedCanvas({
				serverPath,
				vault: fixture.vault,
				env: {
					ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
					ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
					ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
					XDG_STATE_HOME: join(root, "state"),
				},
			});
			canvasPid = canvas.pid;
			const request = createRequester(canvas);
			resources.defer(async () => {
				await canvas.dispose();
				cleanupOrder.push("canvas");
			});
			const focusedSocket = await openApplicationSocket(canvas.base, "focused-client");
			resources.defer(() => focusedSocket.close());
			for (const scenario of ["hook_throw", "socket_error", "early_close", "timeout"] as const) {
				const peer =
					scenario === "early_close"
						? await listenLoopbackPeer((socket) => socket.destroy())
						: scenario === "timeout"
							? await listenLoopbackPeer((socket) => socket.resume())
							: null;
				const failureBase =
					scenario === "socket_error"
						? await closedLoopbackEndpoint()
						: (peer?.base ?? canvas.base);
				let socket: WebSocket | null = null;
				const failure = await openApplicationSocket(failureBase, "bound-client", {
					timeoutMs: scenario === "timeout" ? 25 : 2_000,
					onSocket: (value) => {
						socket = value;
						if (scenario === "hook_throw") throw new Error("injected socket hook failure");
					},
				}).then(
					() => null,
					(error: unknown) => error,
				);
				expect(failure, scenario).toBeInstanceOf(Error);
				const partialSocket = socket as WebSocket | null;
				if (partialSocket === null) throw new Error("The partial socket was not captured.");
				expect(partialSocket.readyState, scenario).toBe(WebSocket.CLOSED);
				for (const event of ["message", "open", "error", "close"])
					expect(partialSocket.listenerCount(event), `${scenario}:${event}`).toBe(0);
				await peer?.close();
				if (peer !== null) expect(peer.server.listening, scenario).toBeFalse();

				const recovery = await openApplicationSocket(canvas.base, "bound-client");
				for (const paneRegistration of [
					pane("bound-client", false, true),
					pane("focused-client", true, false),
				]) {
					const registered = await request("/api/panes", {
						method: "POST",
						doing: false,
						body: paneRegistration,
					});
					expect(registered.status, scenario).toBe(200);
				}
				expect(await recovery.request("connect"), scenario).toMatchObject({ ok: true });
				expect(await recovery.request("claimLease"), scenario).toMatchObject({ ok: true });
				expect(await recovery.request("releaseLease"), scenario).toMatchObject({ ok: true });
				await recovery.close();
			}
			const finalSocket = await openApplicationSocket(canvas.base, "cleanup-order");
			resources.defer(async () => {
				await finalSocket.close();
				cleanupOrder.push("socket");
			});
			records = processRecords(fixture.logPath);
		} finally {
			await resources.disposeAsync();
		}
		expect(existsSync(root)).toBeFalse();
		expect(cleanupOrder).toEqual(["socket", "canvas", "root"]);
		await assertProcessesStopped([...records, ...(canvasPid === null ? [] : [{ pid: canvasPid }])]);
	}, 20_000);

	test("Codex child start failure reaps both child and canvas before removing the root", async () => {
		const resources = new AsyncDisposableStack();
		let root = "";
		let records: ProcessRecord[] = [];
		try {
			const fixture = prepareProductionFixture(resources, executableSource, {
				onRoot: (value) => void (root = value),
			});
			const failure = await startOwnedCanvas({
				serverPath,
				vault: fixture.vault,
				env: {
					ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
					ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
					ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
					ARCHBOARD_TEST_PRODUCTION_FAIL_STAGE: "child_start",
					XDG_STATE_HOME: join(root, "state"),
				},
			}).then(
				() => null,
				(error: unknown) => error,
			);
			expect(failure).toBeInstanceOf(Error);
			records = processRecords(fixture.logPath);
			expect(records.some((record) => record.kind === "canvas_fixture_spawn")).toBeTrue();
			expect(records.some((record) => record.kind === "app_server_spawn")).toBeFalse();
		} finally {
			await resources.disposeAsync();
		}
		expect(existsSync(root)).toBeFalse();
		await assertProcessesStopped(records);
	}, 20_000);
});
