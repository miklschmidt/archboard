import { describe, expect, test } from "bun:test";
import {
	appendFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createInstallFixture, installFailure } from "./support/install-fixture.ts";

const begin = "<!-- archboard:begin -->";

describe("install targets", () => {
	test("defaults to the isolated shared agent skill root", () => {
		using fixture = createInstallFixture();
		const repo = fixture.repo("default-home");
		const result = fixture.install(repo, ["--yes"], { home: true });
		const root = join(fixture.home, ".agents", "skills");
		expect(result).toMatchObject({
			mode: "target:agents",
			root,
			target: join(root, "archboard"),
		});
		expect(result.setup).toMatchObject({ doc: join(repo, "AGENTS.md"), docCreated: true });
		expect(existsSync(join(repo, "CLAUDE.md"))).toBe(false);
		fixture.assertSkillBytes(join(root, "archboard"));
	});

	test("keeps Claude and skills.sh selectors explicit", () => {
		using fixture = createInstallFixture();
		const claudeRepo = fixture.repo("claude-home");
		const claude = fixture.install(claudeRepo, ["--target", "claude", "--yes"], { home: true });
		expect(claude).toMatchObject({
			mode: "target:claude",
			root: join(fixture.home, ".claude", "skills"),
		});
		expect(claude.setup?.doc).toBe(join(claudeRepo, "CLAUDE.md"));
		expect(existsSync(join(claudeRepo, "AGENTS.md"))).toBe(false);
		const codexRepo = fixture.repo("agent-codex");
		const codex = fixture.install(codexRepo, ["--agent", "codex", "--yes"], { home: true });
		expect(codex).toMatchObject({
			mode: "agent:codex",
			root: join(fixture.home, ".agents", "skills"),
		});
		const codeRepo = fixture.repo("agent-claude-code");
		const code = fixture.install(codeRepo, ["--agent", "claude-code", "--yes"], { home: true });
		expect(code).toMatchObject({
			mode: "agent:claude-code",
			root: join(fixture.home, ".claude", "skills"),
		});
		expect(code.setup?.doc).toBe(join(codeRepo, "CLAUDE.md"));
	});

	test("refuses obsolete, unknown, and conflicting selectors without installation", () => {
		using fixture = createInstallFixture();
		for (const [name, args, diagnostic] of [
			["obsolete", ["--target", "codex"], "obsolete"],
			["unknown-target", ["--target", "somewhere"], "Unknown --target somewhere"],
			["unknown-agent", ["--agent", "claude"], "Unknown --agent claude"],
			["conflict", ["--agent", "codex", "--target", "claude"], "Use only one of"],
		] as const) {
			const repo = fixture.repo(name);
			const result = fixture.run(repo, args, { home: true });
			expect(result.status, installFailure(result)).toBe(2);
			expect(result.stdout, installFailure(result)).toBe("");
			expect(result.stderr, installFailure(result)).toContain(diagnostic);
		}
		expect(existsSync(join(fixture.home, ".codex", "skills", "archboard"))).toBe(false);
	});

	test("honors custom targets and refuses to replace a symlink", () => {
		using fixture = createInstallFixture();
		const repo = fixture.repo("custom");
		const custom = join(fixture.root, "custom-root");
		const result = fixture.install(repo, ["--dir", custom]);
		expect(result).toMatchObject({
			mode: "dir",
			root: custom,
			target: join(custom, "archboard"),
		});
		fixture.assertSkillBytes(join(custom, "archboard"));
		const linkedRepo = fixture.repo("linked");
		const linkedRoot = join(fixture.root, "linked-root");
		mkdirSync(linkedRoot);
		const linkedTarget = join(linkedRoot, "archboard");
		symlinkSync(join(fixture.root, "custom-root", "archboard"), linkedTarget, "dir");
		const refused = fixture.run(linkedRepo, ["--dir", linkedRoot]);
		expect(refused.status, installFailure(refused)).not.toBe(0);
		expect(refused.stderr, installFailure(refused)).toContain(
			"is a symlink; refusing to replace it",
		);
		expect(lstatSync(linkedTarget).isSymbolicLink()).toBe(true);
	});

	test("creates a usable repo setup and remains byte-idempotent", () => {
		using fixture = createInstallFixture();
		const repo = fixture.repo("fresh");
		const first = fixture.install(repo);
		const doc = join(repo, "AGENTS.md");
		expect(first.setup).toMatchObject({
			doc,
			docCreated: true,
			vault: fixture.vault,
			vaultCreated: false,
		});
		const firstBytes = readFileSync(doc);
		const retired = join(fixture.skillRoot, "excalidraw-skill");
		mkdirSync(retired, { recursive: true });
		writeFileSync(join(retired, "SKILL.md"), "name: excalidraw-skill\n");
		const second = fixture.install(repo);
		expect(second.setup).toMatchObject({ docCreated: false, blockUpdated: true });
		expect(readFileSync(doc)).toEqual(firstBytes);
		expect(readFileSync(doc, "utf8").split(begin)).toHaveLength(2);
		expect(existsSync(retired)).toBe(false);
	});

	test("preserves surrounding prose and chooses one existing doc", () => {
		using fixture = createInstallFixture();
		const prose = fixture.repo("prose", { "CLAUDE.md": "# House rules\n\nRun the tests.\n" });
		fixture.install(prose);
		appendFileSync(join(prose, "CLAUDE.md"), "\n## Afterwards\n\nStill here.\n");
		fixture.install(prose);
		const text = readFileSync(join(prose, "CLAUDE.md"), "utf8");
		expect(text).toStartWith("# House rules\n\nRun the tests.\n");
		expect(text).toContain("## Afterwards");
		expect(text.split(begin)).toHaveLength(2);
		const both = fixture.repo("both", { "CLAUDE.md": "# Claude\n", "AGENTS.md": "# Agents\n" });
		const result = fixture.install(both);
		expect(result.setup?.doc).toBe(join(both, "CLAUDE.md"));
		expect(readFileSync(join(both, "AGENTS.md"), "utf8")).not.toContain(begin);
	});

	test("honors named answers, no-doc, and an existing vault answer", () => {
		using fixture = createInstallFixture();
		const named = fixture.repo("named");
		const vault = join(fixture.root, "shared-vault");
		const customDoc = join(named, "docs", "AGENTS.md");
		const result = fixture.install(named, ["--vault", vault, "--doc", customDoc]);
		expect(result.setup?.vault).toBe(vault);
		expect(existsSync(customDoc)).toBe(true);
		const untouched = fixture.repo("untouched");
		const noDoc = fixture.install(untouched, ["--no-doc"]);
		expect(noDoc.setup).toBeUndefined();
		expect(readdirSync(untouched)).toEqual([]);
		const envRepo = fixture.repo("env");
		const fromEnv = fixture.install(envRepo);
		expect(fromEnv.setup?.vault).toBe(fixture.vault);
	});

	test("detects a redirected default install target", () => {
		using fixture = createInstallFixture();
		const repo = fixture.repo("mutation");
		const result = fixture.install(repo, ["--yes"], { home: true });
		expect(result.target).toBe(join(fixture.home, ".agents", "skills", "archboard"));
		expect(result.target).not.toBe(join(fixture.home, ".codex", "skills", "archboard"));
	});
});
