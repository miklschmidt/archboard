// Installing the skill an author will read, and checking that it is really
// there. The candidate is what `archboard install-skill` installs from this
// checkout. The baseline is the frozen package pins.json names, put in place of
// the candidate after the same install so the repository block, the vault
// and the skills root are exactly as the installer leaves them, and prepared
// with the same generated files.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prepareSkillArtifacts } from "@/runtime/skill-distribution/index";
import { archboardOk, type CliContext } from "@/runtime/skill-evaluation/lib/archboard";
import type { Arm } from "@/runtime/skill-evaluation/lib/blind";
import type { RunPaths } from "@/runtime/skill-evaluation/lib/isolation";

/** What was installed, for the manifest and for the grader's blinding audit. */
interface InstallRecord {
	readonly arm: Arm;
	readonly skillRoot: string;
	readonly source: string;
	readonly files: number;
	readonly digest: string;
	readonly setupBlock: string;
}

/**
 * Every file under a directory, relative, sorted.
 * @param directory The directory.
 * @returns The files.
 */
function filesUnder(directory: string): string[] {
	return fs
		.readdirSync(directory, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)))
		.toSorted();
}

/**
 * A digest over a directory's files and contents.
 * @param directory The directory.
 * @returns The hex digest.
 */
function digestOf(directory: string): string {
	const hash = createHash("sha256");
	for (const file of filesUnder(directory)) {
		hash
			.update(file)
			.update("\0")
			.update(fs.readFileSync(path.join(directory, file)))
			.update("\0");
	}
	return hash.digest("hex");
}

/**
 * Replaces the installed skill's authored files with the frozen package and
 * regenerates the derived files beside them.
 * @param installed The installed skill directory.
 * @param frozen The frozen package.
 * @param checkout The archboard checkout the generated files derive from.
 */
function swapInFrozen(installed: string, frozen: string, checkout: string): void {
	fs.rmSync(installed, { recursive: true, force: true });
	fs.cpSync(frozen, installed, { recursive: true });
	prepareSkillArtifacts(installed, { root: checkout });
}

/**
 * The setup block the installer wrote into the checkout's agent document.
 * @param flask The checkout.
 * @returns The block text.
 */
function setupBlockIn(flask: string): string {
	for (const name of ["AGENTS.md", "CLAUDE.md"]) {
		const file = path.join(flask, name);
		if (!fs.existsSync(file)) continue;
		const text = fs.readFileSync(file, "utf8");
		const begin = text.indexOf("<!-- archboard:begin -->");
		const end = text.indexOf("<!-- archboard:end -->");
		if (begin >= 0 && end > begin) return text.slice(begin, end);
	}
	throw new Error(`no archboard setup block in ${flask}`);
}

/**
 * Installs the skill for one arm and verifies the install independently of
 * the installer's own report.
 * @param arm Which skill version.
 * @param cli How to reach the CLI in the run's environment.
 * @param paths The run.
 * @param frozen The frozen baseline package.
 * @returns What is installed.
 */
async function installSkill(
	arm: Arm,
	cli: CliContext,
	paths: RunPaths,
	frozen: string,
): Promise<InstallRecord> {
	await archboardOk(cli, [
		"install-skill",
		"--agent",
		"codex",
		"--repo",
		paths.flask,
		"--vault",
		paths.vault,
		"--yes",
	]);
	const skillRoot = path.join(paths.home, ".agents", "skills", "archboard");
	if (arm === "baseline") swapInFrozen(skillRoot, frozen, cli.checkout);
	for (const required of [
		"SKILL.md",
		path.join("references", "generated", "semantic-board.schema.json"),
		path.join("references", "generated", "INSTALL.md"),
	]) {
		if (!fs.existsSync(path.join(skillRoot, required)))
			throw new Error(`installed skill lacks ${required}`);
	}
	const setupBlock = setupBlockIn(paths.flask);
	if (!setupBlock.includes(paths.vault))
		throw new Error("the setup block does not name the run's vault");
	return {
		arm,
		skillRoot,
		source: arm === "baseline" ? frozen : path.join(cli.checkout, "skills", "archboard"),
		files: filesUnder(skillRoot).length,
		digest: digestOf(skillRoot),
		setupBlock,
	};
}

export { digestOf, installSkill, type InstallRecord };
