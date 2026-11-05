// Where the bundled skills come from, where an install puts them, and how the next agent should
// type "archboard" once they are there.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { installation } from "@archboard/workspace/installation";
import { CliUsageError } from "#cli/protocol/contract/contract.ts";

/** The skill that authors models; its installed copy also carries the generated schemas and manual. */
const CONSUMER_SKILL = "archboard";

/** Every skill an install ships, each into its own directory of the skills root. */
const BUNDLED_SKILLS = [CONSUMER_SKILL, "archboard-pr"] as const;
type BundledSkill = (typeof BUNDLED_SKILLS)[number];

interface SkillDestination {
	root: string;
	mode: string;
}

/**
 * Locates one bundled skill directory, refusing a checkout that lost it.
 * @param skill - The bundled skill.
 * @returns The absolute path of the bundled skill.
 */
function findSkillSource(skill: BundledSkill): string {
	const source = path.join(installation().skillsDirectory, skill);
	if (!fs.existsSync(path.join(source, "SKILL.md"))) {
		throw new Error(`Bundled skill not found at ${source} (broken install?)`);
	}
	return source;
}

/**
 * Expands a leading `~` to the home directory, the one shell convenience a path option gets.
 * @param input - The path as typed.
 * @returns The path with the home directory spelled out.
 */
function expandHome(input: string): string {
	if (input === "~") {
		return os.homedir();
	}
	if (input.startsWith(`~${path.sep}`)) {
		return path.join(os.homedir(), input.slice(2));
	}
	return input;
}

/**
 * The skills root a --target spelling names; the obsolete codex target is refused by name.
 * @param target - The target spelling.
 * @returns The absolute skills root.
 */
function resolveSkillsRoot(target: string): string {
	if (target === "agents") {
		return path.join(os.homedir(), ".agents", "skills");
	}
	if (target === "claude") {
		return path.join(os.homedir(), ".claude", "skills");
	}
	if (target === "codex") {
		throw new CliUsageError(
			"--target codex is obsolete. The default install root is ~/.agents/skills; use --dir <skills-root> for a custom location.",
		);
	}
	throw new CliUsageError(
		`Unknown --target ${target}. Supported targets: claude. Omit --target for ~/.agents/skills, or use --dir <skills-root> for a custom location.`,
	);
}

/**
 * The install destination for a --target spelling.
 * @param target - The target spelling.
 * @returns The skills root and the mode label reported.
 */
function resolveTarget(target: string): SkillDestination {
	return { root: resolveSkillsRoot(target), mode: `target:${target}` };
}

/**
 * The install destination for a skills.sh-compatible --agent spelling, mapped onto a target.
 * @param agent - The agent spelling.
 * @returns The destination.
 */
function resolveAgent(agent: string): SkillDestination {
	const targetSpec = agent === "codex" ? "agents" : agent === "claude-code" ? "claude" : undefined;
	if (!targetSpec) {
		throw new CliUsageError(`Unknown --agent ${agent}. Supported agents: codex, claude-code.`);
	}
	return { ...resolveTarget(targetSpec), mode: `agent:${agent}` };
}

/**
 * The install destination for an explicit --dir skills root.
 * @param dir - The skills root as typed.
 * @returns The destination with the "dir" mode label.
 */
function resolveExplicitDir(dir: string): SkillDestination {
	return { root: path.resolve(expandHome(dir)), mode: "dir" };
}

/**
 * Counts the files below a directory, recursively; the install reports it as a sanity check.
 * @param dir - The directory to count.
 * @returns The number of non-directory entries below it.
 */
function countFiles(dir: string): number {
	let count = 0;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			count += countFiles(path.join(dir, entry.name));
		} else {
			count++;
		}
	}
	return count;
}

export {
	CONSUMER_SKILL,
	BUNDLED_SKILLS,
	type BundledSkill,
	type SkillDestination,
	findSkillSource,
	expandHome,
	resolveTarget,
	resolveAgent,
	resolveExplicitDir,
	countFiles,
};
