import { afterEach, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, chmodSync, writeFileSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	readArchitectureModel,
	readArchitectureCheckpoint,
	listArchitectureCheckpoints,
} from "@archboard/board/store-read";
import { retainArchitectureCheckpoint } from "@archboard/board/store-write";

const homes: string[] = [];
afterEach(() => {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function git(root: string, ...args: string[]): string {
	const result = Bun.spawnSync(["git", "-C", root, ...args], {
		env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
	});
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return result.stdout.toString().trim();
}

function fixture() {
	const home = mkdtempSync(join(tmpdir(), "archboard-checkpoint-"));
	homes.push(home);
	const root = join(home, "repo");
	const vault = join(root, ".archboard/vault");
	cpSync(resolve("examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	git(root, "init", "--quiet", "--initial-branch=main");
	git(root, "config", "user.name", "Checkpoint Author");
	git(root, "config", "user.email", "checkpoint@example.test");
	const key = join(home, "signing-key");
	const generated = Bun.spawnSync(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", key]);
	if (generated.exitCode !== 0) throw new Error(generated.stderr.toString());
	git(root, "config", "gpg.format", "ssh");
	git(root, "config", "user.signingkey", key);
	git(root, "config", "commit.gpgsign", "true");
	git(root, "remote", "add", "origin", "https://github.com/acme/shop.git");
	writeFileSync(join(root, "code.ts"), "export const version = 1;\n");
	git(root, "add", ".");
	git(root, "commit", "--quiet", "-m", "test: seed source");
	return { home, root, vault };
}

function request(vault: string, operationId = "retain-first") {
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	return {
		target: "current" as const,
		operationId,
		writer: "test-agent",
		doing: "retaining exact architecture",
		expectedRevision: current.revision.digest,
		dependencies: [] as string[],
	};
}

test("retained architecture reopens exact bytes without reading damaged current inputs", async () => {
	const { root, vault } = fixture();
	const before = readArchitectureModel(vault, "Shop#Gateway");
	const input = request(vault);
	const retained = await retainArchitectureCheckpoint(vault, input);
	expect(retained.success).toBe(true);
	if (!retained.success) throw new Error(JSON.stringify(retained));
	writeFileSync(join(vault, "gateway.module.json"), "{");
	writeFileSync(join(vault, ".archboard/config.yaml"), "invalid: [");
	const exact = await readArchitectureCheckpoint(vault, retained.checkpoint.id, "Shop#Gateway");
	expect(exact).toMatchObject(before);
	expect(exact).toMatchObject({
		checkpoint: { id: retained.checkpoint.id, publication: "saved-locally" },
	});
	expect(git(root, "ls-tree", "-r", "--name-only", retained.checkpoint.id)).not.toContain(
		"code.ts",
	);
	const listed = await listArchitectureCheckpoints(vault);
	expect(listed).toMatchObject({
		success: true,
		checkpoints: [{ id: retained.checkpoint.id, model: "Shop" }],
	});
});

test("retention honors configured signing and identity while preserving a dirty index and checkout", async () => {
	const { home, root, vault } = fixture();
	const signers = join(home, "allowed-signers");
	writeFileSync(
		signers,
		`checkpoint@example.test ${readFileSync(join(home, "signing-key.pub"), "utf8")}`,
	);
	git(root, "config", "gpg.ssh.allowedSignersFile", signers);
	writeFileSync(join(root, "code.ts"), "export const version = 2;\n");
	git(root, "add", "code.ts");
	writeFileSync(join(root, "code.ts"), "export const version = 3;\n");
	writeFileSync(join(root, "untracked.txt"), "Keep this file.\n");
	const head = git(root, "rev-parse", "HEAD");
	const index = readFileSync(join(root, ".git/index"));
	const status = git(root, "status", "--porcelain");
	const retained = await retainArchitectureCheckpoint(vault, request(vault));
	if (!retained.success) throw new Error(JSON.stringify(retained));
	expect(git(root, "cat-file", "-p", retained.checkpoint.id)).toContain(
		"gpgsig -----BEGIN SSH SIGNATURE-----",
	);
	git(root, "verify-commit", retained.checkpoint.id);
	expect(git(root, "show", "-s", "--format=%an <%ae>", retained.checkpoint.id)).toBe(
		"Checkpoint Author <checkpoint@example.test>",
	);
	expect(retained.checkpoint.sources).toEqual([
		{ repo: "github.com/acme/shop", commit: head, uncommitted: true },
	]);
	expect(git(root, "rev-parse", "HEAD")).toBe(head);
	expect(readFileSync(join(root, ".git/index"))).toEqual(index);
	expect(git(root, "status", "--porcelain")).toBe(status);
	expect(readFileSync(join(root, "code.ts"), "utf8")).toBe("export const version = 3;\n");
	expect(readFileSync(join(root, "untracked.txt"), "utf8")).toBe("Keep this file.\n");
});

test("required baselines survive collection through Git parents rather than JSON hashes", async () => {
	const { root, vault } = fixture();
	const baseline = await retainArchitectureCheckpoint(vault, request(vault));
	if (!baseline.success) throw new Error(JSON.stringify(baseline));
	git(root, "update-ref", "-d", "refs/heads/archboard-history");
	const file = join(vault, "gateway.module.json");
	const gateway = JSON.parse(readFileSync(file, "utf8"));
	writeFileSync(
		file,
		JSON.stringify({ ...gateway, responsibility: "Routes the next architecture" }),
	);
	const input = { ...request(vault, "retain-dependent"), dependencies: [baseline.checkpoint.id] };
	const retained = await retainArchitectureCheckpoint(vault, input);
	if (!retained.success) throw new Error(JSON.stringify(retained));
	const ancestry = git(root, "rev-list", retained.checkpoint.id).split("\n");
	expect(ancestry).toContain(baseline.checkpoint.id);
	git(root, "reflog", "expire", "--expire=now", "--all");
	git(root, "gc", "--prune=now");
	expect(await readArchitectureCheckpoint(vault, baseline.checkpoint.id)).toMatchObject({
		success: true,
		revision: baseline.checkpoint.revision,
	});
	const missing = await retainArchitectureCheckpoint(vault, {
		...request(vault, "missing-baseline"),
		dependencies: ["f".repeat(40)],
	});
	expect(missing).toMatchObject({ success: false, code: "ARCHITECTURE_UNAVAILABLE" });
});

test("linked worktree appends preserve distinct readings through signed synchronization records", async () => {
	const { home, root, vault } = fixture();
	const linked = join(home, "linked");
	git(root, "worktree", "add", "--quiet", "-b", "parallel", linked);
	const otherVault = join(linked, ".archboard/vault");
	const file = join(otherVault, "gateway.module.json");
	const module = JSON.parse(readFileSync(file, "utf8"));
	writeFileSync(
		file,
		JSON.stringify({ ...module, responsibility: "Routes the parallel architecture" }),
	);
	const socketPath = join(home, "signing.sock");
	const waiting: Socket[] = [];
	const barrier = createServer((socket) => {
		waiting.push(socket);
		if (waiting.length >= 2)
			for (const signer of waiting) if (!signer.destroyed) signer.end("ready");
	});
	await new Promise<void>((resolve) => barrier.listen(socketPath, resolve));
	const signer = join(home, "signer");
	writeFileSync(
		signer,
		`#!${process.execPath}
import { createConnection } from "node:net";
await new Promise((resolve, reject) => { const socket = createConnection(${JSON.stringify(socketPath)}); socket.once("data", () => { socket.destroy(); resolve(); }); socket.once("error", reject); });
const child = Bun.spawn(["ssh-keygen", ...process.argv.slice(2)], { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
process.exit(await child.exited);
`,
	);
	chmodSync(signer, 0o700);
	git(root, "config", "gpg.ssh.program", signer);
	let results;
	try {
		results = await Promise.all([
			retainArchitectureCheckpoint(vault, request(vault, "worktree-a")),
			retainArchitectureCheckpoint(otherVault, request(otherVault, "worktree-b")),
		]);
	} finally {
		for (const socket of waiting) socket.destroy();
		await new Promise<void>((resolve, reject) =>
			barrier.close((error) => (error ? reject(error) : resolve())),
		);
	}
	for (const result of results) expect(result.success, JSON.stringify(result)).toBe(true);
	const [first, second] = results;
	if (!first?.success || !second?.success) throw new Error(JSON.stringify(results));
	const listed = await listArchitectureCheckpoints(vault);
	if (!listed.success) throw new Error(JSON.stringify(listed));
	expect(listed.checkpoints.map((checkpoint) => checkpoint.id).sort()).toEqual(
		[first.checkpoint.id, second.checkpoint.id].sort(),
	);
	const sync = git(root, "rev-parse", "refs/heads/archboard-history");
	expect(JSON.parse(git(root, "show", `${sync}:record.json`))).toEqual({
		schemaVersion: 1,
		kind: "synchronization",
	});
	expect(git(root, "cat-file", "-p", sync)).toContain("gpgsig -----BEGIN SSH SIGNATURE-----");
	expect(git(root, "rev-list", "--parents", "-n", "1", sync).split(" ").slice(1).sort()).toEqual(
		[first.checkpoint.id, second.checkpoint.id].sort(),
	);
	expect(await readArchitectureCheckpoint(vault, sync)).toMatchObject({
		success: false,
		code: "CHECKPOINT_INVALID",
	});
	const historical = await readArchitectureCheckpoint(vault, second.checkpoint.id, "Shop#Gateway");
	if (!historical.success) throw new Error(JSON.stringify(historical));
	expect(historical.modules.find((module) => module.id === "Shop#Gateway")?.responsibility).toBe(
		"Routes the parallel architecture",
	);
	expect(readArchitectureModel(vault)).toMatchObject({
		success: true,
		modules: expect.arrayContaining([
			expect.objectContaining({ id: "Shop#Gateway", responsibility: "Accepts shopping requests" }),
		]),
	});
	expect(readArchitectureModel(otherVault)).toMatchObject({
		success: true,
		revision: second.checkpoint.revision,
	});
});

test("lost source evidence leaves exact architecture readable and missing architecture stays unavailable", async () => {
	const { root, vault } = fixture();
	const retained = await retainArchitectureCheckpoint(vault, request(vault));
	if (!retained.success) throw new Error(JSON.stringify(retained));
	const source = git(root, "rev-parse", "HEAD");
	git(root, "checkout", "--quiet", "--orphan", "replacement");
	git(root, "commit", "--quiet", "-m", "test: replace source history");
	git(root, "branch", "-D", "main");
	git(root, "reflog", "expire", "--expire=now", "--all");
	git(root, "gc", "--prune=now");
	const exact = await readArchitectureCheckpoint(vault, retained.checkpoint.id);
	expect(exact).toMatchObject({
		success: true,
		sourceEvidence: [
			{
				repo: "github.com/acme/shop",
				commit: source,
				uncommitted: false,
				status: "unavailable",
				recovery: expect.any(String),
			},
		],
	});
	expect(await readArchitectureCheckpoint(vault, "f".repeat(40))).toMatchObject({
		success: false,
		code: "ARCHITECTURE_UNAVAILABLE",
		diagnostics: [{ code: "ARCHITECTURE_UNAVAILABLE", recovery: expect.any(String) }],
	});
	expect(await readArchitectureCheckpoint(vault, "archboard-history")).toMatchObject({
		success: false,
		code: "CHECKPOINT_INVALID",
	});
});

test("retrying retention returns the same checkpoint after inputs change and refuses operation reuse", async () => {
	const { root, vault } = fixture();
	const input = request(vault);
	const retained = await retainArchitectureCheckpoint(vault, input);
	if (!retained.success) throw new Error(JSON.stringify(retained));
	writeFileSync(join(vault, "model.json"), "{");
	const before = git(root, "rev-parse", "refs/heads/archboard-history");
	expect(await retainArchitectureCheckpoint(vault, input)).toEqual(retained);
	expect(git(root, "rev-parse", "refs/heads/archboard-history")).toBe(before);
	expect(
		await retainArchitectureCheckpoint(vault, { ...input, doing: "a different intent" }),
	).toMatchObject({ success: false, code: "OPERATION_REUSED" });
	git(root, "update-ref", "-d", "refs/heads/archboard-history");
	expect(await retainArchitectureCheckpoint(vault, input)).toEqual(retained);
	expect(await listArchitectureCheckpoints(vault)).toMatchObject({
		success: true,
		checkpoints: [retained.checkpoint],
	});
});

test("signing failure refuses retention with recovery and leaves all current inputs unchanged", async () => {
	const { home, root, vault } = fixture();
	const input = request(vault);
	const before = readArchitectureModel(vault);
	const head = git(root, "rev-parse", "HEAD");
	const index = readFileSync(join(root, ".git/index"));
	git(root, "config", "user.signingkey", join(home, "missing-key"));
	const refused = await retainArchitectureCheckpoint(vault, input);
	expect(refused).toMatchObject({
		success: false,
		code: "ARCHIVE_COMMIT_FAILED",
		diagnostics: [{ code: "ARCHIVE_COMMIT_FAILED", recovery: expect.any(String) }],
	});
	expect(readArchitectureModel(vault)).toEqual(before);
	expect(git(root, "rev-parse", "HEAD")).toBe(head);
	expect(readFileSync(join(root, ".git/index"))).toEqual(index);
	expect(await listArchitectureCheckpoints(vault)).toEqual({ success: true, checkpoints: [] });
	expect(git(root, "config", "--get", "commit.gpgsign")).toBe("true");
	git(root, "config", "user.signingkey", join(home, "signing-key"));
	expect(
		await retainArchitectureCheckpoint(vault, { ...input, expectedRevision: "f".repeat(64) }),
	).toMatchObject({ success: false, code: "STALE_REVISION" });
	expect(await listArchitectureCheckpoints(vault)).toEqual({ success: true, checkpoints: [] });
	expect((await retainArchitectureCheckpoint(vault, input)).success).toBe(true);
});

test("a shallow exact reading refuses absent required baseline objects", async () => {
	const { home, root, vault } = fixture();
	const baseline = await retainArchitectureCheckpoint(vault, request(vault));
	if (!baseline.success) throw new Error(JSON.stringify(baseline));
	const retained = await retainArchitectureCheckpoint(vault, {
		...request(vault, "dependent-shallow"),
		dependencies: [baseline.checkpoint.id],
	});
	if (!retained.success) throw new Error(JSON.stringify(retained));
	const clone = join(home, "shallow");
	git(
		root,
		"clone",
		"--quiet",
		"--no-checkout",
		"--depth=1",
		"--single-branch",
		"--branch=archboard-history",
		`file://${root}`,
		clone,
	);
	const addressed = join(clone, ".archboard/vault");
	cpSync(vault, addressed, { recursive: true });
	const missing = await readArchitectureCheckpoint(addressed, retained.checkpoint.id);
	expect(missing).toMatchObject({
		success: false,
		code: "ARCHITECTURE_UNAVAILABLE",
		diagnostics: [{ file: baseline.checkpoint.id, recovery: expect.any(String) }],
	});
});

test("retention refuses a foreign archive branch and never advances a checked-out archive branch", async () => {
	const { home, root, vault } = fixture();
	const source = git(root, "rev-parse", "HEAD");
	git(root, "branch", "archboard-history", source);
	expect(await retainArchitectureCheckpoint(vault, request(vault))).toMatchObject({
		success: false,
		code: "ARCHIVE_UNREADABLE",
	});
	expect(git(root, "rev-parse", "archboard-history")).toBe(source);
	git(root, "branch", "-D", "archboard-history");
	const retained = await retainArchitectureCheckpoint(vault, request(vault));
	if (!retained.success) throw new Error(JSON.stringify(retained));
	const archiveCheckout = join(home, "archive-checkout");
	git(root, "worktree", "add", "--quiet", archiveCheckout, "archboard-history");
	expect(await retainArchitectureCheckpoint(vault, request(vault, "next"))).toMatchObject({
		success: false,
		code: "ARCHIVE_IN_USE",
	});
	expect(git(archiveCheckout, "rev-parse", "HEAD")).toBe(retained.checkpoint.id);
});

test("retention preserves large UTF-8 inputs and Git-sensitive filenames exactly", async () => {
	const { vault } = fixture();
	const path = "a\tb\nc.module.json";
	const original = JSON.parse(readFileSync(join(vault, "gateway.module.json"), "utf8"));
	writeFileSync(
		join(vault, path),
		" ".repeat(100_000) + JSON.stringify({ ...original, description: "Architecture π." }) + "\n\n",
	);
	rmSync(join(vault, "gateway.module.json"));
	const before = readArchitectureModel(vault);
	const retained = await retainArchitectureCheckpoint(vault, request(vault));
	if (!retained.success) throw new Error(JSON.stringify(retained));
	rmSync(join(vault, path));
	expect(await readArchitectureCheckpoint(vault, retained.checkpoint.id)).toMatchObject(before);
});

test("a source repository without commits retains architecture without inventing source evidence", async () => {
	const { root, vault } = fixture();
	git(root, "update-ref", "-d", "refs/heads/main");
	const retained = await retainArchitectureCheckpoint(vault, request(vault));
	if (!retained.success) throw new Error(JSON.stringify(retained));
	expect(retained.checkpoint.sources).toEqual([
		{ repo: "github.com/acme/shop", commit: null, uncommitted: true },
	]);
	expect(await readArchitectureCheckpoint(vault, retained.checkpoint.id)).toMatchObject({
		success: true,
		sourceEvidence: [{ commit: null, status: "unavailable" }],
	});
	expect(git(root, "symbolic-ref", "HEAD")).toBe("refs/heads/main");
});
