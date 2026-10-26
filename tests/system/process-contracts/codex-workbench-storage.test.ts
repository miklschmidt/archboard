import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import {
	openApplicationSocket,
	prepareProductionFixture,
	type WorkbenchResult,
} from "../server-state/support/codex-production.ts";
import { createRequester, waitFor } from "../server-state/support/http.ts";
import { processExists } from "../support/owned-server.ts";
import {
	extendFixture,
	codexWorkbenchRoot,
	type FixtureRecord,
	pane,
	records,
	snapshot,
	startServer,
	type StorageMode,
} from "./support/codex-workbench-lifecycle.ts";

async function expectStorageRefusal(mode: StorageMode): Promise<void> {
	const resources = new AsyncDisposableStack();
	try {
		const staging = join(
			process.env["TMPDIR"] ?? "/tmp",
			`archboard-lifecycle-storage-${process.pid}-${mode}`,
		);
		rmSync(staging, { recursive: true, force: true });
		mkdirSync(staging, { recursive: true });
		resources.defer(() => rmSync(staging, { recursive: true, force: true }));
		const fixture = prepareProductionFixture(resources, extendFixture(staging, mode));
		// A refusing server exits at once, so this bound only matters for a server that
		// hangs. It must still cover a cold Bun start on a hosted macOS runner (3.9 s seen).
		const startup = await startServer({ ...fixture, readinessTimeoutMs: 10_000 }).then(
			(server) => ({ server, error: null }),
			(error: unknown) => ({ server: null, error }),
		);
		if (startup.server === null) {
			expect(String(startup.error), mode).toContain("Codex did not become ready.");
			const initialization = records(fixture.logPath).find(
				(entry) => entry.kind === "response" && entry.method === "initialize",
			) as FixtureRecord & { readonly result?: Record<string, unknown> };
			const configRead = records(fixture.logPath).find(
				(entry) => entry.kind === "response" && entry.method === "config/read",
			) as FixtureRecord & { readonly result?: { readonly config?: Record<string, unknown> } };
			const reported = configRead.result?.config?.["sqlite_home"];
			if (mode === "env-only") {
				expect(configRead.result?.config, mode).not.toHaveProperty("sqlite_home");
			} else if (mode === "null") {
				expect(reported, mode).toBeNull();
			} else if (mode === "redirected") {
				expect(initialization.result?.["codexHome"], mode).toContain("/sqlite-home");
			} else if (mode === "symlink") {
				expect(reported, mode).toContain("/sqlite-alias");
			} else if (mode === "requirements-conflict") {
				const requirements = records(fixture.logPath).find(
					(entry) => entry.kind === "response" && entry.method === "configRequirements/read",
				) as FixtureRecord & {
					readonly result?: { readonly requirements?: { readonly sqliteHome?: unknown } };
				};
				expect(requirements.result?.requirements?.sqliteHome, mode).toContain(
					"/conflicting-sqlite",
				);
			} else {
				expect(reported, mode).toContain("/conflicting-sqlite");
			}
			return;
		}
		const server = startup.server;
		resources.defer(() => server.dispose());
		const request = createRequester({
			base: server.base,
			assertRunning: async () => undefined,
			vault: server.vault,
		});
		const clientId = `storage-${mode}`;
		const socket = await openApplicationSocket(server.base, clientId);
		resources.defer(() => socket.close());
		expect(
			(
				await request("/api/panes", {
					method: "POST",
					doing: false,
					body: { ...pane(clientId), paneId: `${clientId}-pane` },
				})
			).status,
			mode,
		).toBe(200);
		await waitFor(async () => {
			const result = await socket.request("connect");
			return result.ok ? result : undefined;
		}, `${mode} workbench connection`);
		let observed: WorkbenchResult | undefined;
		const refusal = await waitFor(async () => {
			const result = await socket.request("snapshot");
			observed = result;
			if (!result.ok) {
				return result;
			}
			const value = snapshot(result);
			const readiness = value["readiness"] as Record<string, unknown>;
			return readiness["state"] === "unavailable" ? readiness : undefined;
		}, `${mode} storage refusal`).catch((error: unknown) => {
			throw new Error(
				`${mode} did not expose its storage refusal. Last snapshot: ${JSON.stringify(observed)}\n${server.output()}\n${readFileSync(fixture.logPath, "utf8")}`,
				{ cause: error },
			);
		});
		expect(`${JSON.stringify(refusal)}\n${server.output()}`, mode).toMatch(
			/storage proof refused|storage is unavailable/i,
		);
	} finally {
		await resources.disposeAsync();
	}
}
describe.serial("composed Codex process lifecycle", () => {
	test("refuses env-only, null, redirected, symlinked, and conflicting stores", async () => {
		for (const mode of [
			"env-only",
			"null",
			"redirected",
			"symlink",
			"conflicting",
			"requirements-conflict",
		] as const) {
			await expectStorageRefusal(mode);
		}
	}, 45_000);

	test("accepts and preserves the exact managed sqlite requirement", async () => {
		const resources = new AsyncDisposableStack();
		let server: Awaited<ReturnType<typeof startServer>> | null = null;
		try {
			const staging = join(
				process.env["TMPDIR"] ?? "/tmp",
				`archboard-lifecycle-requirements-${process.pid}`,
			);
			rmSync(staging, { recursive: true, force: true });
			mkdirSync(staging, { recursive: true });
			resources.defer(() => rmSync(staging, { recursive: true, force: true }));
			const fixture = prepareProductionFixture(
				resources,
				extendFixture(staging, "requirements-match"),
			);
			server = await startServer(fixture);
			const ownedServer = server;
			resources.defer(() => ownedServer.dispose());
			const clientId = "managed-requirements";
			const socket = await openApplicationSocket(server.base, clientId);
			resources.defer(() => socket.close());
			const request = createRequester({
				base: server.base,
				assertRunning: async () => undefined,
				vault: server.vault,
			});
			expect(
				(
					await request("/api/panes", {
						method: "POST",
						doing: false,
						body: { ...pane(clientId), paneId: `${clientId}-pane` },
					})
				).status,
			).toBe(200);
			await waitFor(async () => {
				const result = await socket.request("connect");
				return result.ok ? result : undefined;
			}, "managed-requirement workbench readiness");
			const state = snapshot(await socket.request("snapshot"));
			expect(state["readiness"]).toMatchObject({ state: "thread_capable" });
			const root = codexWorkbenchRoot(fixture.root);
			const codexHome = join(root, "codex-home");
			const sqliteHome = join(root, "sqlite-home");
			const configPath = join(codexHome, "config.toml");
			const configBytes = readFileSync(configPath, "utf8");
			expect(configBytes).toStartWith(`sqlite_home = ${JSON.stringify(sqliteHome)}\n`);
			const publishedAt = statSync(configPath).mtimeMs;
			const initialize = records(fixture.logPath).find(
				(entry) => entry.kind === "response" && entry.method === "initialize",
			) as FixtureRecord & { readonly result?: Record<string, unknown> };
			const config = records(fixture.logPath).find(
				(entry) => entry.kind === "response" && entry.method === "config/read",
			) as FixtureRecord & { readonly result?: Record<string, unknown> };
			const requirements = records(fixture.logPath).find(
				(entry) => entry.kind === "response" && entry.method === "configRequirements/read",
			) as FixtureRecord & {
				readonly result?: { readonly requirements?: Record<string, unknown> };
			};
			expect(initialize.result?.["codexHome"]).toBe(codexHome);
			expect(config.result).toMatchObject({
				config: { sqlite_home: sqliteHome },
				origins: { sqlite_home: { name: { type: "user", file: configPath, profile: null } } },
			});
			const managed = requirements.result?.requirements;
			expect(managed?.["sqliteHome"]).toBe(sqliteHome);
			expect(Object.keys(managed ?? {})).toHaveLength(33);
			expect(
				Object.entries(managed ?? {}).every(
					([key, value]) => key === "sqliteHome" || value === null,
				),
			).toBeTrue();
			const childPid = records(fixture.logPath).find(
				(entry) => entry.kind === "app_server_spawn",
			)?.pid;
			if (childPid === undefined) {
				throw new Error("The managed-requirement child did not start.");
			}
			await server.dispose();
			server = null;
			expect(processExists(childPid)).toBeFalse();
			expect(readFileSync(configPath, "utf8")).toBe(configBytes);
			expect(statSync(configPath).mtimeMs).toBe(publishedAt);
		} finally {
			await server?.dispose();
			await resources.disposeAsync();
		}
	}, 30_000);

	test("isolates two live production homes and child processes, each naming its own server", async () => {
		const resources = new AsyncDisposableStack();
		try {
			const staging = join(
				process.env["TMPDIR"] ?? "/tmp",
				`archboard-lifecycle-two-home-${process.pid}`,
			);
			rmSync(staging, { recursive: true, force: true });
			mkdirSync(staging, { recursive: true });
			resources.defer(() => rmSync(staging, { recursive: true, force: true }));
			const extendedSource = extendFixture(staging);
			const fixtures = [
				prepareProductionFixture(resources, extendedSource),
				prepareProductionFixture(resources, extendedSource),
			] as const;
			const servers = await Promise.all(fixtures.map((fixture) => startServer(fixture)));
			for (const server of servers) {
				resources.defer(() => server.dispose());
			}
			const spawns = fixtures.map((fixture) =>
				records(fixture.logPath).find((entry) => entry.kind === "app_server_spawn"),
			);
			const childPids = spawns.map((spawn) => spawn?.pid);
			expect(childPids.every((pid) => typeof pid === "number")).toBeTrue();
			expect(new Set(childPids).size).toBe(2);
			// A thread's CLI reads these, so each child must name the server that started it. A
			// thread's command finds its vault from its directory or -C (ADR 0050).
			for (const [index, spawn] of spawns.entries()) {
				expect(spawn?.archboard).toEqual({
					ARCHBOARD_URL: servers[index]!.base,
					ARCHBOARD_NO_AUTOSTART: "1",
				});
			}
			const homes = fixtures.map((fixture) => join(codexWorkbenchRoot(fixture.root), "codex-home"));
			expect(new Set(homes).size).toBe(2);
			for (const [index, server] of servers.entries()) {
				const clientId = `two-home-${index}`;
				const request = createRequester({
					base: server.base,
					assertRunning: async () => undefined,
					vault: server.vault,
				});
				const socket = await openApplicationSocket(server.base, clientId);
				resources.defer(() => socket.close());
				expect(
					(
						await request("/api/panes", {
							method: "POST",
							doing: false,
							body: { ...pane(clientId), paneId: `${clientId}-pane` },
						})
					).status,
				).toBe(200);
				await waitFor(async () => {
					const result = await socket.request("connect");
					return result.ok ? result : undefined;
				}, `${clientId} connection`);
				const initialized = records(fixtures[index]!.logPath).find(
					(entry) => entry.kind === "response" && entry.method === "initialize",
				) as FixtureRecord & { readonly result?: Record<string, unknown> };
				expect(initialized.result?.["codexHome"]).toBe(homes[index]);
			}
		} finally {
			await resources.disposeAsync();
		}
	}, 30_000);
});
