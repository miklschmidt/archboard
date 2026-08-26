#!/usr/bin/env bun

// Installing the skill has to leave the next agent a repo it can work in.
//
// The skill teaches the commands; it cannot know where this machine keeps its
// vault, or that `archboard` is not on PATH here. Those go into the repo's own
// CLAUDE.md or AGENTS.md, and getting that wrong is quiet: a second copy of the
// block appended on every re-install, or a CLAUDE.md created next to an
// AGENTS.md so two agent docs disagree. Both are checked here, against the real
// CLI running as a child process in throwaway repos under a temp dir.

import fs from "node:fs";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(moduleDir, "..");
const bin = join(repoRoot, "src", "bin.ts");

let failures = 0;
let checks = 0;

function assert(condition, message) {
	checks++;
	if (condition) return;
	failures++;
	console.error(`FAIL: ${message}`);
}

const scratch = fs.mkdtempSync(join(os.tmpdir(), "archboard-install-"));
const skillsRoot = join(scratch, "skills");
const home = join(scratch, "home");
fs.mkdirSync(home, { recursive: true });

// Every run installs into a throwaway skills root, never the machine's own.
function install(repo, extra = []) {
	const stdout = execFileSync(
		process.execPath,
		[bin, "install-skill", "--dir", skillsRoot, "--repo", repo, ...extra],
		{
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
			// A vault in the environment is somebody having already answered the
			// question; these cases are about what happens when nobody has.
			env: { ...process.env, ARCHBOARD_VAULT: "" },
		},
	);
	return JSON.parse(stdout);
}

function installWithHome(repo, extra = []) {
	const stdout = execFileSync(process.execPath, [bin, "install-skill", "--repo", repo, ...extra], {
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "pipe"],
		env: { ...process.env, HOME: home, ARCHBOARD_VAULT: "" },
	});
	return JSON.parse(stdout);
}

function runWithHome(repo, extra = []) {
	return spawnSync(process.execPath, [bin, "install-skill", "--repo", repo, ...extra], {
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "pipe"],
		env: { ...process.env, HOME: home, ARCHBOARD_VAULT: "" },
	});
}

function makeRepo(name, files = {}) {
	const repo = join(scratch, name);
	fs.mkdirSync(repo, { recursive: true });
	for (const [file, contents] of Object.entries(files)) {
		fs.writeFileSync(join(repo, file), contents, "utf-8");
	}
	return repo;
}

const BEGIN = "<!-- archboard:begin -->";

function sourceFiles(directory) {
	const files = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const file = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...sourceFiles(file));
		else if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)) files.push(file);
	}
	return files;
}

// Scan the live source tree itself, not a list of files that happened to exist
// when this check was written. The check's own matcher is outside src/; the
// custom boundary plugin's matcher is intentionally outside this scan too.
const staleLivePath = /(?:src\/core\/|frontend\/src\/)/;
for (const file of sourceFiles(join(repoRoot, "src"))) {
	const text = fs.readFileSync(file, "utf-8");
	assert(!staleLivePath.test(text), `${file} points to a deleted live source path`);
}

// Live maintainer and product docs must navigate the current deep-module tree.
// Measured design investigations are excluded because they carry an explicit
// historical-path notice and preserve the source locations they measured.
const liveDocs = [
	"AGENTS.md",
	"DESIGN.md",
	"INSTALL.md",
	"TESTING.md",
	"CONTEXT.md",
	"FLIP_WHITEBOARD.md",
	"docs/agents/boundaries.md",
	"docs/agents/test-suite.md",
	...fs.readdirSync(join(repoRoot, "docs", "adr")).map((name) => `docs/adr/${name}`),
	"skills/archboard/SKILL.md",
	"skills/archboard-dev/SKILL.md",
];
for (const relativePath of liveDocs) {
	const text = fs.readFileSync(join(repoRoot, relativePath), "utf-8");
	assert(
		!/(?:src\/core\/|frontend\/src\/)/.test(text),
		`${relativePath} points to a deleted src/core or frontend/src path`,
	);
}

// ─── Which doc a repo with neither gets ──────────────────────
//
// The end-to-end target cases set HOME to the throwaway directory above, so
// none of them can write into this machine's real ~/.agents or ~/.claude.

{
	const { chooseDoc } = await import(join(repoRoot, "src", "cli", "commands", "install-skill.ts"));
	const empty = makeRepo("choose");
	assert(
		chooseDoc(empty, "claude").file === join(empty, "CLAUDE.md"),
		"installing for claude should create CLAUDE.md",
	);
	assert(
		chooseDoc(empty, "agents").file === join(empty, "AGENTS.md"),
		"default install should create AGENTS.md",
	);
	assert(
		chooseDoc(empty, "dir").file === join(empty, "AGENTS.md"),
		"custom --dir install should create AGENTS.md",
	);
	assert(
		chooseDoc(empty, "claude").existed === false,
		"chooseDoc claimed a file that is not there",
	);
}

