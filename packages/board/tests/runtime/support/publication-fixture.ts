import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import { retainArchitectureCheckpoint } from "@archboard/board/store-write";

const homes: string[] = [];

export function cleanPublicationFixtures() {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
}

export function git(root: string, ...args: string[]): string {
	const result = Bun.spawnSync(["git", "-C", root, ...args], {
		env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
	});
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return result.stdout.toString().trim();
}

export function signing(root: string, key: string) {
	git(root, "config", "user.name", "Archive Author");
	git(root, "config", "user.email", "archive@example.test");
	git(root, "config", "gpg.format", "ssh");
	git(root, "config", "user.signingkey", key);
	git(root, "config", "commit.gpgsign", "true");
	const signers = `${key}.allowed`;
	writeFileSync(signers, `archive@example.test ${readFileSync(`${key}.pub`, "utf8")}`);
	git(root, "config", "gpg.ssh.allowedSignersFile", signers);
}

export function createSigningKey(root: string, key: string) {
	const result = Bun.spawnSync(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", key]);
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	signing(root, key);
}

export function publicationFixture() {
	const home = mkdtempSync(join(tmpdir(), "archboard-publication-"));
	homes.push(home);
	const root = join(home, "writer");
	const vault = join(root, ".archboard/vault");
	cpSync(resolve("examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	git(root, "init", "--quiet", "--initial-branch=main");
	const key = join(home, "signing-key");
	createSigningKey(root, key);
	git(root, "remote", "add", "origin", "https://github.com/acme/shop.git");
	writeFileSync(join(root, "code.ts"), "export const version = 1;\n");
	git(root, "add", ".");
	git(root, "commit", "--quiet", "-m", "test: seed source");
	const remote = join(home, "archive.git");
	git(root, "init", "--quiet", "--bare", "--initial-branch=main", remote);
	git(root, "remote", "add", "archive", `file://${remote}`);
	const destination = { remote: "archive", ref: "refs/heads/architecture-archive" };
	return { home, root, vault, key, remote, destination };
}

export async function retain(
	vault: string,
	operationId = "retain-first",
	dependencies: string[] = [],
) {
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const retained = await retainArchitectureCheckpoint(vault, {
		target: "current",
		operationId,
		writer: "test-agent",
		doing: "retaining a reading",
		expectedRevision: current.revision.digest,
		dependencies,
	});
	if (!retained.success) throw new Error(JSON.stringify(retained));
	return retained.checkpoint;
}

export function changeResponsibility(vault: string, responsibility: string) {
	const file = join(vault, "gateway.module.json");
	const module = JSON.parse(readFileSync(file, "utf8"));
	writeFileSync(file, JSON.stringify({ ...module, responsibility }));
}
