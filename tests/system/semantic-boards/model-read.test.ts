import { afterAll, beforeAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
	ArchitectureCheckpointRetainSchema,
	ArchitectureCheckpointListSchema,
	ArchitectureModelReadSchema,
	ArchitecturePublicationSchema,
} from "@archboard/board/model";
import { retainArchitectureCheckpoint } from "@archboard/board/store-write";
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

// This composed adapter workflow includes signed retention and a real bare remote.
test("publication adapters preserve runtime status across a server restart", async () => {
	if (server === undefined) throw new Error("The server did not start");
	cpSync(join(repoRoot, "examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	rmSync(join(vault, "bad.module.json"), { force: true });
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const retained = await retainArchitectureCheckpoint(vault, {
		target: "current",
		operationId: "surface-publication",
		writer: "surface-agent",
		doing: "retaining publication fixture",
		expectedRevision: current.revision.digest,
		dependencies: [],
	});
	if (!retained.success) throw new Error(JSON.stringify(retained));
	const remote = join(home, "archive.git");
	for (const args of [
		["init", "--quiet", "--bare", remote],
		["remote", "add", "archive", `file://${remote}`],
	]) {
		const git = Bun.spawnSync(["git", "-C", home, ...args]);
		if (git.exitCode !== 0) throw new Error(git.stderr.toString());
	}
	const configured = runServerCli({
		repoRoot,
		server,
		input: undefined,
		args: [
			"model",
			"publication-configure",
			"--remote",
			"archive",
			"--ref",
			"refs/heads/archboard-history",
		],
	});
	expect(configured.status, configured.stderr).toBe(0);
	const published = runServerCli({
		repoRoot,
		server,
		input: undefined,
		args: [
			"model",
			"publish",
			retained.checkpoint.id,
			"--remote",
			"archive",
			"--ref",
			"refs/heads/archboard-history",
		],
	});
	expect(published.status, published.stderr).toBe(0);
	await server.dispose();
	server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault,
	});
	const query = new URLSearchParams({ vault, checkpoint: retained.checkpoint.id });
	const response = await fetch(`${server.base}/api/architecture/publication?${query}`);
	expect(response.status).toBe(200);
	expect(response.headers.get("cache-control")).toBe("no-store");
	const status = ArchitecturePublicationSchema.parse(await response.json());
	expect(status).toMatchObject({
		success: true,
		publication: "published",
		checkpoint: retained.checkpoint.id,
	});
	const cli = runServerCli({
		repoRoot,
		server,
		input: undefined,
		args: ["model", "publication", retained.checkpoint.id],
	});
	expect(cli.status, cli.stderr).toBe(0);
	const { vault: _addressed, ...result } = z
		.record(z.string(), z.unknown())
		.parse(JSON.parse(cli.stdout));
	expect(ArchitecturePublicationSchema.parse(result)).toEqual(status);
	const failed = runServerCli({
		repoRoot,
		server,
		input: undefined,
		args: [
			"model",
			"fetch",
			"f".repeat(40),
			"--remote",
			"archive",
			"--ref",
			"refs/heads/archboard-history",
		],
	});
	expect(failed.status).toBe(2);
	expect(JSON.parse(failed.stdout)).toMatchObject({ success: false, publication: "unavailable" });
	const missingVault = await fetch(`${server.base}/api/architecture/publication/configure`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ remote: "archive", ref: "refs/heads/archboard-history" }),
	});
	expect(missingVault.status).toBe(400);
	const malformed = await fetch(
		`${server.base}/api/architecture/publication/configure?vault=${encodeURIComponent(vault)}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ remote: "archive", ref: "main" }),
		},
	);
	expect(malformed.status).toBe(400);
}, 45_000);

test("CLI and HTTP share claimed edit outcomes and an event connection starts with fresh coherent content", async () => {
	if (server === undefined) throw new Error("The server did not start");
	cpSync(join(repoRoot, "examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	const current = readArchitectureModel(vault);
	if (!current.success || current.manifest.current === null)
		throw new Error(JSON.stringify(current));
	const target = { model: current.manifest.id, state: current.manifest.current.id };
	const claimResponse = await fetch(`${server.base}/api/architecture/claims`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			vault,
			target,
			writer: "surface-agent",
			reason: "explaining routing",
			subjects: ["Shop#Gateway"],
		}),
	});
	expect(claimResponse.status).toBe(200);
	const {
		ArchitectureClaimResultSchema,
		ArchitectureModuleEditResultSchema,
		ArchitectureEventSchema,
	} = await import("@archboard/board/model");
	const claim = ArchitectureClaimResultSchema.parse(await claimResponse.json());
	if (!claim.success) throw new Error(JSON.stringify(claim));
	const request = {
		target,
		subject: "Shop#Gateway",
		expectedRevision: current.revision,
		operationId: "surface-edit",
		writer: "surface-agent",
		claim: claim.claim.id,
		description: "A durable surface edit.",
	};
	const cli = runServerCli({
		repoRoot,
		server,
		args: ["model", "edit", "--doing", "explaining routing"],
		input: JSON.stringify(request),
	});
	expect(cli.status, cli.stderr).toBe(0);
	const { vault: _vault, ...answer } = z
		.record(z.string(), z.unknown())
		.parse(JSON.parse(cli.stdout));
	const result = ArchitectureModuleEditResultSchema.parse(answer);
	expect(result).toMatchObject({ success: true, applied: true, cleanup: "complete" });
	if (!result.success) throw new Error(JSON.stringify(result));
	const retry = await fetch(`${server.base}/api/architecture/module`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ ...request, vault, doing: "explaining routing" }),
	});
	expect(retry.status).toBe(200);
	expect(await retry.json()).toEqual(result);
	const malformed = await fetch(
		`${server.base}/api/architecture/module?${new URLSearchParams({ vault })}`,
		{ method: "POST", headers: { "Content-Type": "application/json" }, body: "[]" },
	);
	expect(malformed.status).toBe(400);

	const controller = new AbortController();
	try {
		const stream = await fetch(
			`${server.base}/api/architecture/events?${new URLSearchParams({ vault })}`,
			{ signal: controller.signal },
		);
		expect(stream.headers.get("content-type")).toContain("text/event-stream");
		const reader = stream.body!.getReader();
		const first = new TextDecoder().decode((await reader.read()).value);
		const data = first.split("\n").find((line) => line.startsWith("data: "));
		expect(data).toBeDefined();
		const event = ArchitectureEventSchema.parse(JSON.parse(data!.slice(6)));
		expect(event).toMatchObject({
			type: "architecture_snapshot",
			vault,
			reading: {
				success: true,
				modules: expect.arrayContaining([
					expect.objectContaining({ id: "Shop#Gateway", description: request.description }),
				]),
			},
			claims: { success: true, claims: [{ id: claim.claim.id }] },
		});
	} finally {
		controller.abort();
	}
	const taken = await fetch(`${server.base}/api/architecture/claims/take-back`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ vault, claim: claim.claim.id, origin: "human" }),
	});
	expect(taken.status).toBe(200);
	const rejected = runServerCli({
		repoRoot,
		server,
		args: ["model", "edit", "--doing", "explaining routing"],
		input: JSON.stringify({
			...request,
			operationId: "revoked-edit",
			expectedRevision: result.after,
		}),
	});
	expect(rejected.status, rejected.stderr).toBe(2);
	expect(JSON.parse(rejected.stdout)).toMatchObject({ success: false, code: "CLAIM_REVOKED" });
});
