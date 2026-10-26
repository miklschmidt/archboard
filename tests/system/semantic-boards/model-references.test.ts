import { afterAll, beforeAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { ArchitectureModelReadSchema } from "@archboard/board/model";
import { readArchitectureModel } from "@archboard/board/store-read";
import { retainArchitectureCheckpoint } from "@archboard/board/store-write";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const home = mkdtempSync(join(tmpdir(), "archboard-references-surface-"));
const local = join(home, "shop");
const foreign = join(home, "ledger");
const vault = join(local, ".archboard/vault");
let server: OwnedServer | undefined;

function git(root: string, ...args: string[]) {
	const result = Bun.spawnSync(["git", "-C", root, ...args]);
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

beforeAll(async () => {
	for (const [root, id, repository] of [
		[local, "Shop", "shop"],
		[foreign, "Ledger", "ledger"],
	]) {
		const target = join(root!, ".archboard/vault");
		cpSync(join(repoRoot, "examples/canonical-model/.archboard/vault"), target, {
			recursive: true,
		});
		const current = readArchitectureModel(target);
		if (!current.success) throw new Error(JSON.stringify(current));
		for (const file of ["model.json", ...current.modules.map((module) => module.file)]) {
			const path = join(target, file);
			writeFileSync(
				path,
				readFileSync(path, "utf8")
					.replaceAll("Shop", id!)
					.replaceAll("acme/shop", `acme/${repository}`),
			);
		}
		git(root!, "init", "--quiet");
		git(root!, "config", "user.name", "Reference Author");
		git(root!, "config", "user.email", "reference@example.test");
		const key = join(root!, ".git/signing");
		const generated = Bun.spawnSync(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", key]);
		if (generated.exitCode !== 0) throw new Error(generated.stderr.toString());
		git(root!, "config", "gpg.format", "ssh");
		git(root!, "config", "user.signingkey", key);
		git(root!, "config", "commit.gpgsign", "true");
		git(root!, "remote", "add", "origin", `https://github.com/acme/${repository}.git`);
		writeFileSync(join(root!, "code.ts"), "export const value = 1;\n");
		git(root!, "add", ".");
		git(root!, "commit", "--quiet", "-m", "test: seed architecture");
	}
	const foreignVault = join(foreign, ".archboard/vault");
	const current = readArchitectureModel(foreignVault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const retained = await retainArchitectureCheckpoint(foreignVault, {
		target: "current",
		writer: "agent",
		operationId: "foreign",
		doing: "retaining foreign architecture",
		expectedRevision: current.revision.digest,
		dependencies: [],
	});
	if (!retained.success) throw new Error(JSON.stringify(retained));
	const path = join(vault, "gateway.module.json");
	const gateway = JSON.parse(readFileSync(path, "utf8"));
	writeFileSync(
		path,
		JSON.stringify({
			...gateway,
			binding: { repo: "github.com/acme/shop", path: "code.ts" },
			references: [
				{
					repo: "github.com/acme/ledger",
					model: "Ledger",
					subject: "Ledger#Gateway",
					state: "current",
				},
			],
		}),
	);
	server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault,
	});
	const registered = cli(["repo", "add", foreign]);
	if (registered.status !== 0) throw new Error(registered.stderr);
});

afterAll(async () => {
	await server?.dispose();
	rmSync(home, { recursive: true, force: true });
});

function cli(args: string[]) {
	if (!server) throw new Error("Server unavailable");
	return runServerCli({ repoRoot, server, args, input: undefined });
}

function answer(stdout: string) {
	const { vault: _vault, ...value } = z.record(z.string(), z.unknown()).parse(JSON.parse(stdout));
	return ArchitectureModelReadSchema.parse(value);
}

test("CLI and HTTP share explicit code resolution, foreign navigation and unavailable outcomes", async () => {
	if (!server) throw new Error("Server unavailable");
	const query = new URLSearchParams({
		vault,
		module: "Shop#Gateway",
		model: "Shop",
		references: "true",
		code: "true",
	});
	const response = await fetch(`${server.base}/api/architecture/model?${query}`);
	expect(response.status).toBe(200);
	const http = ArchitectureModelReadSchema.parse(await response.json());
	const read = cli(["model", "read", "Shop#Gateway", "--model", "Shop", "--references", "--code"]);
	expect(read.status, read.stderr).toBe(0);
	expect(answer(read.stdout)).toEqual(http);
	expect(http).toMatchObject({
		success: true,
		codeTarget: { ok: true },
		resolvedReferences: [{ status: "available" }],
	});
	const followed = cli(["model", "read", "Shop#Gateway", "--reference", "0"]);
	expect(followed.status, followed.stderr).toBe(0);
	expect(answer(followed.stdout)).toMatchObject({
		success: true,
		selectedModule: "Ledger#Gateway",
		location: { model: "Ledger", vault: join(foreign, ".archboard/vault") },
	});
	rmSync(join(foreign, ".archboard/vault/model.json"));
	const unavailable = cli(["model", "read", "Shop#Gateway", "--reference", "0"]);
	expect(unavailable.status).toBe(2);
	expect(answer(unavailable.stdout)).toMatchObject({
		success: false,
		code: "REFERENCE_UNAVAILABLE",
	});
	query.set("reference", "0");
	expect((await fetch(`${server.base}/api/architecture/model?${query}`)).status).toBe(404);
	query.set("reference", "-1");
	expect((await fetch(`${server.base}/api/architecture/model?${query}`)).status).toBe(400);
});
