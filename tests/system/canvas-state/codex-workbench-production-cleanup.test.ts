import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { WebSocket } from "ws";

import { processExists, startOwnedCanvas, waitForProcessExit } from "../support/owned-canvas.ts";
import {
	openApplicationSocket,
	prepareProductionFixture,
	type FixtureSetupFailure,
} from "./support/codex-production.ts";

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

describe.serial("production Codex setup cleanup", () => {
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

	test("first socket open failure closes the partial socket before server and root cleanup", async () => {
		const resources = new AsyncDisposableStack();
		let root = "";
		let socket: WebSocket | null = null;
		let canvasPid: number | null = null;
		try {
			const fixture = prepareProductionFixture(resources, executableSource, {
				onRoot: (value) => void (root = value),
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
			resources.defer(() => canvas.dispose());
			const failure = await openApplicationSocket(canvas.base, "injected-open-failure", {
				failAfterCreate: true,
				onSocket: (value) => void (socket = value),
			}).then(
				() => null,
				(error: unknown) => error,
			);
			expect(failure).toBeInstanceOf(Error);
			const partialSocket = socket as WebSocket | null;
			if (partialSocket === null) throw new Error("The partial socket was not captured.");
			expect(partialSocket.readyState).toBe(WebSocket.CLOSED);
			expect(partialSocket.listenerCount("message")).toBe(0);
			expect(partialSocket.listenerCount("open")).toBe(0);
			expect(partialSocket.listenerCount("error")).toBe(0);
		} finally {
			await resources.disposeAsync();
		}
		expect(existsSync(root)).toBeFalse();
		if (canvasPid !== null) await assertProcessesStopped([{ pid: canvasPid }]);
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
