import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
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

test("CLI planning carries its explicit vault and preserves structured stale refusals", () => {
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
	const stale = cli(["model", "plan", "--doing", "Try an outdated plan"], request);
	expect(stale.status).toBe(2);
	expect(result(stale.stdout)).toMatchObject({ success: false, code: "MAPPING_STALE" });
});
