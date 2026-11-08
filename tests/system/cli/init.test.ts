// `archboard init` (TASK-601): it installs the skills with the skills CLI, sets the repository up,
// and, without a terminal, ends its answer with the prompt that an agent must follow to set up the
// language servers. The fixture's stand-in `bun` records the skills CLI call.

import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { listArchitectureCheckpoints } from "@archboard/model/store-read";
import { createInitFixture, initFailure } from "./support/init-fixture.ts";
import { checkoutRoot } from "./support/package-cli.ts";

const { join } = path;

/**
 * The block that versions before TASK-471.03 wrote into a repository's agent document.
 * @param machine The machine's path that the block held.
 * @returns The block, markers included, ending in a newline.
 */
function earlierBlock(machine: string): string {
	return [
		"<!-- archboard:begin -->",
		"<!-- Written by `archboard install-skill`. Re-running replaces this block. -->",
		"## Architecture canvas (archboard)",
		"",
		"```bash",
		`export ARCHBOARD_VAULT=${machine}/.archboard/vault`,
		"```",
		"",
		"<!-- archboard:end -->",
		"",
	].join("\n");
}

/**
 * Every file below a directory with its bytes, keyed by the path relative to it. The repository's
 * own history is left out.
 * @param directory The directory.
 * @returns The files.
 */
function filesBelow(directory: string): Map<string, Buffer> {
	const files = new Map<string, Buffer>();
	for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
		const file = join(entry.parentPath, entry.name);
		const relative = path.relative(directory, file);
		if (entry.isFile() && !relative.startsWith(".git")) files.set(relative, readFileSync(file));
	}
	return files;
}

/**
 * The skills CLI call that `init` makes for these agents.
 * @param agents The agents, as the skills CLI names them.
 * @returns The arguments of `bun`.
 */
function skillsCall(agents: readonly string[]): string[] {
	return [
		"x",
		"skills@1.7.6",
		"add",
		join(checkoutRoot, "skills"),
		"-g",
		"-y",
		"--agent",
		...agents,
		"--skill",
		"archboard",
		"archboard-pr",
	];
}

