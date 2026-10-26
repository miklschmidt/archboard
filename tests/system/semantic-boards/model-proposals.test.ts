import { afterAll, beforeAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
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
const home = mkdtempSync(join(tmpdir(), "archboard-proposal-surface-"));
const vault = vaultIn(home);
let server: OwnedServer | undefined;
beforeAll(async () => {
	cpSync(join(repoRoot, "examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	for (const args of [
		["init", "--quiet"],
		["config", "user.name", "Proposal Author"],
		["config", "user.email", "proposal@example.test"],
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

test("normal CLI and server create list select and compare explicit compact drafts", async () => {
	if (server === undefined) throw new Error("The server did not start");
	const current = readArchitectureModel(vault);
	if (!current.success || !current.manifest.current) throw new Error(JSON.stringify(current));
	const target = { model: current.manifest.id, state: current.manifest.current.id };
	const claimed = await claimArchitectureSubjects(vault, {
		target,
		writer: "agent",
		reason: "testing proposal adapters",
		subjects: ["Shop", "Shop#Gateway"],
	});
	if (!claimed.success) throw new Error(JSON.stringify(claimed));
	const request = {
		target,
		expectedRevision: current.revision,
		operationId: "surface-proposal",
		writer: "agent",
		claim: claimed.claim.id,
		proposal: { type: "create", name: "Queued" },
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "Queues accepted requests." },
			},
		],
	};
	const createdCli = runServerCli({
		repoRoot,
		server,
		args: ["model", "edit", "--doing", "proposing queued requests"],
		input: JSON.stringify(request),
	});
	expect(createdCli.status, createdCli.stderr).toBe(0);
	const { vault: _address, ...receipt } = JSON.parse(createdCli.stdout);
	const created = ArchitectureModuleEditResultSchema.parse(receipt);
	if (!created.success) throw new Error(JSON.stringify(created));
	const listedCli = runServerCli({
		repoRoot,
		server,
		args: ["model", "proposals"],
		input: undefined,
	});
	expect(listedCli.status, listedCli.stderr).toBe(0);
	const listed = JSON.parse(listedCli.stdout);
	expect(listed.proposals).toHaveLength(1);
	expect(listed.selectedState).toMatchObject({ id: "Current", lifecycle: "current" });
	const query = new URLSearchParams({ vault, state: "Queued" });
	const response = await fetch(`${server.base}/api/architecture/model?${query}`);
	expect(response.status).toBe(200);
	const selected = ArchitectureModelReadSchema.parse(await response.json());
	expect(selected).toMatchObject({
		success: true,
		selectedState: { name: "Queued", lifecycle: "draft" },
		comparison: { reason: "current" },
	});
	const comparedCli = runServerCli({
		repoRoot,
		server,
		args: ["model", "compare", "--state", "Queued", "--against", "current"],
		input: undefined,
	});
	expect(comparedCli.status, comparedCli.stderr).toBe(0);
	const compared = JSON.parse(comparedCli.stdout);
	expect(compared.comparison).toMatchObject({
		reason: "explicit",
		against: { id: "Current", lifecycle: "current" },
	});
	const missing = runServerCli({
		repoRoot,
		server,
		args: ["model", "read", "--state", "missing"],
		input: undefined,
	});
	expect(missing.status).toBe(2);
	expect(JSON.parse(missing.stdout)).toMatchObject({ success: false, code: "STATE_NOT_FOUND" });
	const invalid = await fetch(
		`${server.base}/api/architecture/model?${query}&checkpoint=${created.checkpoint.id}`,
	);
	expect(invalid.status).toBe(400);
	const catalogue = await fetch(
		`${server.base}/api/architecture/proposals?${new URLSearchParams({ vault })}`,
	);
	expect(catalogue.status).toBe(200);
	expect(ArchitectureModelReadSchema.parse(await catalogue.json())).toMatchObject({
		success: true,
		proposals: listed.proposals,
	});
}, 20_000);