// ─── The default target is the shared agent skill root ───────

{
	const repo = makeRepo("default-home");
	const result = installWithHome(repo, ["--yes"]);
	const doc = join(repo, "AGENTS.md");

	assert(
		result.mode === "target:agents",
		`default install should report target:agents, got ${result.mode}`,
	);
	assert(
		result.root === join(home, ".agents", "skills"),
		`default root should be ~/.agents/skills, got ${result.root}`,
	);
	assert(
		result.target === join(home, ".agents", "skills", "archboard"),
		`default target should be under ~/.agents/skills, got ${result.target}`,
	);
	assert(
		fs.existsSync(join(home, ".agents", "skills", "archboard", "SKILL.md")),
		"default install did not copy the skill under ~/.agents/skills",
	);
	assert(
		result.setup.doc === doc,
		`default install should write AGENTS.md, wrote ${result.setup.doc}`,
	);
	assert(result.setup.docCreated === true, "default install did not create AGENTS.md");
	assert(!fs.existsSync(join(repo, "CLAUDE.md")), "default install created CLAUDE.md");
}

// ─── Claude remains an explicit target ───────────────────────

{
	const repo = makeRepo("claude-home");
	const result = installWithHome(repo, ["--target", "claude", "--yes"]);
	const doc = join(repo, "CLAUDE.md");

	assert(
		result.mode === "target:claude",
		`claude install should report target:claude, got ${result.mode}`,
	);
	assert(
		result.root === join(home, ".claude", "skills"),
		`claude root should be ~/.claude/skills, got ${result.root}`,
	);
	assert(
		result.target === join(home, ".claude", "skills", "archboard"),
		`claude target should be under ~/.claude/skills, got ${result.target}`,
	);
	assert(
		fs.existsSync(join(home, ".claude", "skills", "archboard", "SKILL.md")),
		"claude install did not copy the skill under ~/.claude/skills",
	);
	assert(
		result.setup.doc === doc,
		`claude install should write CLAUDE.md, wrote ${result.setup.doc}`,
	);
	assert(result.setup.docCreated === true, "claude install did not create CLAUDE.md");
	assert(!fs.existsSync(join(repo, "AGENTS.md")), "claude install created AGENTS.md");
}

// ─── skills.sh-compatible agent selectors ────────────────────

{
	const repo = makeRepo("agent-codex");
	const result = installWithHome(repo, ["--agent", "codex", "--yes"]);

	assert(
		result.mode === "agent:codex",
		`--agent codex should report agent:codex, got ${result.mode}`,
	);
	assert(
		result.root === join(home, ".agents", "skills"),
		`--agent codex should use ~/.agents/skills, got ${result.root}`,
	);
	assert(result.setup.doc === join(repo, "AGENTS.md"), "--agent codex should create AGENTS.md");
}

{
	const repo = makeRepo("agent-claude-code");
	const result = installWithHome(repo, ["--agent", "claude-code", "--yes"]);

	assert(
		result.mode === "agent:claude-code",
		`--agent claude-code should report agent:claude-code, got ${result.mode}`,
	);
	assert(
		result.root === join(home, ".claude", "skills"),
		`--agent claude-code should use ~/.claude/skills, got ${result.root}`,
	);
	assert(
		result.setup.doc === join(repo, "CLAUDE.md"),
		"--agent claude-code should create CLAUDE.md",
	);
}

// ─── Obsolete and arbitrary targets are refused ──────────────

{
	const repo = makeRepo("obsolete-codex");
	const result = runWithHome(repo, ["--target", "codex"]);
	assert(result.status === 2, `--target codex should exit 2, got ${result.status}`);
	assert(result.stderr.includes("obsolete"), "--target codex refusal did not say it is obsolete");
	assert(
		result.stderr.includes("~/.agents/skills"),
		"--target codex refusal did not point at the default root",
	);
	assert(
		!fs.existsSync(join(home, ".codex", "skills", "archboard")),
		"--target codex installed into ~/.codex/skills",
	);
}

{
	const repo = makeRepo("unknown-target");
	const result = runWithHome(repo, ["--target", "somewhere"]);
	assert(result.status === 2, `unknown --target should exit 2, got ${result.status}`);
	assert(
		result.stderr.includes("Unknown --target somewhere"),
		"unknown --target refusal did not name the value",
	);
	assert(
		result.stderr.includes("--dir <skills-root>"),
		"unknown --target refusal did not point at --dir",
	);
}

