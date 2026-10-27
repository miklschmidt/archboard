import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import type { CommandContext } from "#cli/protocol/contract/contract.ts";
import {
	BOARD_SKILL,
	BUNDLED_SKILLS,
	type BundledSkill,
	type SkillDestination,
	countFiles,
	findSkillSource,
	resolveAgent,
	resolveExplicitDir,
	resolveTarget,
} from "#cli/operations/install-skill/skill-destination.ts";
import { setUpRepository, withoutOldBlock } from "#cli/operations/install-skill/repo-setup.ts";
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
type InstallSkillSetupResult = z.infer<typeof InstallSkillSetupResultSchema>;

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
 * The existing install at the target, refusing to manage a symlink somebody else placed.
 * @param target - The skill directory to replace.
 * @returns Whether something is there to replace.
 */
function existingInstall(target: string): boolean {
	let lstat: fs.Stats | undefined;
	try {
		lstat = fs.lstatSync(target);
	} catch {
		/* target does not exist yet */
	}
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
 * board skill also gets its generated schemas and portable install manual.
 * @param plan - The skill to stage.
 * @param staging - The empty staging directory beside its target.
 */
function stageSkill(plan: PlannedSkill, staging: string): void {
	fs.cpSync(plan.source, staging, { recursive: true });
	if (plan.skill === BOARD_SKILL) {
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
 * @returns Each installed skill, its directory and how many files it holds.
 */
function installSkillFiles(
	root: string,
	context: CommandContext,
): { skill: BundledSkill; target: string; files: number }[] {
	const planned = BUNDLED_SKILLS.map((skill): PlannedSkill => {
		const target = path.join(root, skill);
		return { skill, source: findSkillSource(skill), target, replaces: existingInstall(target) };
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
	return planned.map(({ skill, target }) => ({ skill, target, files: countFiles(target) }));
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
	const skills = installSkillFiles(destination.root, context);
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
		skills,
		...(setup ? { setup } : {}),
	};
}

const installSkillContract = defineCommand({
	path: ["install-skill"],
	shared: [],
	summary: "Install the bundled agent skills and set this repository up",
	description:
		"Copies the bundled skills into a skills root (~/.agents/skills by default), then makes the " +
		"repository's vault, <repo>/.archboard/vault, when it has none. A command run in the " +
		"repository finds that vault without any setting, so nothing is written into CLAUDE.md or " +
		"AGENTS.md. A block that an earlier version wrote there is removed, and nothing else in the " +
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

export {
	BUNDLED_SKILLS,
	InstallSkillInputSchema,
	type InstallSkillInput,
	InstallSkillRequestSchema,
	type InstallSkillRequest,
	InstallSkillSetupResultSchema,
	type InstallSkillSetupResult,
	InstallSkillResultSchema,
	type InstallSkillResult,
	installSkillContract,
	withoutOldBlock,
};
