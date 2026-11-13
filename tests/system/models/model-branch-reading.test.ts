import { afterAll, beforeAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ArchitectureModelReadSchema } from "@archboard/model/contract";
import { readArchitectureClaims } from "@archboard/model/store-read";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const home = mkdtempSync(join(tmpdir(), "archboard-branch-reading-"));
const vault = vaultIn(home);
let server: OwnedServer | undefined;

/**
 * Run Git in the fixture repository.
 * @param args Git's arguments.
 * @returns Trimmed standard output.
 */
function git(...args: string[]): string {
	const result = Bun.spawnSync(["git", "-C", home, ...args]);
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return result.stdout.toString().trim();
}

beforeAll(async () => {
	cpSync(join(repoRoot, "examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	git("init", "--quiet");
	git("config", "user.name", "Branch Author");
	git("config", "user.email", "branch@example.test");
	git("config", "commit.gpgsign", "false");
	git("add", ".");
	git("commit", "--quiet", "-m", "test: seed architecture");
	// The working tree moves on, so only a branch reading still sees the seeded model.
	writeFileSync(join(vault, "bad.module.json"), "{");
	server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault,
	});
});
afterAll(async () => {
	await server?.dispose();
	rmSync(home, { recursive: true, force: true });
});

test("HTTP reads the model at a source ref, refuses an unknown ref, and accepts a ref on no write", async () => {
	if (server === undefined) throw new Error("The server did not start");
	const read = (params: Record<string, string>) =>
		fetch(`${server!.base}/api/architecture/model?${new URLSearchParams({ vault, ...params })}`);
	expect((await read({})).status).toBe(422);
	const head = git("rev-parse", "HEAD");
	const branch = await read({ ref: "HEAD" });
	expect(branch.status).toBe(200);
	expect(ArchitectureModelReadSchema.parse(await branch.json())).toMatchObject({
		success: true,
		sourceRef: { ref: "HEAD", commit: head },
	});
	// A complete commit id is a ref, so a reader can open the model at a merge base.
	expect(ArchitectureModelReadSchema.parse(await (await read({ ref: head })).json())).toMatchObject(
		{
			success: true,
			sourceRef: { ref: head, commit: head },
		},
	);
	const unknown = await read({ ref: "no-such-branch" });
	expect(unknown.status).toBe(404);
	expect(await unknown.json()).toMatchObject({ success: false, code: "SOURCE_REF_NOT_FOUND" });
	expect((await read({ ref: "HEAD", checkpoint: head })).status).toBe(400);
	const module = await fetch(
		`${server.base}/api/architecture/module?${new URLSearchParams({ vault, module: "Shop#Gateway", ref: "HEAD" })}`,
	);
	expect(await module.json()).toMatchObject({
		success: true,
		reading: { ref: "HEAD" },
		module: "Shop#Gateway",
	});

	// A claim that names a ref is refused, and none is taken.
	const claim = await fetch(`${server.base}/api/architecture/claims`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			vault,
			ref: "HEAD",
			target: { model: "Shop", state: "Current" },
			writer: "branch-agent",
			reason: "planning on a branch",
			subjects: ["Shop#Gateway"],
		}),
	});
	expect(claim.status).toBe(400);
	rmSync(join(vault, "bad.module.json"));
	expect(readArchitectureClaims(vault)).toMatchObject({ success: true, claims: [] });
}, 30_000);
