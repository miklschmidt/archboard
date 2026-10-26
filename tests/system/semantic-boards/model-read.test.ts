import { afterAll, beforeAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
	ArchitectureCheckpointRetainSchema,
	ArchitectureCheckpointListSchema,
	ArchitectureModelReadSchema,
} from "@archboard/board/model";
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
	const git = (...args: string[]) => {
		const result = Bun.spawnSync(["git", "-C", home, ...args]);
		if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	};
	git("init", "--quiet");
	git("config", "user.name", "Surface Author");
	git("config", "user.email", "surface@example.test");
	const key = join(home, ".git/signing");
	const generated = Bun.spawnSync(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", key]);
	if (generated.exitCode !== 0) throw new Error(generated.stderr.toString());
	git("config", "gpg.format", "ssh");
	git("config", "user.signingkey", key);
	git("config", "commit.gpgsign", "true");
	git("add", ".");
	git("commit", "--quiet", "-m", "test: seed architecture");
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

test("CLI and HTTP retain, list and reopen one exact checkpoint after current content changes", async () => {
	if (server === undefined) throw new Error("The server did not start");
	rmSync(join(vault, "bad.module.json"), { force: true });
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const retainedCli = runServerCli({
		repoRoot,
		server,
		args: [
			"model",
			"retain",
			"--operation-id",
			"surface-checkpoint",
			"--writer",
			"surface-agent",
			"--expect-revision",
			current.revision.digest,
			"--doing",
			"retaining the surface fixture",
		],
		input: undefined,
	});
	expect(retainedCli.status, retainedCli.stderr).toBe(0);
	const { vault: _retainedVault, ...retainedResult } = z
		.record(z.string(), z.unknown())
		.parse(JSON.parse(retainedCli.stdout));
	const retained = ArchitectureCheckpointRetainSchema.parse(retainedResult);
	if (!retained.success) throw new Error(JSON.stringify(retained));
	writeFileSync(join(vault, "gateway.module.json"), "{");
	const query = new URLSearchParams({
		vault,
		checkpoint: retained.checkpoint.id,
		module: "Shop#Gateway",
	});
	const response = await fetch(`${server.base}/api/architecture/model?${query}`);
	expect(response.status).toBe(200);
	const exact = ArchitectureModelReadSchema.parse(await response.json());
	expect(exact).toMatchObject({
		...current,
		selectedModule: "Shop#Gateway",
		checkpoint: retained.checkpoint,
	});
	const readCli = runServerCli({
		repoRoot,
		server,
		args: ["model", "read", "Shop#Gateway", "--checkpoint", retained.checkpoint.id],
		input: undefined,
	});
	expect(readCli.status, readCli.stderr).toBe(0);
	const { vault: _readVault, ...readResult } = z
		.record(z.string(), z.unknown())
		.parse(JSON.parse(readCli.stdout));
	expect(ArchitectureModelReadSchema.parse(readResult)).toEqual(exact);
	const listCli = runServerCli({
		repoRoot,
		server,
		args: ["model", "checkpoints"],
		input: undefined,
	});
	expect(listCli.status, listCli.stderr).toBe(0);
	const { vault: _listVault, ...listResult } = z
		.record(z.string(), z.unknown())
		.parse(JSON.parse(listCli.stdout));
	const list = ArchitectureCheckpointListSchema.parse(listResult);
	expect(list).toMatchObject({ success: true, checkpoints: [retained.checkpoint] });
	const listedHttp = await fetch(
		`${server.base}/api/architecture/checkpoints?vault=${encodeURIComponent(vault)}`,
	);
	expect(ArchitectureCheckpointListSchema.parse(await listedHttp.json())).toEqual(list);
	const unavailableCli = runServerCli({
		repoRoot,
		server,
		args: ["model", "read", "--checkpoint", "f".repeat(40)],
		input: undefined,
	});
	expect(unavailableCli.status).toBe(2);
	const { vault: _unavailableVault, ...unavailableResult } = z
		.record(z.string(), z.unknown())
		.parse(JSON.parse(unavailableCli.stdout));
	expect(ArchitectureModelReadSchema.parse(unavailableResult)).toMatchObject({
		success: false,
		code: "ARCHITECTURE_UNAVAILABLE",
	});
	const missingVault = await fetch(`${server.base}/api/architecture/checkpoints`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({}),
	});
	expect(missingVault.status).toBe(400);
});
