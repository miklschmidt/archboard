// Where the bundled skills come from, where an install puts them, and how the next agent should
// type "archboard" once they are there.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { CliUsageError } from "@/cli/command-contract/contract";

/** The skill that authors boards; its installed copy also carries the generated schemas and manual. */
const BOARD_SKILL = "archboard";

/** Every skill an install ships, each into its own directory of the skills root. */
const BUNDLED_SKILLS = [BOARD_SKILL, "archboard-pr"] as const;
type BundledSkill = (typeof BUNDLED_SKILLS)[number];

interface SkillDestination {
	root: string;
	mode: string;
}

/**
 * The archboard checkout root. The layout is <root>/{src,skills,bin,...} and this module lives
 * at src/cli/commands/lib/, so the root is four levels up; resolving relative to the module
 * path keeps this working from any cwd.
 * @returns The absolute checkout root.
 */
function packageRoot(): string {
	return fileURLToPath(new URL("../../../..", import.meta.url));
}

/**
 * Locates one bundled skill directory, refusing a checkout that lost it.
 * @param skill - The bundled skill.
 * @returns The absolute path of the bundled skill.
 */
function findSkillSource(skill: BundledSkill): string {
	const source = path.join(packageRoot(), "skills", skill);
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
 * @returns The destination plus the target spelling it mapped to, which the doc choice reuses.
 */
function resolveAgent(agent: string): SkillDestination & { targetSpec: string } {
	const targetSpec = agent === "codex" ? "agents" : agent === "claude-code" ? "claude" : undefined;
	if (!targetSpec) {
		throw new CliUsageError(`Unknown --agent ${agent}. Supported agents: codex, claude-code.`);
	}
	const resolved = resolveTarget(targetSpec);
	return { ...resolved, mode: `agent:${agent}`, targetSpec };
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

/**
 * Resolves a path through symlinks without throwing for a path that does not exist.
 * @param candidate - The path to resolve.
 * @returns The real path, or null when it cannot be resolved.
 */
function realpathOrNull(candidate: string): string | null {
	try {
		return fs.realpathSync(candidate);
	} catch {
		return null;
	}
}

/**
 * Whether some `archboard` on PATH resolves to one of this checkout's entry points.
 * @param ours - The real paths of this checkout's entry points.
 * @returns True when the name on PATH is this build.
 */
function archboardOnPath(ours: ReadonlySet<string>): boolean {
	for (const dir of (process.env["PATH"] ?? "").split(path.delimiter)) {
		if (!dir) {
			continue;
		}
		const resolved = realpathOrNull(path.join(dir, "archboard"));
		if (resolved && ours.has(resolved)) {
			return true;
		}
	}
	return false;
}

/**
 * How the next agent should type "archboard".
 *
 * The skill's every example says `archboard`, which is a lie in any repo where
 * nobody linked it onto PATH. So check: an `archboard` on PATH counts only
 * when it actually resolves to this build. Otherwise return the absolute
 * path of the entry point that is running right now, which always works.
 * @returns The command to type and whether it is the bare name on PATH.
 */
function resolveInvocation(): { command: string; onPath: boolean } {
	const root = packageRoot();
	const wrapper = path.join(root, "bin", "archboard");
	const entry = path.join(root, "src", "bin.ts");
	const ours = new Set(
		[wrapper, entry].map(realpathOrNull).filter((value): value is string => value !== null),
	);
	if (archboardOnPath(ours)) {
		return { command: "archboard", onPath: true };
	}
	if (fs.existsSync(wrapper)) {
		return { command: wrapper, onPath: false };
	}
	return { command: `bun ${entry}`, onPath: false };
}

export {
	BOARD_SKILL,
	BUNDLED_SKILLS,
	type BundledSkill,
	type SkillDestination,
	packageRoot,
	findSkillSource,
	expandHome,
	resolveTarget,
	resolveAgent,
	resolveExplicitDir,
	countFiles,
	resolveInvocation,
};