describe("archboard init", () => {
	test("installs the skills for Codex, sets the repository up, and ends with the prompt for the agent", () => {
		using fixture = createInitFixture();
		const repo = fixture.repo("fresh");
		fixture.git(repo, "init", "--quiet");
		const result = fixture.init(repo);
		const diagnostic = initFailure(result.spawn);
		expect(result.skills, diagnostic).toEqual({ runner: "bun" });
		expect(fixture.runnerCalls(), diagnostic).toEqual([skillsCall(["codex"])]);
		expect(result.setup, diagnostic).toMatchObject({
			vault: join(repo, ".archboard", "vault"),
			vaultCreated: true,
		});
		expect(result.agent, diagnostic).toBeUndefined();
		expect(result.next, diagnostic).toStartWith("The setup of this repository is not finished.");
		expect(result.next, diagnostic).toContain("language servers");
		expect(result.next, diagnostic).toContain("Wait until the user confirms or changes the plan.");
		expect(Object.keys(JSON.parse(result.spawn.stdout) as object).at(-1), diagnostic).toBe("next");
	});

	test("installs the skills for Claude Code as well when claude is on the PATH", () => {
		using fixture = createInitFixture();
		fixture.install("claude");
		const result = fixture.init(fixture.repo("with-claude"));
		expect(fixture.runnerCalls(), initFailure(result.spawn)).toEqual([
			skillsCall(["claude-code", "codex"]),
		]);
	});

	test("a failed skills CLI stops init before it changes the repository", () => {
		using fixture = createInitFixture();
		fixture.failRunner();
		const repo = fixture.repo("offline");
		const result = fixture.run(repo);
		const diagnostic = initFailure(result);
		expect(result.status, diagnostic).toBe(1);
		expect(result.stdout, diagnostic).toBe("");
		expect(result.stderr, diagnostic).toContain("The skills CLI failed (exit 3)");
		expect(result.stderr, diagnostic).toContain("registry unreachable");
		expect(readdirSync(repo), diagnostic).toEqual([]);
	});

	test("makes the vault and writes no agent document, and a rerun changes nothing", async () => {
		using fixture = createInitFixture();
		const repo = fixture.repo("fresh");
		fixture.git(repo, "init", "--quiet");
		const first = fixture.init(repo);
		const firstDiagnostic = initFailure(first.spawn);
		const vault = join(repo, ".archboard", "vault");
		expect(first.setup, firstDiagnostic).toMatchObject({
			vault,
			vaultCreated: true,
			removedBlocks: [],
		});
		expect(existsSync(join(vault, ".archboard", "config.yaml")), firstDiagnostic).toBe(true);
		expect(JSON.parse(readFileSync(join(vault, "model.json"), "utf8"))).toMatchObject({
			schemaVersion: 1,
			name: "fresh",
			current: null,
		});
		expect(existsSync(join(repo, "AGENTS.md")), firstDiagnostic).toBe(false);
		expect(existsSync(join(repo, "CLAUDE.md")), firstDiagnostic).toBe(false);
		const retained = await listArchitectureCheckpoints(vault);
		if (!retained.success) throw new Error(JSON.stringify(retained));
		expect(retained.checkpoints).toHaveLength(1);
		fixture.git(repo, "verify-commit", retained.checkpoints[0]!.id);
		const before = filesBelow(repo);
		const second = fixture.init(repo);
		const secondDiagnostic = initFailure(second.spawn);
		expect(second.setup, secondDiagnostic).toMatchObject({
			vaultCreated: false,
			removedBlocks: [],
		});
		expect(filesBelow(repo), secondDiagnostic).toEqual(before);
		expect(await listArchitectureCheckpoints(vault)).toEqual(retained);
	});

	test("model init in a checkout without a vault makes the vault that init makes, and registers the checkout", async () => {
		using fixture = createInitFixture();
		const installed = fixture.repo("installed");
		fixture.git(installed, "init", "--quiet");
		fixture.init(installed);
		const repo = fixture.repo("initialized");
		fixture.git(repo, "init", "--quiet");
		const inside = join(repo, "src");
		mkdirSync(inside);
		const made = fixture.archboard(inside, [
			"model",
			"init",
			"--name",
			"initialized",
			"--operation-id",
			"initialize",
			"--writer",
			"agent",
			"--doing",
			"Initialize architecture",
		]);
		const diagnostic = initFailure(made);
		expect(made.status, diagnostic).toBe(0);
		expect(JSON.parse(made.stdout), diagnostic).toMatchObject({ success: true });
		const vault = join(repo, ".archboard", "vault");
		const madeFiles = filesBelow(vault);
		const installedFiles = filesBelow(join(installed, ".archboard", "vault"));
		expect([...madeFiles.keys()].toSorted(), diagnostic).toEqual(
			[...installedFiles.keys()].toSorted(),
		);
		const config = join(".archboard", "config.yaml");
		expect(madeFiles.get(config), diagnostic).toEqual(installedFiles.get(config));
		expect(JSON.parse(readFileSync(join(vault, "model.json"), "utf8"))).toMatchObject({
			schemaVersion: 1,
			name: "initialized",
			current: null,
		});
		const retained = await listArchitectureCheckpoints(vault);
		if (!retained.success) throw new Error(JSON.stringify(retained));
		expect(retained.checkpoints).toHaveLength(1);
		fixture.git(repo, "verify-commit", retained.checkpoints[0]!.id);
		const listed = fixture.archboard(fixture.root, ["repo", "list"]);
		const roots = (JSON.parse(listed.stdout) as { repos: { root: string }[] }).repos.map(
			({ root }) => root,
		);
		expect(roots, initFailure(listed)).toContain(realpathSync(repo));
	});

	test("retries canonical setup after the configured signer fails", async () => {
		using fixture = createInitFixture();
		const repo = fixture.repo("signing-retry");
		fixture.git(repo, "init", "--quiet");
		fixture.git(repo, "config", "gpg.ssh.program", join(fixture.root, "missing-signer"));
		const refused = fixture.run(repo);
		expect(refused.status, initFailure(refused)).toBe(2);
		const vault = join(repo, ".archboard", "vault");
		expect(existsSync(join(vault, "model.json"))).toBe(false);
		fixture.git(repo, "config", "--unset", "gpg.ssh.program");
		const retried = fixture.init(repo);
		expect(existsSync(join(vault, "model.json")), initFailure(retried.spawn)).toBe(true);
		const retained = await listArchitectureCheckpoints(vault);
		if (!retained.success) throw new Error(JSON.stringify(retained));
		expect(retained.checkpoints).toHaveLength(1);
		fixture.git(repo, "verify-commit", retained.checkpoints[0]!.id);
	});

	test("removes the block of an earlier version, says so, and leaves every other byte of the document", () => {
		using fixture = createInitFixture();
		const authored = "# House rules\n\nRun the tests.\n\n";
		const afterwards = "## Afterwards\n\nStill here.\n";
		const repo = fixture.repo("upgraded", {
			"CLAUDE.md": `${authored}${earlierBlock(fixture.root)}${afterwards}`,
			"AGENTS.md": `# Agents\n\n${earlierBlock(fixture.root)}`,
		});
		writeFileSync(join(repo, "NOTES.md"), `Not an agent document.\n${earlierBlock(fixture.root)}`);
		const result = fixture.init(repo);
		const diagnostic = initFailure(result.spawn);
		expect(readFileSync(join(repo, "CLAUDE.md"), "utf8"), diagnostic).toBe(
			`${authored}${afterwards}`,
		);
		expect(readFileSync(join(repo, "AGENTS.md"), "utf8"), diagnostic).toBe("# Agents\n\n");
		// Only the two agent documents are managed: any other file keeps what it holds.
		expect(readFileSync(join(repo, "NOTES.md"), "utf8"), diagnostic).toContain("archboard:begin");
		expect(result.setup.removedBlocks.toSorted(), diagnostic).toEqual([
			join(repo, "AGENTS.md"),
			join(repo, "CLAUDE.md"),
		]);
		// The next run finds nothing to remove.
		const again = fixture.init(repo);
		expect(again.setup.removedBlocks, initFailure(again.spawn)).toEqual([]);
	});

	test("no file written into a repository holds a path of the machine that ran the installer", () => {
		using fixture = createInitFixture();
		const repo = fixture.repo("portable", { "AGENTS.md": earlierBlock(fixture.root) });
		fixture.init(repo);
		const machine = [fixture.root, fixture.home, checkoutRoot, homedir()];
		for (const [file, bytes] of filesBelow(repo)) {
			for (const held of machine) {
				expect(bytes.includes(Buffer.from(held)), `${file} holds ${held}`).toBe(false);
			}
		}
	});

	test("a directory inside a checkout sets the checkout up, where a command finds its vault", () => {
		using fixture = createInitFixture();
		const repo = fixture.repo("nested");
		const initialized = spawnSync("git", ["init", "-q", repo]);
		expect(initialized.status).toBe(0);
		const inside = join(repo, "src", "app");
		mkdirSync(inside, { recursive: true });
		const result = fixture.init(inside);
		expect(result.setup.vault, initFailure(result.spawn)).toBe(
			join(realpathSync(repo), ".archboard", "vault"),
		);
		expect(existsSync(join(inside, ".archboard")), initFailure(result.spawn)).toBe(false);
	});
});
