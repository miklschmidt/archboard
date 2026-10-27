import { beforeAll, afterAll, expect, test } from "bun:test";
import { readFileSync, writeFileSync, cpSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
	ArchitectureExportResultSchema,
	ArchitectureModuleEditResultSchema,
} from "@archboard/board/model";
import { readArchitectureModel } from "@archboard/board/store-read";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
const repoRoot = resolve(import.meta.dir, "../../..");
const home = mkdtempSync(join(tmpdir(), "archboard-portable-surface-"));
const empty = {
	files: [],
	digest: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
};
function git(root: string, ...args: string[]): void {
	const result = Bun.spawnSync(["git", "-C", root, ...args]);
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}
function destination() {
	const root = join(home, crypto.randomUUID());
	const vault = join(root, ".archboard/vault");
	mkdirSync(vault, { recursive: true });
	git(root, "init", "--quiet");
	git(root, "config", "user.name", "Portable Author");
	git(root, "config", "user.email", "portable@example.test");
	git(root, "config", "commit.gpgsign", "false");
	return { root, vault };
}
let server: OwnedServer | undefined;
let source: ReturnType<typeof destination> | undefined;
beforeAll(async () => {
	source = destination();
	cpSync(join(repoRoot, "examples/canonical-model/.archboard/vault"), source.vault, {
		recursive: true,
	});
	server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault: source.vault,
	});
});
afterAll(async () => {
	await server?.dispose();
	rmSync(home, { recursive: true, force: true });
});
test("CLI and HTTP share strict portable contracts, explicit vaults, exact retry, and refused output preservation", async () => {
	if (server === undefined || source === undefined)
		throw new Error("The portable server fixture is unavailable.");
	const endpoint = `${server.base}/api/architecture/export`;
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
		body: JSON.stringify({ vault: source.vault }),
	});
	expect(response.status).toBe(200);
	expect(response.headers.get("cache-control")).toBe("no-store");
	const exported = ArchitectureExportResultSchema.parse(await response.json());
	if (!exported.success) throw new Error(JSON.stringify(exported));
	const file = join(source.root, "portable.json");
	const cli = runServerCli({
		repoRoot,
		server,
		args: ["model", "export", "--out", file],
		input: undefined,
	});
	expect(cli.status, cli.stderr).toBe(0);
	expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(exported.bundle);
	const target = destination();
	const request = {
		bundle: exported.bundle,
		expectedRevision: empty,
		operationId: "surface-import",
		writer: "agent",
		doing: "restoring a portable model",
	};
	const invalid = await fetch(`${server.base}/api/architecture/import`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ ...request, vault: target.vault, unknown: true }),
	});
	expect(invalid.status).toBe(400);
	const imported = runServerCli({
		repoRoot,
		server,
		vault: target.vault,
		args: ["model", "import"],
		input: JSON.stringify(request),
	});
	expect(imported.status, imported.stderr).toBe(0);
	const { vault: addressed, ...receipt } = z
		.record(z.string(), z.unknown())
		.parse(JSON.parse(imported.stdout));
	expect(addressed).toMatchObject({ path: target.vault, origin: "working-directory" });
	const parsed = ArchitectureModuleEditResultSchema.parse(receipt);
	expect(parsed.success).toBe(true);
	await server.restart();
	const retry = await fetch(`${server.base}/api/architecture/import`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ ...request, vault: target.vault }),
	});
	expect(retry.status).toBe(200);
	expect(ArchitectureModuleEditResultSchema.parse(await retry.json())).toEqual(parsed);
	const stale = await fetch(`${server.base}/api/architecture/import`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ ...request, operationId: "stale-import", vault: target.vault }),
	});
	expect(stale.status).toBe(409);
	expect(await stale.json()).toMatchObject({
		success: false,
		code: "STALE_REVISION",
		applied: false,
	});
	const current = readArchitectureModel(target.vault);
	expect(current.success && current.revision).toEqual(exported.bundle.revision);
	writeFileSync(file, "preserve refused output\n");
	const refused = runServerCli({
		repoRoot,
		server,
		vault: destination().vault,
		args: ["model", "export", "--out", file],
		input: undefined,
	});
	expect(refused.status).toBe(2);
	expect(readFileSync(file, "utf8")).toBe("preserve refused output\n");
}, 30000);
