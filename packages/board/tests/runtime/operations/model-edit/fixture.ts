import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import { claimArchitectureSubjects } from "@archboard/board/store-write";
const homes: string[] = [];
function disposeFixtures() {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
}
function git(root: string, ...args: string[]): string {
	const result = Bun.spawnSync(["git", "-C", root, ...args]);
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return result.stdout.toString().trim();
}
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "archboard-edit-"));
	homes.push(root);
	const vault = join(root, ".archboard/vault");
	cpSync(resolve("examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	git(root, "init", "--quiet", "--initial-branch=main");
	git(root, "config", "user.name", "Edit Author");
	git(root, "config", "user.email", "edit@example.test");
	git(root, "config", "commit.gpgsign", "false");
	writeFileSync(join(root, "code.ts"), "export const value = 1;\n");
	git(root, "add", ".");
	git(root, "commit", "--quiet", "-m", "test: seed architecture");
	return { root, vault };
}
async function intent(vault: string, operationId = "explain-1") {
	const current = readArchitectureModel(vault);
	if (!current.success || current.manifest.current === null)
		throw new Error(JSON.stringify(current));
	const target = { model: current.manifest.id, state: current.manifest.current.id };
	const claimed = await claimArchitectureSubjects(vault, {
		target,
		writer: "agent",
		reason: "explaining the gateway",
		subjects: ["Shop#Gateway"],
	});
	if (!claimed.success) throw new Error(JSON.stringify(claimed));
	return {
		target,
		subject: "Shop#Gateway",
		expectedRevision: current.revision,
		operationId,
		writer: "agent",
		doing: "explaining request routing",
		claim: claimed.claim.id,
		description: "Routes authenticated requests through the worker.",
	};
}
function readBytes(vault: string, file = "gateway.module.json") {
	return readFileSync(join(vault, file));
}
export { fixture, git, intent, readBytes, disposeFixtures };

async function structureIntent(vault: string, subjects: string[]) {
	const current = readArchitectureModel(vault);
	if (!current.success || current.manifest.current === null)
		throw new Error(JSON.stringify(current));
	const target = { model: current.manifest.id, state: current.manifest.current.id };
	const claimed = await claimArchitectureSubjects(vault, {
		target,
		writer: "agent",
		reason: "changing module structure",
		subjects,
	});
	if (!claimed.success) throw new Error(JSON.stringify(claimed));
	return {
		target,
		expectedRevision: current.revision,
		operationId: crypto.randomUUID(),
		writer: "agent",
		doing: "changing module structure",
		claim: claimed.claim.id,
	};
}

export { structureIntent };
