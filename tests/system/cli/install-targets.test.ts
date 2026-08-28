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
		const diagnostic = installFailure(result.spawn);
		const root = join(fixture.home, ".agents", "skills");
		expect(result, diagnostic).toMatchObject({
			mode: "target:agents",
			root,
			target: join(root, "archboard"),
		});
		expect(result.setup, diagnostic).toMatchObject({
			doc: join(repo, "AGENTS.md"),
			docCreated: true,
		});
		expect(existsSync(join(repo, "CLAUDE.md")), diagnostic).toBe(false);
		expect(() => fixture.assertSkillBytes(join(root, "archboard")), diagnostic).not.toThrow();
	});

	test("keeps Claude and skills.sh selectors explicit", () => {
		using fixture = createInstallFixture();
		const claudeRepo = fixture.repo("claude-home");
		const claude = fixture.install(claudeRepo, ["--target", "claude", "--yes"], { home: true });
		const claudeDiagnostic = installFailure(claude.spawn);
		expect(claude, claudeDiagnostic).toMatchObject({
			mode: "target:claude",
			root: join(fixture.home, ".claude", "skills"),
		});
		expect(claude.setup?.doc, claudeDiagnostic).toBe(join(claudeRepo, "CLAUDE.md"));
		expect(existsSync(join(claudeRepo, "AGENTS.md")), claudeDiagnostic).toBe(false);
		const codexRepo = fixture.repo("agent-codex");
		const codex = fixture.install(codexRepo, ["--agent", "codex", "--yes"], { home: true });
		const codexDiagnostic = installFailure(codex.spawn);
		expect(codex, codexDiagnostic).toMatchObject({
			mode: "agent:codex",
			root: join(fixture.home, ".agents", "skills"),
		});
		const codeRepo = fixture.repo("agent-claude-code");
		const code = fixture.install(codeRepo, ["--agent", "claude-code", "--yes"], { home: true });
		const codeDiagnostic = installFailure(code.spawn);
		expect(code, codeDiagnostic).toMatchObject({
			mode: "agent:claude-code",
			root: join(fixture.home, ".claude", "skills"),
		});
		expect(code.setup?.doc, codeDiagnostic).toBe(join(codeRepo, "CLAUDE.md"));
	});

	test("refuses obsolete, unknown, and conflicting selectors without installation", () => {
		using fixture = createInstallFixture();
		for (const [name, args, refusal, remediation] of [
			["obsolete", ["--target", "codex"], "obsolete", "~/.agents/skills"],
			[
				"unknown-target",
				["--target", "somewhere"],
				"Unknown --target somewhere",
				"--dir <skills-root>",
			],
			["unknown-agent", ["--agent", "claude"], "Unknown --agent claude", "claude-code"],
			["conflict", ["--agent", "codex", "--target", "claude"], "Use only one of", null],
		] as const) {
			const repo = fixture.repo(name);
			const result = fixture.run(repo, args, { home: true });
			expect(result.status, installFailure(result)).toBe(2);
			expect(result.stdout, installFailure(result)).toBe("");
			expect(result.stderr, installFailure(result)).toContain(refusal);
			if (remediation) expect(result.stderr, installFailure(result)).toContain(remediation);
			if (name === "obsolete")
				expect(
					existsSync(join(fixture.home, ".codex", "skills", "archboard")),
					installFailure(result),
				).toBe(false);
		}
	});

	test("honors custom targets and refuses to replace a symlink", () => {
		using fixture = createInstallFixture();
		const repo = fixture.repo("custom");
		const custom = join(fixture.root, "custom-root");
		const result = fixture.install(repo, ["--dir", custom]);
		const diagnostic = installFailure(result.spawn);
		expect(result, diagnostic).toMatchObject({
			mode: "dir",
			root: custom,
			target: join(custom, "archboard"),
		});
		expect(() => fixture.assertSkillBytes(join(custom, "archboard")), diagnostic).not.toThrow();
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
		expect(lstatSync(linkedTarget).isSymbolicLink(), installFailure(refused)).toBe(true);
	});

	test("creates a usable repo setup and remains byte-idempotent", () => {
		using fixture = createInstallFixture();
		const repo = fixture.repo("fresh");
		const first = fixture.install(repo);
		const firstDiagnostic = installFailure(first.spawn);
		const doc = join(repo, "AGENTS.md");
		expect(first.setup, firstDiagnostic).toMatchObject({
			doc,
			docCreated: true,
			vault: fixture.vault,
			vaultCreated: false,
		});
		if (!first.setup) throw new Error(firstDiagnostic);
		expect(first.skill, firstDiagnostic).toBe("archboard");
		expect(first.target, firstDiagnostic).toBe(join(fixture.skillRoot, "archboard"));
		const setupBytes = readFileSync(doc);
		expect(
			setupBytes.includes(Buffer.from(`export ARCHBOARD_VAULT=${first.setup.vault}`)),
			firstDiagnostic,
		).toBe(true);
		expect(
			setupBytes.includes(
				Buffer.from(`ARCHBOARD_VAULT=${first.setup.vault} ${first.setup.command} board list`),
			),
			firstDiagnostic,
		).toBe(true);
		expect(setupBytes.includes(Buffer.from("### Boards for this repo")), firstDiagnostic).toBe(
			true,
		);
		expect(setupBytes.includes(Buffer.from("the `archboard` skill")), firstDiagnostic).toBe(true);
		const firstBytes = readFileSync(doc);
		const retired = join(fixture.skillRoot, "excalidraw-skill");
		mkdirSync(retired, { recursive: true });
		writeFileSync(join(retired, "SKILL.md"), "name: excalidraw-skill\n");
		const second = fixture.install(repo);
		const secondDiagnostic = installFailure(second.spawn);
		expect(second.setup, secondDiagnostic).toMatchObject({ docCreated: false, blockUpdated: true });
		expect(readFileSync(doc), secondDiagnostic).toEqual(firstBytes);
		expect(readFileSync(doc, "utf8").split(begin), secondDiagnostic).toHaveLength(2);
		expect(existsSync(retired), secondDiagnostic).toBe(false);
	});

	test("preserves surrounding prose and chooses one existing doc", () => {
		using fixture = createInstallFixture();
		const prose = fixture.repo("prose", { "CLAUDE.md": "# House rules\n\nRun the tests.\n" });
		const proseFirst = fixture.install(prose);
		appendFileSync(join(prose, "CLAUDE.md"), "\n## Afterwards\n\nStill here.\n");
		const proseSecond = fixture.install(prose);
		const proseDiagnostic = installFailure(proseSecond.spawn);
		const text = readFileSync(join(prose, "CLAUDE.md"), "utf8");
		expect(proseFirst.spawn.status, installFailure(proseFirst.spawn)).toBe(0);
		expect(text, proseDiagnostic).toStartWith("# House rules\n\nRun the tests.\n");
		expect(text, proseDiagnostic).toContain("## Afterwards");
		expect(text.split(begin), proseDiagnostic).toHaveLength(2);
		const agents = fixture.repo("agents", { "AGENTS.md": "# Agents\n" });
		const agentsOnly = fixture.install(agents);
		const agentsDiagnostic = installFailure(agentsOnly.spawn);
		expect(agentsOnly.setup?.doc, agentsDiagnostic).toBe(join(agents, "AGENTS.md"));
		expect(existsSync(join(agents, "CLAUDE.md")), agentsDiagnostic).toBe(false);
		const both = fixture.repo("both", { "CLAUDE.md": "# Claude\n", "AGENTS.md": "# Agents\n" });
		const result = fixture.install(both);
		const diagnostic = installFailure(result.spawn);
		expect(result.setup?.doc, diagnostic).toBe(join(both, "CLAUDE.md"));
		expect(readFileSync(join(both, "AGENTS.md"), "utf8"), diagnostic).not.toContain(begin);
	});

	test("honors named answers, no-doc, and an existing vault answer", () => {
		using fixture = createInstallFixture();
		const named = fixture.repo("named");
		const vault = join(fixture.root, "shared-vault");
		const customDoc = join(named, "docs", "AGENTS.md");
		const result = fixture.install(named, ["--vault", vault, "--doc", customDoc]);
		const diagnostic = installFailure(result.spawn);
		expect(result.setup?.vault, diagnostic).toBe(vault);
		expect(existsSync(vault), diagnostic).toBe(true);
		expect(existsSync(customDoc), diagnostic).toBe(true);
		expect(existsSync(join(named, "CLAUDE.md")), diagnostic).toBe(false);
		const untouched = fixture.repo("untouched");
		const noDocRoot = join(fixture.root, "no-doc-skills");
		const noDoc = fixture.install(untouched, ["--dir", noDocRoot, "--no-doc"]);
		const noDocDiagnostic = installFailure(noDoc.spawn);
		expect(noDoc.setup, noDocDiagnostic).toBeUndefined();
		expect(readdirSync(untouched), noDocDiagnostic).toEqual([]);
		expect(existsSync(join(noDocRoot, "archboard", "SKILL.md")), noDocDiagnostic).toBe(true);
		const envRepo = fixture.repo("env");
		const fromEnv = fixture.install(envRepo);
		expect(fromEnv.setup?.vault, installFailure(fromEnv.spawn)).toBe(fixture.vault);
	});

	test("detects a redirected default install target", () => {
		using fixture = createInstallFixture();
		const repo = fixture.repo("mutation");
		const result = fixture.install(repo, ["--yes"], { home: true });
		const diagnostic = installFailure(result.spawn);
		expect(result.target, diagnostic).toBe(join(fixture.home, ".agents", "skills", "archboard"));
		expect(result.target, diagnostic).not.toBe(join(fixture.home, ".codex", "skills", "archboard"));
	});
});