{
	const repo = makeRepo("unknown-agent");
	const result = runWithHome(repo, ["--agent", "claude"]);
	assert(result.status === 2, `unknown --agent should exit 2, got ${result.status}`);
	assert(
		result.stderr.includes("Unknown --agent claude"),
		"unknown --agent refusal did not name the value",
	);
	assert(
		result.stderr.includes("claude-code"),
		"unknown --agent refusal did not name the skills.sh Claude identifier",
	);
}

{
	const repo = makeRepo("conflicting-destinations");
	const result = runWithHome(repo, ["--agent", "codex", "--target", "claude"]);
	assert(result.status === 2, `conflicting destination flags should exit 2, got ${result.status}`);
	assert(
		result.stderr.includes("Use only one of"),
		"conflicting destination refusal did not explain exclusivity",
	);
}

// ─── A repo with no agent doc at all ─────────────────────────

{
	const repo = makeRepo("fresh");
	const result = install(repo);
	const doc = join(repo, "AGENTS.md");

	assert(
		result.setup.doc === doc,
		`an agent-neutral install should write AGENTS.md, wrote ${result.setup.doc}`,
	);
	assert(result.skill === "archboard", `the installed skill is named ${result.skill}`);
	assert(
		result.target === join(skillsRoot, "archboard"),
		`the skill was installed at ${result.target}`,
	);
	assert(result.setup.docCreated === true, "a repo with no agent doc should get one");
	assert(!fs.existsSync(join(repo, "CLAUDE.md")), "CLAUDE.md was created alongside AGENTS.md");

	const text = fs.readFileSync(doc, "utf-8");
	assert(text.includes("ARCHBOARD_VAULT"), "the doc does not name ARCHBOARD_VAULT");
	assert(text.includes(result.setup.vault), "the doc does not carry the vault path");
	assert(text.includes(result.setup.command), "the doc does not say how to invoke the CLI");
	assert(/Boards for this repo/.test(text), "the doc has no place for project conventions");
	assert(
		text.includes("the `archboard` skill"),
		"the doc names the retired skill instead of archboard",
	);

	// The vault has to exist, or the first board command fails on a path.
	assert(
		result.setup.vault === join(repo, ".archboard", "vault"),
		`assumed vault should be repo-local, got ${result.setup.vault}`,
	);
	assert(
		result.setup.vaultCreated === true && fs.existsSync(result.setup.vault),
		"the vault directory was not created",
	);
}

// ─── Custom paths stay available through --dir ───────────────

{
	const repo = makeRepo("custom-dir");
	const custom = join(scratch, "custom-root");
	const stdout = execFileSync(
		process.execPath,
		[bin, "install-skill", "--dir", custom, "--repo", repo],
		{
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, HOME: home, ARCHBOARD_VAULT: "" },
		},
	);
	const result = JSON.parse(stdout);
	assert(result.mode === "dir", `--dir should report mode dir, got ${result.mode}`);
	assert(result.root === custom, `--dir root was not honoured, got ${result.root}`);
	assert(
		result.target === join(custom, "archboard"),
		`--dir target was not honoured, got ${result.target}`,
	);
	assert(
		result.setup.doc === join(repo, "AGENTS.md"),
		"--dir should create agent-neutral docs when neither exists",
	);
	assert(fs.existsSync(join(custom, "archboard", "SKILL.md")), "--dir did not install the skill");
}

// ─── Existing symlink installs are refused, not overwritten ──

{
	const repo = makeRepo("symlink-refusal");
	const linkedRoot = join(scratch, "linked-root");
	const linkedTarget = join(linkedRoot, "archboard");
	fs.mkdirSync(linkedRoot, { recursive: true });
	fs.symlinkSync(join(repoRoot, "skills", "archboard"), linkedTarget, "dir");
	const result = spawnSync(
		process.execPath,
		[bin, "install-skill", "--dir", linkedRoot, "--repo", repo],
		{
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, HOME: home, ARCHBOARD_VAULT: "" },
		},
	);
	assert(result.status !== 0, `install over symlink should fail, got ${result.status}`);
	assert(
		result.stderr.includes("is a symlink; refusing to replace it"),
		"symlink refusal did not explain why it failed",
	);
	assert(fs.lstatSync(linkedTarget).isSymbolicLink(), "install over symlink replaced the symlink");
}

// ─── The same repo, installed into twice ─────────────────────

