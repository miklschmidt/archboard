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
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { z } from "zod";
import { createInstallFixture, installFailure } from "./support/install-fixture.ts";

const begin = "<!-- archboard:begin -->";
const { join } = path;

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
		expect(() => {
			fixture.assertSkillBytes(join(root, "archboard"));
		}, diagnostic).not.toThrow();
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
		for (const [name, args] of [
			["obsolete", ["--target", "codex"]],
			["unknown-target", ["--target", "somewhere"]],
			["unknown-agent", ["--agent", "claude"]],
			["conflict", ["--agent", "codex", "--target", "claude"]],
		] as const) {
			const repo = fixture.repo(name);
			const result = fixture.run(repo, args, { home: true });
			expect(result.status, installFailure(result)).toBe(2);
			expect(result.stdout, installFailure(result)).toBe("");
			expect(result.stderr, installFailure(result)).toContain("Usage:");
			expect(existsSync(join(repo, "AGENTS.md")), installFailure(result)).toBe(false);
			expect(existsSync(join(repo, "CLAUDE.md")), installFailure(result)).toBe(false);
			expect(
				existsSync(join(fixture.home, ".agents", "skills", "archboard")),
				installFailure(result),
			).toBe(false);
			expect(
				existsSync(join(fixture.home, ".claude", "skills", "archboard")),
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
		expect(() => {
			fixture.assertSkillBytes(join(custom, "archboard"));
		}, diagnostic).not.toThrow();
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
		if (!first.setup) {
			throw new Error(firstDiagnostic);
		}
		expect(first.skill, firstDiagnostic).toBe("archboard");
		expect(first.target, firstDiagnostic).toBe(join(fixture.skillRoot, "archboard"));
		const setupBytes = readFileSync(doc);
		expect(
			setupBytes.includes(Buffer.from(`export ARCHBOARD_VAULT=${first.setup.vault}`)),
			firstDiagnostic,
		).toBe(true);
		expect(
			setupBytes.includes(
				Buffer.from(`ARCHBOARD_VAULT=${first.setup.vault} ${first.setup.command} semantic`),
			),
			firstDiagnostic,
		).toBe(true);
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

describe("what an install carries beyond the authored skill", () => {
	test("an install outside the checkout ships schemas an agent can validate against, and a manual whose links resolve", () => {
		using fixture = createInstallFixture();
		const repo = fixture.repo("portable");
		const custom = join(fixture.root, "portable-root");
		const result = fixture.install(repo, ["--dir", custom, "--no-doc"]);
		const diagnostic = installFailure(result.spawn);
		const skill = join(custom, "archboard");
		const generated = join(skill, "references", "generated");
		expect(() => fixture.assertSkillBytes(skill), diagnostic).not.toThrow();
		// The evaluation inputs are the repository's, never the installed skill's (TASK-212).
		expect(existsSync(join(skill, "evals")), diagnostic).toBe(false);

		// Module tests own schema semantics. This system boundary proves the files
		// that actually landed outside the checkout are complete JSON Schemas a
		// consumer can compile.
		const DateTimeSchema = z.iso.datetime();
		const ajv = new Ajv2020({
			strict: false,
			formats: {
				"date-time": (value: string) => DateTimeSchema.safeParse(value).success,
			},
		});
		for (const file of readdirSync(generated).filter((name) => name.endsWith(".json"))) {
			expect(() =>
				ajv.compile(JSON.parse(readFileSync(join(generated, file), "utf8"))),
			).not.toThrow();
		}

		// Every link the shipped guidance and manual make resolves from where they sit.
		const guidance = readFileSync(join(skill, "references", "schemas.md"), "utf8");
		for (const [, target] of guidance.matchAll(/\]\(([^)#]+)\)/gu)) {
			expect(existsSync(join(skill, "references", target!)), `${target} from schemas.md`).toBe(
				true,
			);
		}
		const manual = readFileSync(join(generated, "INSTALL.md"), "utf8");
		expect(manual.startsWith("<!-- Generated copy of"), diagnostic).toBe(true);
		for (const [, target] of manual.matchAll(/\]\(<([^>]+)>\)/gu)) {
			if (/^https?:/u.test(target!)) continue;
			expect(existsSync(target!), `${target} from the shipped INSTALL.md`).toBe(true);
		}
	});
});
