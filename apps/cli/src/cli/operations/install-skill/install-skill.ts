import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import type { CommandContext } from "#cli/protocol/contract/contract.ts";
import {
	CONSUMER_SKILL,
	BUNDLED_SKILLS,
	type BundledSkill,
	type SkillDestination,
	countFiles,
	expandHome,
	findSkillSource,
	resolveAgent,
	resolveExplicitDir,
	resolveTarget,
} from "#cli/operations/install-skill/skill-destination.ts";
import { checkoutRootOf, setUpRepository } from "#cli/operations/install-skill/repo-setup.ts";
import { prepareSkillArtifacts } from "@archboard/skills/distribution";
import { SOURCE_CHECKOUT } from "@archboard/workspace/source-checkout";

const INSTALL_TARGETS = ["agents", "claude"] as const;
const INSTALL_AGENTS = ["codex", "claude-code"] as const;

const InstallSkillInputSchema = z.object({
	dir: z.string().optional(),
	target: z.enum(INSTALL_TARGETS).optional(),
	agent: z.enum(INSTALL_AGENTS).optional(),
	printSource: z.boolean().default(false),
	repo: z.string().optional(),
	noSetup: z.boolean().default(false),
	tail: z.array(z.string()).default([]),
});
type InstallSkillInput = z.infer<typeof InstallSkillInputSchema>;

/**
 * The request problems the input schema cannot express field by field: at most one destination
 * spelling.
 * @param input - The parsed install input.
 * @returns One message per problem found, in check order.
 */
function installRequestIssues(input: InstallSkillInput): string[] {
	const issues: string[] = [];
	const destinations = [input.dir, input.target, input.agent].filter(
		(value) => value !== undefined,
	);
	if (destinations.length > 1) {
		issues.push("Use only one of --dir <skills-root>, --agent <agent>, or --target claude");
	}
	return issues;
}

const InstallSkillRequestSchema = InstallSkillInputSchema.superRefine((input, context) => {
	for (const message of installRequestIssues(input)) {
		context.addIssue({ code: "custom", message });
	}
});
type InstallSkillRequest = z.infer<typeof InstallSkillRequestSchema>;

const InstallSkillSetupResultSchema = z.object({
	repo: z.string(),
	vault: z.string(),
	vaultCreated: z.boolean(),
	vaultIgnored: z.boolean(),
	removedBlocks: z.array(z.string()),
});

const SkillFilesSchema = z.number().int().nonnegative();

const InstallSkillResultSchema = z.union([
	z.object({
		success: z.literal(true),
		skills: z.array(
			z.object({ skill: z.enum(BUNDLED_SKILLS), source: z.string(), files: SkillFilesSchema }),
		),
	}),
	z.object({
		success: z.literal(true),
		mode: z.string(),
		root: z.string(),
		install: z.enum(["link", "copy"]),
		skills: z.array(
			z.object({ skill: z.enum(BUNDLED_SKILLS), target: z.string(), files: SkillFilesSchema }),
		),
		setup: InstallSkillSetupResultSchema.optional(),
	}),
]);
type InstallSkillResult = z.infer<typeof InstallSkillResultSchema>;

/**
 * Resolves where the skills go from whichever destination spelling was used: --dir wins,
 * then --agent, then --target (defaulting to the agents root).
 * @param input - The validated install request.
 * @returns The destination.
 */
function resolveDestination(input: InstallSkillRequest): SkillDestination {
	if (input.dir) {
		return resolveExplicitDir(input.dir);
	}
	if (input.agent) {
		return resolveAgent(input.agent);
	}
	return resolveTarget(input.target ?? "agents");
}

/**
 * The existing install at a copy's target, refusing to manage a symlink somebody else placed.
 * @param target - The skill directory to replace.
 * @returns Whether something is there to replace.
 */
function existingCopy(target: string): boolean {
	const lstat = fs.lstatSync(target, { throwIfNoEntry: false });
	if (lstat?.isSymbolicLink()) {
		throw new Error(
			`${target} is a symlink; refusing to replace it. Remove it manually if you want the CLI to manage this install.`,
		);
	}
	return lstat !== undefined;
}

/** One bundled skill on its way into the skills root. */
interface PlannedSkill {
	skill: BundledSkill;
	source: string;
	target: string;
	replaces: boolean;
}

/**
 * Copies one skill into its staging directory, prepared the way an install carries it: the
 * model skill also gets its generated schemas and portable install manual.
 * @param plan - The skill to stage.
 * @param staging - The empty staging directory beside its target.
 */
function stageSkill(plan: PlannedSkill, staging: string): void {
	fs.cpSync(plan.source, staging, { recursive: true });
	if (plan.skill === CONSUMER_SKILL) {
		prepareSkillArtifacts(staging, { root: SOURCE_CHECKOUT });
	}
}

