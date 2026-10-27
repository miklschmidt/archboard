import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { ArchitectureModelReadSchema } from "@archboard/board/model";
import { LegacyInventoryReadSchema } from "@archboard/board/migration";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const home = mkdtempSync(join(tmpdir(), "archboard-migration-surface-"));
const vault = vaultIn(home);
let server: OwnedServer | undefined;
beforeAll(async () => {
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
	if (server === undefined) throw new Error("The server did not start");
	return runServerCli({
		repoRoot,
		server,
		args,
		input: input === undefined ? undefined : JSON.stringify(input),
	});
}

function result(stdout: string) {
	const { vault: _vault, ...answer } = z.record(z.string(), z.unknown()).parse(JSON.parse(stdout));
	return LegacyInventoryReadSchema.parse(answer);
}

test("CLI planning and preview share explicit vaults and preserve structured stale refusals", async () => {
	const created = cli(["semantic", "new", "Shop", "--doing", "Describe the API"], {
		level: "service",
		nodes: [{ name: "API", kind: "module", responsibility: "Accepts requests" }],
	});
	expect(created.status, created.stderr).toBe(0);
	const listed = cli(["model", "inventory", "--origin", "Shop"]);
	expect(listed.status, listed.stderr).toBe(0);
	const inventory = result(listed.stdout);
	if (!inventory.success) throw new Error(JSON.stringify(inventory));
	const request = { plan: inventory.plan, expectedPlan: inventory.planRevision };
	const saved = cli(["model", "plan", "--doing", "Record the identity choices"], request);
	expect(saved.status, saved.stderr).toBe(0);
	const written = result(saved.stdout);
	expect(written).toMatchObject({
		success: true,
		source: inventory.source,
		plan: inventory.plan,
		planRevision: expect.any(String),
	});
	expect(result(cli(["model", "inventory", "--origin", "Shop"]).stdout)).toEqual(written);
	const preview = cli(["model", "read", "--preview", "Shop"]);
	expect(preview.status, preview.stderr).toBe(0);
	const { vault: _previewVault, ...previewAnswer } = z
		.record(z.string(), z.unknown())
		.parse(JSON.parse(preview.stdout));
	const candidate = ArchitectureModelReadSchema.parse(previewAnswer);
	expect(candidate).toMatchObject({
		success: true,
		modules: [expect.objectContaining({ name: "API", responsibility: "Accepts requests" })],
		migrationPreview: {
			source: inventory.source,
			planRevision: written.success ? written.planRevision : null,
			plannedBoards: [],
		},
	});
	const http = await fetch(
		`${server!.base}/api/architecture/model?${new URLSearchParams({ vault, preview: "Shop" })}`,
	);
	expect(http.status).toBe(200);
	expect(ArchitectureModelReadSchema.parse(await http.json())).toEqual(candidate);
	const file = join(vault, inventory.boards[0]!.file);
	writeFileSync(file, `${readFileSync(file, "utf8")}\n`);
	const refusedPreview = cli(["model", "read", "--preview", "Shop"]);
	expect(refusedPreview.status).toBe(2);
	expect(JSON.parse(refusedPreview.stdout)).toMatchObject({
		success: false,
		code: "MAPPING_STALE",
	});
	const stale = cli(["model", "plan", "--doing", "Try an outdated plan"], request);
	expect(stale.status).toBe(2);
	expect(result(stale.stdout)).toMatchObject({ success: false, code: "MAPPING_STALE" });
});
