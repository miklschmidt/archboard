import { afterAll, beforeAll, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { ArchitectureArchiveInitializationSchema } from "@archboard/board/model";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const home = mkdtempSync(join(tmpdir(), "archboard-private-surface-"));
const vault = vaultIn(home);
let server: OwnedServer | undefined;
beforeAll(async () => {
	cpSync(join(repoRoot, "examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault,
	});
});
afterAll(async () => {
	await server?.dispose();
	rmSync(home, { recursive: true, force: true });
});

test("CLI and HTTP explicitly initialize the same local-only archive and preserve setup across restart", async () => {
	if (server === undefined) throw new Error("The server did not start");
	const endpoint = `${server.base}/api/architecture/archive/init`;
	expect(
		(
			await fetch(endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{}",
			})
		).status,
	).toBe(400);
	const response = await fetch(endpoint, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ vault }),
	});
	expect(response.status).toBe(200);
	expect(response.headers.get("cache-control")).toBe("no-store");
	const initialized = ArchitectureArchiveInitializationSchema.parse(await response.json());
	expect(initialized).toMatchObject({ success: true });
	const cli = runServerCli({ repoRoot, server, input: undefined, args: ["model", "archive-init"] });
	expect(cli.status, cli.stderr).toBe(0);
	const { vault: addressed, ...result } = z
		.record(z.string(), z.unknown())
		.parse(JSON.parse(cli.stdout));
	expect(addressed).toMatchObject({ path: vault, origin: "working-directory" });
	expect(ArchitectureArchiveInitializationSchema.parse(result)).toEqual(initialized);
	await server.restart();
	const retried = await fetch(`${server.base}/api/architecture/archive/init`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ vault }),
	});
	expect(ArchitectureArchiveInitializationSchema.parse(await retried.json())).toEqual(initialized);
	expect(existsSync(join(home, ".git"))).toBe(false);
	const invalid = await fetch(`${server.base}/api/architecture/archive/init`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ vault, remote: "implicit" }),
	});
	expect(invalid.status).toBe(400);
}, 30000);
