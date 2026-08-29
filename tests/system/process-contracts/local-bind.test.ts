import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { z } from "zod";

import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { runOwnedPeerToExit, startOwnedPeer } from "./support/owned-peer-process.ts";
import { availablePort, ReadySchema, sanitizedEnvironment } from "./support/process-http.ts";
import { plantStaticProbes } from "./support/static-probes.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const fixture = join(import.meta.dir, "fixtures/canvas-start-environment.ts");
const healthFixture = join(import.meta.dir, "fixtures/health-responder.ts");
const serverEntry = join(repoRoot, "src/server.ts");
const HealthResponderReadySchema = ReadySchema.extend({ port: z.number().int().positive() });

const fixtureEnv = (root: string, vault: string, mode: "default" | "broad" | "no-vault") => ({
	...sanitizedEnvironment(root, vault),
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
	const vault = join(root, "vault");
	const canvas = await startOwnedCanvas({
		serverPath: fixture,
		vault,
		env: {
			...fixtureEnv(root, vault, "default"),
			ARCHBOARD_TEST_SERVER_ENTRY: join(hiddenRepo, "src/server.ts"),
		},
	});
	resources.defer(() => canvas.dispose());
	try {
		const healthPayload: unknown = await (await fetch(`${canvas.base}/health`)).json();
		const health = ReadySchema.parse(healthPayload);
		expect(health.pid).toBe(canvas.pid!);
		const ipv6 = await fetch(canvas.base.replace("127.0.0.1", "[::1]") + "/health").catch(
			(error: unknown) => error,
		);
		expect(ipv6).toBeInstanceOf(Error);

		const css = await fetch(`${canvas.base}/assets/excalidraw.css`);
		expect(css.status).toBe(200);
		expect(css.headers.get("content-type")).toMatch(/^text\/css(?:;|$)/i);
		expect(Buffer.from(await css.arrayBuffer())).toEqual(
			readFileSync(join(repoRoot, "node_modules/@excalidraw/excalidraw/dist/prod/index.css")),
		);

		const probes = plantStaticProbes(repoRoot);
		resources.defer(() => probes.restore());
		const statuses = await Promise.all([
			fetch(`${canvas.base}/${probes.frontend}`).then((response) => response.status),
			fetch(`${canvas.base}/${probes.stale}`).then((response) => response.status),
			fetch(`${canvas.base}/${probes.hidden}`).then((response) => response.status),
		]);
		expect(statuses).toEqual([200, 404, 404]);

		const port = Number(new URL(canvas.base).port);
		for (const mode of ["default", "broad"] as const) {
			const failed = await runOwnedPeerToExit({
				argv: [process.execPath, fixture],
				env: { ...fixtureEnv(root, vault, mode), PORT: String(port) },
			});
			expect(failed.code).not.toBe(0);
			expect(`${failed.stdout}${failed.stderr}`).toMatch(/EADDRINUSE|already.*(?:use|listen)/i);
		}
	} finally {
		await resources.disposeAsync();
	}
}, 20_000);

test("rejects foreign health, recovers the port, and refuses no-vault startup", async () => {
	await using resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-local-bind-refusal-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const vault = join(root, "vault");
	const port = await availablePort();
	const foreign = await startOwnedPeer({
		argv: [process.execPath, healthFixture],
		env: {
			...sanitizedEnvironment(root, vault),
			PORT: String(port),
			REPORTED_PID: "999999",
		},
		readySchema: HealthResponderReadySchema,
	});
	resources.defer(() => foreign.dispose());
	try {
		const collision = await startOwnedCanvas({
			serverPath: fixture,
			port,
			vault,
			env: fixtureEnv(root, vault, "default"),
		}).catch((error: unknown) => error);
		expect(collision).toBeInstanceOf(Error);
		expect((collision as Error).message).toMatch(/not owned pid|answered for pid/i);
		await foreign.dispose();
		const recovered = await startOwnedCanvas({
			serverPath: fixture,
			port,
			vault,
			env: fixtureEnv(root, vault, "default"),
		});
		resources.defer(() => recovered.dispose());
		expect(recovered.pid).toBeNumber();
		await recovered.dispose();

		const noVaultPort = await availablePort();
		const noVault = await runOwnedPeerToExit({
			argv: [process.execPath, fixture],
			env: { ...fixtureEnv(root, vault, "no-vault"), PORT: String(noVaultPort) },
		});
		expect(noVault.code).not.toBe(0);
		for (const text of ["no vault", "install-skill", "ARCHBOARD_VAULT"])
			expect(`${noVault.stdout}${noVault.stderr}`).toContain(text);

		const cliEnv = sanitizedEnvironment(root, vault);
		delete cliEnv.ARCHBOARD_VAULT;
		delete cliEnv.EXCALIDRAW_NO_AUTOSTART;
		cliEnv.EXPRESS_SERVER_URL = `http://127.0.0.1:${await availablePort()}`;
		const cli = spawnSync(process.execPath, [join(repoRoot, "src/bin.ts"), "board", "list"], {
			cwd: repoRoot,
			env: cliEnv,
			encoding: "utf8",
		});
		expect(cli.status).toBe(3);
		expect(cli.stderr).toContain("install-skill");
	} finally {
		await resources.disposeAsync();
	}
}, 20_000);
