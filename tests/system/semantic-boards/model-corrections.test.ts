import { afterAll, beforeAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	ArchitectureModelReadSchema,
	ArchitectureModuleEditResultSchema,
} from "@archboard/board/model";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const home = mkdtempSync(join(tmpdir(), "archboard-correction-surface-"));
const vault = vaultIn(home);
let server: OwnedServer | undefined;
let sourceCommit = "";
beforeAll(async () => {
	cpSync(join(repoRoot, "examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	for (const args of [
		["init", "--quiet"],
		["config", "user.name", "Correction Author"],
		["config", "user.email", "correction@example.test"],
		["config", "commit.gpgsign", "false"],
		["remote", "add", "origin", "https://github.com/acme/shop.git"],
		["add", "."],
		["commit", "--quiet", "-m", "test: seed correction source"],
	]) {
		const result = Bun.spawnSync(["git", "-C", home, ...args]);
		if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	}
	sourceCommit = Bun.spawnSync(["git", "-C", home, "rev-parse", "HEAD"]).stdout.toString().trim();
	server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault,
	});
});
afterAll(async () => {
	await server?.dispose();
	rmSync(home, { recursive: true, force: true });
});

/**
 * Use the public HTTP adapter for fixture writes and claims.
 * @param path The existing operation path.
 * @param input The shared caller input.
 * @returns Its public response body.
 */
async function post(path: string, input: object) {
	if (server === undefined) throw new Error("The server did not start.");
	return fetch(`${server.base}/api/architecture/${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ vault, ...input }),
	});
}

test("CLI and HTTP share explicit corrections, audit comparisons, refusal status and exact retry", async () => {
	if (server === undefined) throw new Error("The server did not start.");
	const query = new URLSearchParams({ vault });
	const current = ArchitectureModelReadSchema.parse(
		await (await fetch(`${server.base}/api/architecture/model?${query}`)).json(),
	);
	if (!current.success) throw new Error(JSON.stringify(current));
	const target = { model: "Shop", state: "Current" };
	const initialClaim = await (
		await post("claims", {
			target,
			writer: "agent",
			reason: "Create correction fixture",
			subjects: ["Shop", "Current"],
		})
	).json();
	const created = ArchitectureModuleEditResultSchema.parse(
		await (
			await post("module", {
				target,
				expectedRevision: current.revision,
				operationId: crypto.randomUUID(),
				writer: "agent",
				doing: "Create the recorded alternative",
				claim: initialClaim.claim.id,
				proposal: { type: "create", name: "Recorded alternative" },
				changes: [],
			})
		).json(),
	);
	if (!created.success) throw new Error(JSON.stringify(created));
	await post("claims/release", { claim: initialClaim.claim.id, writer: "agent" });
	const selectedTarget = created.target;
	const claim = await (
		await post("claims", {
			target: selectedTarget,
			writer: "agent",
			reason: "Correct the retained alternative",
			subjects: ["Shop", "Shop#Gateway", selectedTarget.state],
		})
	).json();
	const shelved = ArchitectureModuleEditResultSchema.parse(
		await (
			await post("module", {
				target: selectedTarget,
				expectedRevision: created.after,
				operationId: crypto.randomUUID(),
				writer: "agent",
				doing: "Keep the recorded alternative",
				claim: claim.claim.id,
				proposal: { type: "shelve", reason: "Keep this alternative." },
				changes: [],
			})
		).json(),
	);
	if (!shelved.success) throw new Error(JSON.stringify(shelved));
	const request = {
		target: selectedTarget,
		expectedRevision: shelved.after,
		operationId: crypto.randomUUID(),
		writer: "agent",
		claim: claim.claim.id,
		correction: {
			previous: shelved.checkpoint.id,
			reason: "Correct the recorded routing.",
			revisions: [{ repo: "github.com/acme/shop", commit: sourceCommit }],
		},
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "Accurate recorded routing." },
			},
		],
	};
	const refused = await post("module", {
		...request,
		doing: "Try ordinary historical editing",
		correction: undefined,
	});
	expect(refused.status).toBe(409);
	expect(await refused.json()).toMatchObject({
		success: false,
		code: "TARGET_CHANGED",
		applied: false,
	});
	const invalid = await post("module", {
		...request,
		doing: "Try incomplete correction",
		correction: { ...request.correction, revisions: [] },
	});
	expect(invalid.status).toBe(400);
	const cli = runServerCli({
		repoRoot,
		server,
		args: ["model", "edit", "--doing", "Correct the recorded routing"],
		input: JSON.stringify(request),
	});
	expect(cli.status, cli.stderr).toBe(0);
	const { vault: _address, ...raw } = JSON.parse(cli.stdout);
	const corrected = ArchitectureModuleEditResultSchema.parse(raw);
	if (!corrected.success) throw new Error(JSON.stringify(corrected));
	const retry = await post("module", { ...request, doing: "Correct the recorded routing" });
	expect(retry.status).toBe(200);
	expect(ArchitectureModuleEditResultSchema.parse(await retry.json())).toEqual(corrected);
	const stale = await post("module", {
		...request,
		operationId: crypto.randomUUID(),
		doing: "Try the stale correction",
	});
	expect(stale.status).toBe(409);
	expect(await stale.json()).toMatchObject({ success: false, code: "STALE_REVISION" });
	const comparison = runServerCli({
		repoRoot,
		server,
		args: [
			"model",
			"compare",
			"--state",
			selectedTarget.state!,
			"--against",
			shelved.checkpoint.id,
		],
		input: undefined,
	});
	expect(comparison.status, comparison.stderr).toBe(0);
	const { vault: _comparisonVault, ...compared } = JSON.parse(comparison.stdout);
	expect(ArchitectureModelReadSchema.parse(compared)).toMatchObject({
		success: true,
		selectedState: { lifecycle: "shelved", corrections: [{ checkpoint: corrected.checkpoint.id }] },
		comparison: { corrections: { selected: [{ previous: shelved.checkpoint.id }], against: [] } },
	});
}, 20_000);
