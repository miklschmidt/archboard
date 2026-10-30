import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { z } from "zod";

import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import { runOwnedPeerToExit, startOwnedPeer } from "./support/owned-peer-process.ts";
import {
	availablePort,
	HealthSchema,
	portIsReusable,
	ReadySchema,
	sanitizedEnvironment,
} from "./support/process-http.ts";
import { plantStaticProbes } from "./support/static-probes.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const fixture = join(import.meta.dir, "fixtures/server-start-environment.ts");
const healthFixture = join(import.meta.dir, "fixtures/health-responder.ts");
const serverEntry = join(repoRoot, "apps/server/src/server.ts");
const HealthResponderReadySchema = ReadySchema.extend({ port: z.number().int().positive() });

const fixtureEnv = (root: string, mode: "default" | "broad") => ({
	...sanitizedEnvironment(root),
	ARCHBOARD_TEST_SERVER_ENTRY: serverEntry,
	ARCHBOARD_TEST_BIND_MODE: mode,
});

test("default bind owns its PID and exposes only the frontend bundle", async () => {
	await using resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-local-bind-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const hiddenParent = join(root, ".checkout");
	const hiddenRepo = join(hiddenParent, "archboard");
	const { mkdirSync, symlinkSync } = await import("node:fs");
	mkdirSync(hiddenParent);
	symlinkSync(repoRoot, hiddenRepo, "dir");
	const vault = vaultIn(join(root, "boards"));
	const server = await startOwnedServer({
		serverPath: fixture,
		vault,
		env: {
			...fixtureEnv(root, "default"),
			ARCHBOARD_TEST_SERVER_ENTRY: join(hiddenRepo, "apps/server/src/server.ts"),
		},
	});
	resources.defer(() => server.dispose());
	try {
		const healthPayload: unknown = await (await fetch(`${server.base}/health`)).json();
		const health = HealthSchema.parse(healthPayload);
		expect(health.pid).toBe(server.pid!);
		const ipv6 = await fetch(server.base.replace("127.0.0.1", "[::1]") + "/health").catch(
			(error: unknown) => error,
		);
		expect(ipv6).toBeInstanceOf(Error);

		const probes = plantStaticProbes(repoRoot);
		resources.defer(() => probes.restore());
		const statuses = await Promise.all([
			fetch(`${server.base}/${probes.frontend}`).then((response) => response.status),
			fetch(`${server.base}/${probes.stale}`).then((response) => response.status),
			fetch(`${server.base}/${probes.hidden}`).then((response) => response.status),
		]);
		expect(statuses).toEqual([200, 404, 404]);

		const port = Number(new URL(server.base).port);
		for (const mode of ["default", "broad"] as const) {
			const failed = await runOwnedPeerToExit({
				argv: [process.execPath, fixture],
				env: { ...fixtureEnv(root, mode), PORT: String(port) },
			});
			expect(failed.code).not.toBe(0);
			expect(`${failed.stdout}${failed.stderr}`).toMatch(/EADDRINUSE|already.*(?:use|listen)/i);
		}
	} finally {
		await resources.disposeAsync();
	}
}, 20_000);

test("rejects foreign health, recovers the port, and refuses a command outside any vault", async () => {
	await using resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-local-bind-refusal-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const vault = vaultIn(join(root, "boards"));
	const port = await availablePort();
	const foreign = await startOwnedPeer({
		argv: [process.execPath, healthFixture],
		env: {
			...sanitizedEnvironment(root),
			PORT: String(port),
			REPORTED_PID: "999999",
		},
		readySchema: HealthResponderReadySchema,
	});
	resources.defer(() => foreign.dispose());
	try {
		const collision = await startOwnedServer({
			serverPath: fixture,
			port,
			vault,
			env: fixtureEnv(root, "default"),
		}).catch((error: unknown) => error);
		expect(collision).toBeInstanceOf(Error);
		expect((collision as Error).message).toMatch(/not owned pid|answered for pid/i);
		await foreign.dispose();
		const recovered = await startOwnedServer({
			serverPath: fixture,
			port,
			vault,
			env: fixtureEnv(root, "default"),
		});
		resources.defer(() => recovered.dispose());
		expect(recovered.pid).toBeNumber();
		await recovered.dispose();

		// Outside any checkout and any vault, a command finds no vault and refuses
		// before it starts a server (ADR 0049).
		const cliEnv = sanitizedEnvironment(root);
		delete cliEnv["ARCHBOARD_NO_AUTOSTART"];
		const cliPort = await availablePort();
		cliEnv["ARCHBOARD_URL"] = `http://127.0.0.1:${cliPort}`;
		const cli = spawnSync(
			process.execPath,
			[join(repoRoot, "apps/cli/src/bin.ts"), "model", "read", "any"],
			{
				cwd: root,
				env: cliEnv,
				encoding: "utf8",
			},
		);
		expect(cli.status, cli.stderr).toBe(2);
		expect(await portIsReusable(cliPort)).toBe(true);
	} finally {
		await resources.disposeAsync();
	}
}, 20_000);
