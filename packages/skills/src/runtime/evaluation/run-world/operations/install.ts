// Installing the skill an author will read, and checking that it is really
// there. The world registers its checkout, as `archboard init` does, and gets
// the arm's package in its agents' skills root, with no network. The baseline's
// package is the frozen one pins.json names; the candidate's is the copy the
// batch kept when it started, never the checkout at the run's own time, so
// every candidate run and the grader read one text however long the batch runs.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { archboardOk, type CliContext } from "#runtime/evaluation/run-world/processes/archboard.ts";
import type { Arm } from "#runtime/evaluation/grading/operations/blind.ts";
import type { RunPaths } from "#runtime/evaluation/run-world/processes/isolation.ts";

/** What was installed, for the manifest and for the grader's blinding audit. */
interface InstallRecord {
	readonly arm: Arm;
	readonly skillRoot: string;
	readonly source: string;
	readonly files: number;
	readonly digest: string;
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
 * Replaces the installed skill with an arm's package.
 * @param installed The installed skill directory.
 * @param source The arm's package.
 */
function swapInPackage(installed: string, source: string): void {
	fs.rmSync(installed, { recursive: true, force: true });
	fs.cpSync(source, installed, { recursive: true });
}

/**
 * Installs the skill for one arm and verifies the install independently.
 * @param arm Which skill version.
 * @param cli How to reach the CLI in the run's environment.
 * @param paths The run.
 * @param source The arm's package: the frozen baseline, or the candidate the batch kept.
 * @returns What is installed.
 */
async function installSkill(
	arm: Arm,
	cli: CliContext,
	paths: RunPaths,
	source: string,
): Promise<InstallRecord> {
	await archboardOk(cli, ["repo", "add", paths.flask]);
	const skillRoot = path.join(paths.home, ".agents", "skills", "archboard");
	fs.mkdirSync(path.dirname(skillRoot), { recursive: true });
	swapInPackage(skillRoot, source);
	if (!fs.existsSync(path.join(skillRoot, "SKILL.md")))
		throw new Error("installed skill lacks SKILL.md");
	return {
		arm,
		skillRoot,
		source,
		files: filesUnder(skillRoot).length,
		digest: digestOf(skillRoot),
	};
}

export { digestOf, installSkill, type InstallRecord };
