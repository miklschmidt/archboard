import { afterAll, beforeAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	ArchitectureModelReadSchema,
	ArchitectureModuleEditResultSchema,
} from "@archboard/board/model";
import { claimArchitectureSubjects } from "@archboard/board/store-write";
import { readArchitectureModel } from "@archboard/board/store-read";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const home = mkdtempSync(join(tmpdir(), "archboard-narrative-surface-"));
const vault = vaultIn(home);
let server: OwnedServer | undefined;
beforeAll(async () => {
	cpSync(join(repoRoot, "examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	for (const args of [
		["init", "--quiet"],
		["config", "user.name", "Narrative Author"],
		["config", "user.email", "narrative@example.test"],
		["config", "commit.gpgsign", "false"],
		["add", "."],
		["commit", "--quiet", "-m", "test: seed model"],
	]) {
		const result = Bun.spawnSync(["git", "-C", home, ...args]);
		if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	}
	server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault,
	});
});
afterAll(async () => {
	await server?.dispose();
	rmSync(home, { recursive: true, force: true });
});

test("CLI narrative authoring and HTTP playback share the public writer and retained revision contract", async () => {
	if (!server) throw new Error("Server unavailable");
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const target = { model: current.manifest.id, state: current.selectedState!.id };
	const claim = await claimArchitectureSubjects(vault, {
		target,
		writer: "agent",
		reason: "testing narrative adapters",
		subjects: ["Shop"],
	});
	if (!claim.success) throw new Error(JSON.stringify(claim));
	const createdCli = runServerCli({
		repoRoot,
		server,
		args: ["model", "edit", "--doing", "authoring a request tour"],
		input: JSON.stringify({
			target,
			expectedRevision: current.revision,
			operationId: "narrative-surface",
			writer: "agent",
			claim: claim.claim.id,
			changes: [
				{
					type: "add-walkthrough",
					walkthrough: {
						name: "Tour",
						target: { state: "current" },
						beats: [
							{
								title: "Gateway",
								narrative: "Read the gateway.",
								reading: { scope: "Shop#Gateway", grammar: "architecture" },
							},
						],
					},
				},
			],
		}),
	});
	expect(createdCli.status, createdCli.stderr).toBe(0);
	const { vault: _address, ...receipt } = JSON.parse(createdCli.stdout);
	const created = ArchitectureModuleEditResultSchema.parse(receipt);
	if (!created.success) throw new Error(JSON.stringify(created));
	const query = new URLSearchParams({
		vault,
		walkthrough: "Tour",
		checkpoint: created.checkpoint.id,
		shared: "true",
	});
	const response = await fetch(`${server.base}/api/architecture/model?${query}`);
	expect(response.status).toBe(200);
	const model = ArchitectureModelReadSchema.parse(await response.json());
	expect(model.success && model.playback?.checkpoint).toBe(created.checkpoint.id);
	const readCli = runServerCli({
		repoRoot,
		server,
		args: [
			"model",
			"read",
			"--walkthrough",
			"Tour",
			"--checkpoint",
			created.checkpoint.id,
			"--shared",
		],
		input: undefined,
	});
	expect(readCli.status, readCli.stderr).toBe(0);
	expect(JSON.parse(readCli.stdout).playback).toEqual(model.success && model.playback);
	const output = join(home, "existing.mp4");
	writeFileSync(output, "keep");
	const refused = runServerCli({
		repoRoot,
		server,
		args: [
			"model",
			"record",
			"--walkthrough",
			"Missing",
			"--checkpoint",
			created.checkpoint.id,
			"--out",
			output,
		],
		input: undefined,
		env: { ARCHBOARD_FFMPEG: "/nonexistent/no-encoder" },
	});
	expect(refused.status).toBe(2);
	expect(JSON.parse(refused.stdout).code).toBe("WALKTHROUGH_NOT_FOUND");
	expect(readFileSync(output, "utf8")).toBe("keep");
	const shared = await fetch(
		`${server.base}/api/architecture/model?${new URLSearchParams({ vault, walkthrough: "Tour", shared: "true" })}`,
	);
	expect((await shared.json()).code).toBe("CHECKPOINT_REQUIRED");
});
