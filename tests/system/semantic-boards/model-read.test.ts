import { afterAll, beforeAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { ArchitectureModelReadSchema } from "@archboard/board/model";
import { readArchitectureModel } from "@archboard/board/store-read";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const home = mkdtempSync(join(tmpdir(), "archboard-model-surface-"));
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

test("CLI and HTTP expose the same public model read and structured refusal", async () => {
	if (server === undefined) throw new Error("The server did not start");
	const query = new URLSearchParams({ vault, module: "Gateway" });
	const response = await fetch(`${server.base}/api/architecture/model?${query}`);
	expect(response.status).toBe(200);
	const http = ArchitectureModelReadSchema.parse(await response.json());
	expect(http).toEqual(readArchitectureModel(vault, "Gateway"));
	const cli = runServerCli({
		repoRoot,
		server,
		args: ["model", "read", "Gateway"],
		input: undefined,
	});
	expect(cli.status, cli.stderr).toBe(0);
	const { vault: addressed, ...cliResult } = z
		.record(z.string(), z.unknown())
		.parse(JSON.parse(cli.stdout));
	expect(addressed).toMatchObject({ path: vault, origin: "working-directory" });
	expect(ArchitectureModelReadSchema.parse(cliResult)).toEqual(http);
	const missingVault = await fetch(`${server.base}/api/architecture/model`);
	expect(missingVault.status).toBe(400);
	const unsupportedState = await fetch(
		`${server.base}/api/architecture/model?${query}&state=missing`,
	);
	expect(unsupportedState.status).toBe(400);
	writeFileSync(join(vault, "bad.module.json"), "{");
	const failedHttp = await fetch(`${server.base}/api/architecture/model?${query}`);
	expect(failedHttp.status).toBe(422);
	const failure = ArchitectureModelReadSchema.parse(await failedHttp.json());
	expect(failure).toMatchObject({ success: false, code: "MODEL_INVALID" });
	const failedCli = runServerCli({ repoRoot, server, args: ["model", "read"], input: undefined });
	expect(failedCli.status, failedCli.stderr).toBe(2);
	const { vault: _vault, ...failedResult } = z
		.record(z.string(), z.unknown())
		.parse(JSON.parse(failedCli.stdout));
	expect(ArchitectureModelReadSchema.parse(failedResult)).toEqual(failure);
});