{
	const repo = makeRepo("twice");
	install(repo);
	const retired = join(skillsRoot, "excalidraw-skill");
	fs.mkdirSync(retired, { recursive: true });
	fs.writeFileSync(join(retired, "SKILL.md"), "name: excalidraw-skill\n", "utf-8");
	const first = fs.readFileSync(join(repo, "AGENTS.md"), "utf-8");
	const second = install(repo);
	const text = fs.readFileSync(join(repo, "AGENTS.md"), "utf-8");

	assert(
		second.setup.blockUpdated === true,
		"a re-install did not notice the block it had already written",
	);
	assert(second.setup.docCreated === false, "a re-install claimed to create a doc that existed");
	assert(text.split(BEGIN).length - 1 === 1, "re-installing appended a second block");
	assert(text === first, "re-installing changed the block it rewrote");
	assert(
		!fs.existsSync(retired),
		"re-installing left the retired excalidraw-skill beside archboard",
	);
}

// ─── Prose around the block survives ─────────────────────────

{
	const repo = makeRepo("prose", { "CLAUDE.md": "# House rules\n\nRun the tests.\n" });
	install(repo);
	const text = fs.readFileSync(join(repo, "CLAUDE.md"), "utf-8");
	assert(
		text.startsWith("# House rules\n\nRun the tests.\n"),
		"the existing doc was overwritten rather than appended to",
	);
	assert(text.includes(BEGIN), "the block was not added to the existing doc");

	// A human's own notes inside the block are the one part re-running loses;
	// everything they wrote outside it must not move.
	fs.appendFileSync(join(repo, "CLAUDE.md"), "\n## Afterwards\n\nStill here.\n", "utf-8");
	install(repo);
	const again = fs.readFileSync(join(repo, "CLAUDE.md"), "utf-8");
	assert(again.startsWith("# House rules"), "a re-install lost the prose before the block");
	assert(again.includes("## Afterwards"), "a re-install lost the prose after the block");
	assert(again.split(BEGIN).length - 1 === 1, "a re-install with trailing prose left two blocks");
}

// ─── An existing AGENTS.md is the doc, and stays the only one ─

{
	const repo = makeRepo("agents", { "AGENTS.md": "# Agents\n" });
	const result = install(repo);
	assert(
		result.setup.doc === join(repo, "AGENTS.md"),
		"an existing AGENTS.md should be the doc that gets the block",
	);
	assert(
		!fs.existsSync(join(repo, "CLAUDE.md")),
		"CLAUDE.md was created next to an existing AGENTS.md",
	);
}

// ─── CLAUDE.md wins when both exist ──────────────────────────

{
	const repo = makeRepo("both", { "CLAUDE.md": "# Claude\n", "AGENTS.md": "# Agents\n" });
	const result = install(repo);
	assert(result.setup.doc === join(repo, "CLAUDE.md"), "CLAUDE.md should win when both docs exist");
	assert(
		!fs.readFileSync(join(repo, "AGENTS.md"), "utf-8").includes(BEGIN),
		"the block went into both docs",
	);
}

// ─── Named answers, and no answer at all ─────────────────────

{
	const repo = makeRepo("named");
	const vault = join(scratch, "shared-vault");
	const result = install(repo, ["--vault", vault, "--doc", join(repo, "docs", "AGENTS.md")]);
	assert(result.setup.vault === vault, "--vault was not honoured");
	assert(fs.existsSync(vault), "--vault did not create the vault");
	assert(fs.existsSync(join(repo, "docs", "AGENTS.md")), "--doc did not write where it was told");
	assert(!fs.existsSync(join(repo, "CLAUDE.md")), "--doc still created a doc at the repo root");
}

{
	const repo = makeRepo("untouched");
	const result = install(repo, ["--no-doc"]);
	assert(result.setup === undefined, "--no-doc still reported a setup");
	assert(fs.readdirSync(repo).length === 0, "--no-doc wrote into the repo anyway");
	assert(
		fs.existsSync(join(skillsRoot, "archboard", "SKILL.md")),
		"--no-doc skipped the skill install too",
	);
}

// ─── An environment that has already answered ────────────────

{
	const repo = makeRepo("env");
	const vault = join(scratch, "cross-repo-vault");
	const stdout = execFileSync(
		process.execPath,
		[bin, "install-skill", "--dir", skillsRoot, "--repo", repo],
		{
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, ARCHBOARD_VAULT: vault },
		},
	);
	const result = JSON.parse(stdout);
	assert(
		result.setup.vault === vault,
		"ARCHBOARD_VAULT in the environment was ignored in favour of a local vault",
	);
}

fs.rmSync(scratch, { recursive: true, force: true });

if (failures > 0) {
	console.error(`\n${failures} of ${checks} install-doc checks failed`);
	process.exit(1);
}
console.log(`install-doc: ${checks} checks passed`);