/**
 * Swaps one staged skill in for whatever was installed at its target.
 * @param plan - The skill being installed.
 * @param staging - Its prepared staging directory.
 * @param context - The command context that receives the diagnostics.
 */
function swapIn(plan: PlannedSkill, staging: string, context: CommandContext): void {
	if (plan.replaces) {
		fs.rmSync(plan.target, { recursive: true, force: true });
		context.diagnostic(`Replaced existing install at ${plan.target}`);
	}
	fs.renameSync(staging, plan.target);
}

/**
 * Copies every bundled skill into the root by staging each into a sibling temp dir and
 * swapping them in. Replace, never overlay: stale files from older skill versions (e.g. the
 * pre-1.1 scripts/*.cjs helpers) must not survive an upgrade.
 *
 * Every skill is staged and prepared before anything is swapped, so a symlink in the way or
 * a staging that fails leaves every previous install exactly as it was.
 * @param root - The skills root.
 * @param context - The command context that receives the diagnostics.
 * @returns Each installed skill and its directory.
 */
function copySkills(
	root: string,
	context: CommandContext,
): { skill: BundledSkill; target: string }[] {
	const planned = BUNDLED_SKILLS.map((skill): PlannedSkill => {
		const target = path.join(root, skill);
		return { skill, source: findSkillSource(skill), target, replaces: existingCopy(target) };
	});
	fs.mkdirSync(root, { recursive: true });
	const staged: { plan: PlannedSkill; staging: string }[] = [];
	try {
		for (const plan of planned) {
			const staging = fs.mkdtempSync(path.join(root, `.${plan.skill}-staging-`));
			staged.push({ plan, staging });
			stageSkill(plan, staging);
		}
		for (const { plan, staging } of staged) {
			swapIn(plan, staging, context);
		}
	} catch (error) {
		for (const { staging } of staged) {
			fs.rmSync(staging, { recursive: true, force: true });
		}
		throw error;
	}
	return planned.map(({ skill, target }) => ({ skill, target }));
}

/**
 * What is installed at a skill directory of the root, as a diagnostic names it.
 * @param target - The skill directory in the skills root.
 * @returns "a copy", "a link to <place>", or undefined when nothing is there.
 */
function existingInstall(target: string): string | undefined {
	const lstat = fs.lstatSync(target, { throwIfNoEntry: false });
	if (!lstat) return undefined;
	return lstat.isSymbolicLink() ? `a link to ${fs.readlinkSync(target)}` : "a copy";
}

/**
 * Points one skill directory of the root at its source in this checkout. A link that already
 * points there stays; a copy or a link to another place is replaced, and the diagnostic names it.
 * @param source - The skill directory in this checkout.
 * @param target - The skill directory in the skills root.
 * @param context - The command context that receives the diagnostics.
 */
function linkSkill(source: string, target: string, context: CommandContext): void {
	const was = existingInstall(target);
	if (was === `a link to ${source}`) return;
	const staging = path.join(path.dirname(target), `.${path.basename(target)}-link-${process.pid}`);
	fs.rmSync(staging, { force: true });
	fs.symlinkSync(source, staging, "dir");
	if (was !== undefined) {
		fs.rmSync(target, { recursive: true, force: true });
		context.diagnostic(`Replaced ${was} at ${target} with a link to ${source}`);
	}
	fs.renameSync(staging, target);
}

/**
 * Links every bundled skill in the root to its directory in this checkout, so a `git pull` and
 * `bun install` keep it current with no further step. The consumer skill's generated files are
 * prepared in the checkout, where the link finds them.
 * @param root - The skills root.
 * @param context - The command context that receives the diagnostics.
 * @returns Each installed skill and its link.
 */
function linkSkills(
	root: string,
	context: CommandContext,
): { skill: BundledSkill; target: string }[] {
	prepareSkillArtifacts(findSkillSource(CONSUMER_SKILL), { root: SOURCE_CHECKOUT });
	fs.mkdirSync(root, { recursive: true });
	return BUNDLED_SKILLS.map((skill) => {
		const target = path.join(root, skill);
		linkSkill(findSkillSource(skill), target, context);
		return { skill, target };
	});
}

/**
 * Whether a path is a directory or lies below it.
 * @param child - The path to test.
 * @param parent - The directory.
 * @returns True when the path is inside the directory.
 */
