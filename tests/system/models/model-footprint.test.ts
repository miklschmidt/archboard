import { ArchitectureHistoryResultSchema } from "@archboard/code-intel/history";
import { z } from "zod";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	ArchitectureModelReadSchema,
	ArchitectureClaimResultSchema,
	ArchitectureCheckpointRetainSchema,
} from "@archboard/model/contract";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const home = mkdtempSync(join(tmpdir(), "archboard-footprint-surface-"));
const vault = vaultIn(home);
let server: OwnedServer | undefined;
beforeAll(async () => {
	cpSync(join(repoRoot, "examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	for (const args of [
		["init", "--quiet"],
		["config", "user.name", "Footprint Author"],
		["config", "user.email", "footprint@example.test"],
		["config", "commit.gpgsign", "false"],
		["remote", "add", "origin", "https://github.com/acme/shop.git"],
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
function cli(args: string[], input?: unknown) {
	if (!server) throw new Error("Server unavailable");
	return runServerCli({
		repoRoot,
		server,
		args,
		input: input === undefined ? undefined : JSON.stringify(input),
	});
}
function answer(stdout: string) {
	const { vault: _vault, ...result } = z.record(z.string(), z.unknown()).parse(JSON.parse(stdout));
	return result;
}

test("canonical locality and branch footprint retain source analysis without a live model reader", () => {
	mkdirSync(join(home, "src"), { recursive: true });
	writeFileSync(join(home, "src/gateway.ts"), "export function dispatch(){ return 1; }\n");
	for (const args of [
		["add", "src"],
		["commit", "--quiet", "-m", "test: add bound source"],
	]) {
		const ran = Bun.spawnSync(["git", "-C", home, ...args]);
		if (ran.exitCode !== 0) throw new Error(ran.stderr.toString());
	}
	const sourceHead = Bun.spawnSync(["git", "-C", home, "rev-parse", "HEAD"]).stdout.toString();
	const locality = cli(["model", "locality"]);
	expect(locality.status, locality.stderr).toBe(0);
	expect(answer(locality.stdout)).toMatchObject({
		success: true,
		model: "Shop",
		state: { id: "Current" },
		revision: expect.any(Object),
		hotspots: expect.any(Array),
	});
	const footprint = cli(["model", "footprint", "--base", "HEAD~1"]);
	expect(footprint.status, footprint.stderr).toBe(0);
	expect(answer(footprint.stdout)).toMatchObject({
		success: true,
		model: "Shop",
		state: { id: "Current" },
		base: "HEAD~1",
		repositories: expect.any(Array),
	});
	// A base no checkout can read is a failure that names it, not a clean exit.
	const unread = cli(["model", "footprint", "--base", "no-such-base"]);
	expect(unread.status).toBe(2);
	expect(unread.stderr).toContain("no-such-base");
	const local = ArchitectureHistoryResultSchema.parse(answer(locality.stdout));
	const branch = ArchitectureHistoryResultSchema.parse(answer(footprint.stdout));
	if (!local.success || local.analysis !== "locality" || !branch.success || !("changed" in branch))
		throw new Error(JSON.stringify({ local, branch }));
	expect(local.hotspots.map((part) => part.subject.id)).toContain("Shop#Gateway");
	expect(branch.changed.map((part) => part.subject.id)).toContain("Shop#Gateway");
	const current = ArchitectureModelReadSchema.parse(answer(cli(["model", "read"]).stdout));
	if (!current.success) throw new Error(JSON.stringify(current));
	const retained = ArchitectureCheckpointRetainSchema.parse(
		answer(
			cli([
				"model",
				"retain",
				"--operation-id",
				"history-comparison",
				"--writer",
				"surface-agent",
				"--expect-revision",
				current.revision.digest,
				"--doing",
				"Retain source comparison",
			]).stdout,
		),
	);
	if (!retained.success) throw new Error(JSON.stringify(retained));
	for (const command of [["locality"], ["footprint", "--base", "HEAD~1"]]) {
		const exact = cli(["model", ...command, "--against", retained.checkpoint.id]);
		expect(exact.status, exact.stdout + exact.stderr).toBe(0);
		expect(ArchitectureHistoryResultSchema.parse(answer(exact.stdout))).toMatchObject({
			success: true,
			model: "Shop",
		});
	}
	expect(Bun.spawnSync(["git", "-C", home, "rev-parse", "HEAD"]).stdout.toString()).toBe(
		sourceHead,
	);
	const refused = cli(["model", "footprint", "--base", "HEAD", "--state", "Missing"]);
	expect(refused.status, refused.stderr).toBe(2);
	expect(answer(refused.stdout)).toMatchObject({ success: false, code: "STATE_NOT_FOUND" });

	// The gate: the commit changed Gateway and its Handler, and the draft names only Gateway.
	if (current.manifest.current === null) throw new Error("The model has no Current");
	const target = { model: current.manifest.id, state: current.manifest.current.id };
	const claim = ArchitectureClaimResultSchema.parse(
		answer(
			cli(["model", "claim"], {
				target,
				writer: "surface-agent",
				reason: "proposing the gateway",
				subjects: ["Shop", "Shop#Gateway"],
			}).stdout,
		),
	);
	if (!claim.success) throw new Error(JSON.stringify(claim));
	const retainedRead = ArchitectureModelReadSchema.parse(answer(cli(["model", "read"]).stdout));
	if (!retainedRead.success) throw new Error(JSON.stringify(retainedRead));
	const proposed = cli(["model", "edit", "--doing", "proposing the gateway"], {
		target,
		expectedRevision: retainedRead.revision,
		operationId: "footprint-gate-draft",
		writer: "surface-agent",
		claim: claim.claim.id,
		proposal: { type: "create", name: "Gateway only" },
		changes: [{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Gated." } }],
	});
	expect(proposed.status, proposed.stderr).toBe(0);
	const draft = ["model", "footprint", "--base", "HEAD~1", "--state", "Gateway only"];
	expect(cli(draft).status).toBe(0);
	const outside = cli([...draft, "--fail-outside"]);
	expect(outside.status, outside.stderr).toBe(1);
	expect(answer(outside.stdout)).toMatchObject({
		changedNotNamed: [
			expect.objectContaining({ subject: expect.objectContaining({ id: "Shop#Handler" }) }),
		],
	});
	const inside = cli([
		"model",
		"footprint",
		"--base",
		"HEAD",
		"--state",
		"Gateway only",
		"--fail-outside",
	]);
	expect(inside.status, inside.stderr).toBe(0);
	// A file that no module is bound to is flagged and never fails the gate. The vault is not flagged.
	mkdirSync(join(home, "docs"), { recursive: true });
	writeFileSync(join(home, "docs/notes.md"), "Notes.\n");
	for (const args of [
		["add", "-A"],
		["commit", "--quiet", "-m", "docs: notes, and the draft"],
	]) {
		const ran = Bun.spawnSync(["git", "-C", home, ...args]);
		if (ran.exitCode !== 0) throw new Error(ran.stderr.toString());
	}
	const committed = Bun.spawnSync(["git", "-C", home, "diff", "--name-only", "HEAD~1", "HEAD"]);
	expect(committed.stdout.toString()).toContain(".proposal.json");
	const flagged = cli([...draft, "--fail-outside"]);
	expect(flagged.status, flagged.stderr).toBe(0);
	expect(answer(flagged.stdout)).toMatchObject({
		unboundFiles: [expect.objectContaining({ path: "docs/notes.md" })],
	});
	expect(flagged.stderr).toContain(
		"Not bound: 1 changed file that no module is bound to: docs/notes.md.",
	);
	expect(cli(["model", "footprint", "--base", "HEAD~1", "--fail-outside"]).status).toBe(2);
	expect(
		cli(["model", "footprint", "--base", "HEAD~1", "--state", "current", "--fail-outside"]).status,
	).toBe(2);
});
