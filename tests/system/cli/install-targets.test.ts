import { describe, expect, test } from "bun:test";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	realpathSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { z } from "zod";
import { listArchitectureCheckpoints } from "@archboard/board/store-read";
import { anchorsOf } from "@archboard/skills/citations";
import { createInstallFixture, installFailure, shippedSkills } from "./support/install-fixture.ts";
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

describe("install targets", () => {
	test("defaults to the isolated shared agent skill root", () => {
		using fixture = createInstallFixture();
		const repo = fixture.repo("default-home");
		const result = fixture.install(repo, [], { home: true });
		const diagnostic = installFailure(result.spawn);
		const root = join(fixture.home, ".agents", "skills");
		expect(result, diagnostic).toMatchObject({ mode: "target:agents", root });
		expect(result.skills, diagnostic).toEqual(
			shippedSkills.map((skill) => expect.objectContaining({ skill, target: join(root, skill) })),
		);
		expect(result.setup, diagnostic).toMatchObject({
			vault: join(repo, ".archboard", "vault"),
			vaultCreated: true,
		});
		expect(() => {
			fixture.assertSkillBytes(root);
		}, diagnostic).not.toThrow();
	});

	test("keeps Claude and skills.sh selectors explicit", () => {
		using fixture = createInstallFixture();
		const claude = fixture.install(fixture.repo("claude-home"), ["--target", "claude"], {
			home: true,
		});
		expect(claude, installFailure(claude.spawn)).toMatchObject({
			mode: "target:claude",
			root: join(fixture.home, ".claude", "skills"),
		});
		const codex = fixture.install(fixture.repo("agent-codex"), ["--agent", "codex"], {
			home: true,
		});
		expect(codex, installFailure(codex.spawn)).toMatchObject({
			mode: "agent:codex",
			root: join(fixture.home, ".agents", "skills"),
		});
		const code = fixture.install(fixture.repo("agent-claude-code"), ["--agent", "claude-code"], {
			home: true,
		});
		expect(code, installFailure(code.spawn)).toMatchObject({
			mode: "agent:claude-code",
			root: join(fixture.home, ".claude", "skills"),
		});
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
			expect(existsSync(join(repo, ".archboard")), installFailure(result)).toBe(false);
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
		expect(result, diagnostic).toMatchObject({ mode: "dir", root: custom });
		expect(() => {
			fixture.assertSkillBytes(custom);
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
		// The refusal comes before any skill is swapped in, so none of them is half installed.
		expect(readdirSync(linkedRoot), installFailure(refused)).toEqual(["archboard"]);
	});

	test("makes the vault and writes no agent document, and a rerun changes nothing", async () => {
		using fixture = createInstallFixture();
		const repo = fixture.repo("fresh");
		fixture.git(repo, "init", "--quiet");
		const first = fixture.install(repo);
		const firstDiagnostic = installFailure(first.spawn);
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
		const second = fixture.install(repo);
		const secondDiagnostic = installFailure(second.spawn);
		expect(second.setup, secondDiagnostic).toMatchObject({
			vaultCreated: false,
			removedBlocks: [],
		});
		expect(filesBelow(repo), secondDiagnostic).toEqual(before);
		expect(await listArchitectureCheckpoints(vault)).toEqual(retained);
		expect(() => fixture.assertSkillBytes(fixture.skillRoot), secondDiagnostic).not.toThrow();
	});

	test("removes the block of an earlier version, says so, and leaves every other byte of the document", () => {
		using fixture = createInstallFixture();
		const authored = "# House rules\n\nRun the tests.\n\n";
		const afterwards = "## Afterwards\n\nStill here.\n";
		const repo = fixture.repo("upgraded", {
			"CLAUDE.md": `${authored}${earlierBlock(fixture.root)}${afterwards}`,
			"AGENTS.md": `# Agents\n\n${earlierBlock(fixture.root)}`,
		});
		writeFileSync(join(repo, "NOTES.md"), `Not an agent document.\n${earlierBlock(fixture.root)}`);
		const result = fixture.install(repo);
		const diagnostic = installFailure(result.spawn);
		expect(readFileSync(join(repo, "CLAUDE.md"), "utf8"), diagnostic).toBe(
			`${authored}${afterwards}`,
		);
		expect(readFileSync(join(repo, "AGENTS.md"), "utf8"), diagnostic).toBe("# Agents\n\n");
		// Only the two agent documents are managed: any other file keeps what it holds.
		expect(readFileSync(join(repo, "NOTES.md"), "utf8"), diagnostic).toContain("archboard:begin");
		expect(result.setup?.removedBlocks.toSorted(), diagnostic).toEqual([
			join(repo, "AGENTS.md"),
			join(repo, "CLAUDE.md"),
		]);
		// The next run finds nothing to remove.
		const again = fixture.install(repo);
		expect(again.setup?.removedBlocks, installFailure(again.spawn)).toEqual([]);
	});

	test("no file written into a repository holds a path of the machine that ran the installer", () => {
		using fixture = createInstallFixture();
		const repo = fixture.repo("portable", { "AGENTS.md": earlierBlock(fixture.root) });
		fixture.install(repo);
		const machine = [fixture.root, fixture.home, checkoutRoot, homedir()];
		for (const [file, bytes] of filesBelow(repo)) {
			for (const held of machine) {
				expect(bytes.includes(Buffer.from(held)), `${file} holds ${held}`).toBe(false);
			}
		}
	});

	test("a directory inside a checkout sets the checkout up, where a command finds its vault", () => {
		using fixture = createInstallFixture();
		const repo = fixture.repo("nested");
		const initialized = spawnSync("git", ["init", "-q", repo]);
		expect(initialized.status).toBe(0);
		const inside = join(repo, "src", "app");
		mkdirSync(inside, { recursive: true });
		const result = fixture.install(inside);
		expect(result.setup?.vault, installFailure(result.spawn)).toBe(
			join(realpathSync(repo), ".archboard", "vault"),
		);
		expect(existsSync(join(inside, ".archboard")), installFailure(result.spawn)).toBe(false);
	});

	test("honors a named repository and no-setup", () => {
		using fixture = createInstallFixture();
		const untouched = fixture.repo("untouched");
		const noSetupRoot = join(fixture.root, "no-setup-skills");
		const noSetup = fixture.install(untouched, ["--dir", noSetupRoot, "--no-setup"]);
		const noSetupDiagnostic = installFailure(noSetup.spawn);
		expect(noSetup.setup, noSetupDiagnostic).toBeUndefined();
		expect(readdirSync(untouched), noSetupDiagnostic).toEqual([]);
		expect(existsSync(join(noSetupRoot, "archboard", "SKILL.md")), noSetupDiagnostic).toBe(true);
	});
});

describe("what an install carries beyond the authored skill", () => {
	test("an install outside the checkout ships schemas an agent can validate against, and a manual whose links resolve", () => {
		using fixture = createInstallFixture();
		const repo = fixture.repo("portable");
		const custom = join(fixture.root, "portable-root");
		const result = fixture.install(repo, ["--dir", custom, "--no-setup"]);
		const diagnostic = installFailure(result.spawn);
		const skill = join(custom, "archboard");
		const generated = join(skill, "references", "generated");
		expect(() => fixture.assertSkillBytes(custom), diagnostic).not.toThrow();
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
			const [file, anchor] = target!.split("#");
			expect(existsSync(file!), `${target} from the shipped INSTALL.md`).toBe(true);
			if (anchor !== undefined)
				expect(anchorsOf(readFileSync(file!, "utf8")).has(anchor), target).toBe(true);
		}
	});
});