function isInside(child: string, parent: string): boolean {
	const relative = path.relative(parent, child);
	return !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Installs the skills into the destination. A skills root inside the repository is committed
 * with it and read on other machines, so it gets a copy. Every other root is this machine's own,
 * so it links to this checkout.
 * @param request - The validated install request.
 * @param destination - Where the skills go.
 * @param context - The command context that receives the diagnostics.
 * @returns How the skills were installed, and each skill with its directory and file count.
 */
function installSkills(
	request: InstallSkillRequest,
	destination: SkillDestination,
	context: CommandContext,
): { install: "link" | "copy"; skills: { skill: BundledSkill; target: string; files: number }[] } {
	const repo = checkoutRootOf(expandHome(request.repo ?? process.cwd()));
	const install = request.dir !== undefined && isInside(destination.root, repo) ? "copy" : "link";
	const installed =
		install === "copy"
			? copySkills(destination.root, context)
			: linkSkills(destination.root, context);
	return {
		install,
		skills: installed.map((entry) => ({ ...entry, files: countFiles(entry.target) })),
	};
}

/**
 * Runs the install: reports the bundled source under --print-source, otherwise validates
 * the request, installs the skill files and sets the repository up.
 * @param input - The parsed install input.
 * @param context - The command context.
 * @returns The source report or the install receipt.
 */
async function executeInstallSkill(
	input: InstallSkillInput,
	context: CommandContext,
): Promise<InstallSkillResult> {
	if (input.printSource) {
		return {
			success: true,
			skills: BUNDLED_SKILLS.map((skill) => {
				const source = findSkillSource(skill);
				return { skill, source, files: countFiles(source) };
			}),
		};
	}
	const request = context.parse(InstallSkillRequestSchema, input);
	const destination = resolveDestination(request);
	const { install, skills } = installSkills(request, destination, context);
	const setup = request.noSetup
		? undefined
		: await setUpRepository({
				...(request.repo === undefined ? {} : { repoSpec: request.repo }),
				context,
			});
	return {
		success: true,
		mode: destination.mode,
		root: destination.root,
		install,
		skills,
		...(setup ? { setup } : {}),
	};
}

const installSkillContract = defineCommand({
	path: ["install-skill"],
	shared: [],
	summary: "Install the bundled agent skills and set this repository up",
	description:
		"Links the bundled skills from a skills root (~/.agents/skills by default) to this checkout, " +
		"so that a git pull updates them. A --dir inside the repository gets a copy instead, because " +
		"the repository carries it to other machines. Then the installer makes the " +
		"repository's vault, <repo>/.archboard/vault, when it has none, and registers the repository " +
		"so that a browser lists it. A command run in the repository finds that vault without any " +
		"setting, so nothing is written into CLAUDE.md or AGENTS.md. A block that an earlier version wrote there is removed, and nothing else in the " +
		"file changes.",
	examples: ["archboard install-skill", "archboard install-skill --print-source"],
	parameters: [
		{
			kind: "option",
			key: "dir",
			spellings: ["--dir"],
			value: "required",
			placeholder: "skills-root",
			description: "A custom skills root; one destination spelling at most",
		},
		{
			kind: "option",
			key: "target",
			spellings: ["--target"],
			value: "required",
			placeholder: "target",
			choices: INSTALL_TARGETS,
			default: "agents",
			description:
				"A destination shortcut: claude installs to ~/.claude/skills, agents to ~/.agents/skills",
		},
		{
			kind: "option",
			key: "agent",
			spellings: ["--agent"],
			value: "required",
			placeholder: "agent",
			choices: INSTALL_AGENTS,
			description: "A skills.sh-compatible agent whose root to install into: codex or claude-code",
		},
		{
			kind: "option",
			key: "printSource",
			spellings: ["--print-source"],
			value: "none",
			description: "Report the bundled source without installing anything",
		},
		{
			kind: "option",
			key: "repo",
			spellings: ["--repo"],
			value: "required",
			placeholder: "dir",
			description: "The repository to make a vault in",
			default: "the git checkout that holds the working directory, else the working directory",
		},
		{
			kind: "option",
			key: "noSetup",
			spellings: ["--no-setup"],
			value: "none",
			description: "Install the skill files and leave the repository alone",
		},
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			hidden: true,
			description: "Legacy ignored positional content",
		},
	],
	input: {
		ingress: InstallSkillInputSchema,
		stages: [
			{
				name: "install-request",
				when: "before-server",
				description: "Exclusive destination and supported agent/target",
				rules: [
					"Validate only after --print-source's fixed-base early return",
					"Choose at most one destination spelling",
				],
				schema: InstallSkillRequestSchema,
			},
		],
	},
	result: InstallSkillResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "Installed source or destination details",
			},
		],
		/**
		 * Install-skill has one output shape.
		 * @returns The JSON case id.
		 */
		select: () => "json",
	},
	prerequisites: [],
	effects: ["local-read", "local-write"],
	refusals: [],
	relationships: [],
	/**
	 * Installs the skills and, unless told not to, sets the repository up.
	 * @param input - The parsed install input.
	 * @param context - The command execution context.
	 * @returns The install result.
	 */
	async handler(input, context) {
		return { result: await executeInstallSkill(input, context) };
	},
});

export { installSkillContract };
