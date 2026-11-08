// `archboard init` installs the skills of this installation with the skills CLI (skills.sh), which
// knows where each agent reads its skills. A package runner starts the skills CLI: a person at a
// terminal picks one of those on the PATH, or skips, and a caller without a terminal gets the
// first one in the order of preference.

import fs from "node:fs";
import path from "node:path";
import type { CommandContext } from "#cli/contract/protocol/contract.ts";
import { choose } from "#cli/commands/init/operations/terminal-choice.ts";
import {
	BUNDLED_SKILLS,
	runnersOn,
	skillAgents,
	skillsCommand,
	type Runner,
} from "#cli/commands/init/rules/setup-choices.ts";
import { installation } from "@archboard/workspace/installation";

/** What the skills step did: the runner that installed the skills, or why none did. */
type SkillsInstall =
	| { readonly runner: Runner["id"] }
	| { readonly skipped: string; readonly command: string };

/** The lines of a failed skills CLI that its error repeats. */
const FAILURE_LINES = 20;

/**
 * Find a program on the PATH.
 * @param program The program.
 * @returns Its path, or null when the PATH does not have it.
 */
const which = (program: string): string | null => Bun.which(program);

/**
 * The skills directory of this installation, refusing an installation that lost a skill.
 * @returns The directory.
 * @throws {Error} When a bundled skill is missing.
 */
function skillsSource(): string {
	const source = installation().skillsDirectory;
	for (const skill of BUNDLED_SKILLS) {
		if (!fs.existsSync(path.join(source, skill, "SKILL.md"))) {
			throw new Error(`The bundled skill ${skill} is not in ${source}. Reinstall Archboard.`);
		}
	}
	return source;
}

/**
 * The runner to use: the person's pick at a terminal, else the first one found.
 * @param found The runners on the PATH, in the order of preference.
 * @param interactive Whether a person is at a terminal.
 * @returns The runner and its program, or undefined to skip.
 */
async function pickRunner(
	found: ReturnType<typeof runnersOn>,
	interactive: boolean,
): Promise<ReturnType<typeof runnersOn>[number] | undefined> {
	const [first, ...others] = found;
	if (first === undefined || !interactive) return first;
	const picked = await choose("Install the Archboard skills with", [
		{ value: first.runner.id, label: first.runner.program, hint: "skills CLI" },
		...others.map(({ runner }) => ({ value: runner.id, label: runner.program })),
		{ value: "skip", label: "Skip", hint: "install the skills later" },
	]);
	return found.find(({ runner }) => runner.id === picked);
}

/**
 * Run a command that talks to the person at the terminal.
 * @param command The command.
 * @returns Its exit code, and no output, because the person saw it.
 */
async function talkingRun(command: string[]): Promise<{ exit: number; output: string }> {
	const child = Bun.spawn(command, { stdio: ["inherit", "inherit", "inherit"] });
	return { exit: await child.exited, output: "" };
}

/**
 * Run a command and keep its output out of the answer.
 * @param command The command.
 * @returns Its exit code and its output.
 */
async function quietRun(command: string[]): Promise<{ exit: number; output: string }> {
	const child = Bun.spawn(command, { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
	const [exit, out, err] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	return { exit, output: `${out}${err}` };
}

/**
 * Run the skills CLI. At a terminal it talks to the person; otherwise its output stays out of the
 * answer, unless it fails.
 * @param command The command.
 * @param interactive Whether a person is at a terminal.
 * @throws {Error} When the skills CLI fails.
 */
async function runSkillsCli(command: string[], interactive: boolean): Promise<void> {
	const { exit, output } = interactive ? await talkingRun(command) : await quietRun(command);
	if (exit === 0) return;
	const tail = output.trim().split("\n").slice(-FAILURE_LINES).join("\n");
	throw new Error(
		`The skills CLI failed (exit ${String(exit)}), so no skill was installed: ${command.join(" ")}${tail === "" ? "" : `\n${tail}`}`,
	);
}

/**
 * Install the bundled skills globally with the skills CLI.
 * @param interactive Whether a person is at a terminal.
 * @param context Where the line that says what happened goes.
 * @returns What the step did.
 * @throws {Error} When the skills CLI fails.
 */
async function installBundledSkills(
	interactive: boolean,
	context: Pick<CommandContext, "diagnostic">,
): Promise<SkillsInstall> {
	const source = skillsSource();
	const manual = `npx skills add ${source} -g`;
	const found = runnersOn(which);
	const chosen = await pickRunner(found, interactive);
	if (chosen === undefined) {
		const skipped =
			found.length === 0
				? "Neither bun, pnpm nor npx is on the PATH, so the skills were not installed"
				: "The skills were not installed";
		context.diagnostic(`${skipped}. Install them with: ${manual}`);
		return { skipped, command: manual };
	}
	const agents = skillAgents(which);
	await runSkillsCli(
		skillsCommand(chosen.runner, chosen.path, source, agents, interactive),
		interactive,
	);
	return { runner: chosen.runner.id };
}

export { installBundledSkills };
