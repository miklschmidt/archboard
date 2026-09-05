import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import {
	openApplicationSocket,
	prepareProductionFixture,
	type WorkbenchResult,
} from "../canvas-state/support/codex-production.ts";
import { createRequester, waitFor } from "../canvas-state/support/http.ts";
import { processExists } from "../support/owned-canvas.ts";
import {
	extendFixture,
	type FixtureRecord,
	pane,
	records,
	snapshot,
	startCanvas,
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
		const startup = await startCanvas({ ...fixture, readinessTimeoutMs: 3_000 }).then(
			(canvas) => ({ canvas, error: null }),
			(error: unknown) => ({ canvas: null, error }),
		);
		if (startup.canvas === null) {
			expect(String(startup.error), mode).toContain(
				"The production Codex workbench did not become ready.",
			);
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
		const canvas = startup.canvas;
		resources.defer(() => canvas.dispose());
		const request = createRequester({ base: canvas.base, assertRunning: async () => undefined });
		const clientId = `storage-${mode}`;
		const socket = await openApplicationSocket(canvas.base, clientId);
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
				`${mode} did not expose its storage refusal. Last snapshot: ${JSON.stringify(observed)}\n${canvas.output()}\n${readFileSync(fixture.logPath, "utf8")}`,
				{ cause: error },
			);
		});
		expect(`${JSON.stringify(refusal)}\n${canvas.output()}`, mode).toMatch(
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
		let canvas: Awaited<ReturnType<typeof startCanvas>> | null = null;
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
			canvas = await startCanvas(fixture);
			const ownedCanvas = canvas;
			resources.defer(() => ownedCanvas.dispose());
			const clientId = "managed-requirements";
			const socket = await openApplicationSocket(canvas.base, clientId);
			resources.defer(() => socket.close());
			const request = createRequester({ base: canvas.base, assertRunning: async () => undefined });
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
			const root = join(fixture.root, "state/excalidraw-canvas/codex-workbench");
			const codexHome = join(root, "codex-home");
			const sqliteHome = join(root, "sqlite-home");
			const configPath = join(codexHome, "config.toml");
			const configBytes = `sqlite_home = ${JSON.stringify(sqliteHome)}\n`;
			expect(readFileSync(configPath, "utf8")).toBe(configBytes);
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
			expect(Object.keys(managed ?? {})).toHaveLength(30);
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
			await canvas.dispose();
			canvas = null;
			expect(processExists(childPid)).toBeFalse();
			expect(readFileSync(configPath, "utf8")).toBe(configBytes);
			expect(statSync(configPath).mtimeMs).toBe(publishedAt);
		} finally {
			await canvas?.dispose();
			await resources.disposeAsync();
		}
	}, 30_000);

	test("isolates two live production homes and child processes", async () => {
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
			const canvases = await Promise.all(fixtures.map((fixture) => startCanvas(fixture)));
			for (const canvas of canvases) {
				resources.defer(() => canvas.dispose());
			}
			const childPids = fixtures.map(
				(fixture) =>
					records(fixture.logPath).find((entry) => entry.kind === "app_server_spawn")?.pid,
			);
			expect(childPids.every((pid) => typeof pid === "number")).toBeTrue();
			expect(new Set(childPids).size).toBe(2);
			const homes = fixtures.map((fixture) =>
				join(fixture.root, "state/excalidraw-canvas/codex-workbench/codex-home"),
			);
			expect(new Set(homes).size).toBe(2);
			for (const [index, canvas] of canvases.entries()) {
				const clientId = `two-home-${index}`;
				const request = createRequester({
					base: canvas.base,
					assertRunning: async () => undefined,
				});
				const socket = await openApplicationSocket(canvas.base, clientId);
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
