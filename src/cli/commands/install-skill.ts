import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { defineCommand } from "@/cli/command-contract/contract";
import type { CommandContext } from "@/cli/command-contract/contract";
import {
	SKILL_NAME,
	type SkillDestination,
	countFiles,
	findSkillSource,
	packageRoot,
	resolveAgent,
	resolveExplicitDir,
	resolveInvocation,
	resolveTarget,
} from "@/cli/commands/lib/skill-destination";
import { applyBlock, chooseDoc, writeSetup } from "@/cli/commands/lib/repo-setup-block";
import { prepareSkillArtifacts } from "@/runtime/skill-distribution/index";

const INSTALL_TARGETS = ["agents", "claude"] as const;
const INSTALL_AGENTS = ["codex", "claude-code"] as const;

const InstallSkillInputSchema = z.object({
	dir: z.string().optional(),
	target: z.enum(INSTALL_TARGETS).optional(),
	agent: z.enum(INSTALL_AGENTS).optional(),
	printSource: z.boolean().default(false),
	repo: z.string().optional(),
	vault: z.string().optional(),
	doc: z.string().optional(),
	noDoc: z.boolean().default(false),
	yes: z.boolean().default(false),
	tail: z.array(z.string()).default([]),
});
type InstallSkillInput = z.infer<typeof InstallSkillInputSchema>;

/**
 * The request problems the input schema cannot express field by field: at most one destination
 * spelling and --doc and --no-doc being exclusive.
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
	if (input.noDoc && input.doc !== undefined) {
		issues.push("Use either --doc <file> or --no-doc, not both");
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
	doc: z.string(),
	docCreated: z.boolean(),
	blockUpdated: z.boolean(),
	command: z.string(),
	onPath: z.boolean(),
});
type InstallSkillSetupResult = z.infer<typeof InstallSkillSetupResultSchema>;

const InstallSkillResultSchema = z.union([
	z.object({
		success: z.literal(true),
		skill: z.literal(SKILL_NAME),
		source: z.string(),
		files: z.number().int().nonnegative(),
	}),
	z.object({
		success: z.literal(true),
		skill: z.literal(SKILL_NAME),
		mode: z.string(),
		root: z.string(),
		target: z.string(),
		files: z.number().int().nonnegative(),
		setup: InstallSkillSetupResultSchema.optional(),
	}),
]);
type InstallSkillResult = z.infer<typeof InstallSkillResultSchema>;

interface ResolvedDestination extends SkillDestination {
	/** The target spelling the repo doc choice keys on: "dir" for an explicit root. */
	docTargetSpec: string;
}

/**
 * Resolves where the skill goes from whichever destination spelling was used: --dir wins,
 * then --agent, then --target (defaulting to the agents root).
 * @param input - The validated install request.
 * @returns The destination and the target spelling the doc choice reuses.
 */
function resolveDestination(input: InstallSkillRequest): ResolvedDestination {
	if (input.dir) {
		return { ...resolveExplicitDir(input.dir), docTargetSpec: "dir" };
	}
	if (input.agent) {
		const agent = resolveAgent(input.agent);
		return { ...agent, docTargetSpec: agent.targetSpec };
	}
	const targetSpec = input.target ?? "agents";
	return { ...resolveTarget(targetSpec), docTargetSpec: targetSpec };
}

/**
 * The existing install at the target, refusing to manage a symlink somebody else placed.
 * @param target - The skill directory to replace.
 * @returns The lstat result, or undefined when nothing is there yet.
 */
function existingInstall(target: string): fs.Stats | undefined {
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
	return lstat;
}

/**
 * Copies the skill into the root by staging into a sibling temp dir and swapping it in.
 * Replace, never overlay: stale files from older skill versions (e.g. the pre-1.1
 * scripts/*.cjs helpers) must not survive an upgrade.
 *
 * The staged copy is prepared — its generated schemas and portable install
 * manual written — before anything is swapped, so a preparation that fails
 * leaves the previous install exactly as it was.
 * @param source - The bundled skill directory.
 * @param destination - The skills root and target directory.
 * @param context - The command context that receives the diagnostics.
 */
function installSkillFiles(
	source: string,
	destination: SkillDestination,
	context: CommandContext,
): void {
	const { root, target } = destination;
	const lstat = existingInstall(target);
	fs.mkdirSync(root, { recursive: true });
	const staging = fs.mkdtempSync(path.join(root, `.${SKILL_NAME}-staging-`));
	try {
		fs.cpSync(source, staging, { recursive: true });
		prepareSkillArtifacts(staging, { root: packageRoot() });
		if (lstat) {
			fs.rmSync(target, { recursive: true, force: true });
			context.diagnostic(`Replaced existing install at ${target}`);
		}
		fs.renameSync(staging, target);
	} catch (error) {
		fs.rmSync(staging, { recursive: true, force: true });
		throw error;
	}
}

/**
 * Writes the repo setup block unless --no-doc asked for the skill files alone.
 * @param input - The validated install request.
 * @param destination - Where the skill was installed.
 * @param context - The command context.
 * @returns The setup written, or undefined when skipped or refused for this checkout.
 */
async function writeRequestedSetup(
	input: InstallSkillRequest,
	destination: ResolvedDestination,
	context: CommandContext,
): Promise<InstallSkillSetupResult | undefined> {
	if (input.noDoc) {
		return undefined;
	}
	return await writeSetup({
		...(input.repo === undefined ? {} : { repoSpec: input.repo }),
		...(input.vault === undefined ? {} : { vaultSpec: input.vault }),
		...(input.doc === undefined ? {} : { docSpec: input.doc }),
		targetSpec: destination.docTargetSpec,
		skill: destination.target,
		assumeYes: input.yes,
		context,
	});
}

/**
 * Runs the install: reports the bundled source under --print-source, otherwise validates
 * the request, installs the skill files and writes the repo setup.
 * @param input - The parsed install input.
 * @param context - The command context.
 * @returns The source report or the install receipt.
 */
async function executeInstallSkill(
	input: InstallSkillInput,
	context: CommandContext,
): Promise<InstallSkillResult> {
	const source = findSkillSource();
	if (input.printSource) {
		return { success: true, skill: SKILL_NAME, source, files: countFiles(source) };
	}
	const request = context.parse(InstallSkillRequestSchema, input);
	const destination = resolveDestination(request);
	installSkillFiles(source, destination, context);
	const setup = await writeRequestedSetup(request, destination, context);
	return {
		success: true,
		skill: SKILL_NAME,
		mode: destination.mode,
		root: destination.root,
		target: destination.target,
		files: countFiles(destination.target),
		...(setup ? { setup } : {}),
	};
}

const installSkillContract = defineCommand({
	path: ["install-skill"],
	shared: [],
	summary: "Install the bundled agent skill and write the setup into this repo",
	description:
		"Copies the bundled skill into a skills root (~/.agents/skills by default), then writes the " +
		"setup an agent cannot know — the vault path and how to invoke this binary — into the " +
		"repository's CLAUDE.md or AGENTS.md between markers, replacing the block on a re-run. On a " +
		"terminal the vault is offered and asked for; --yes takes the offer.",
	examples: ["archboard install-skill --yes", "archboard install-skill --print-source"],
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
			description: "The repository whose agent instructions receive the setup block",
			default: "the working directory",
		},
		{
			kind: "option",
			key: "vault",
			spellings: ["--vault"],
			value: "required",
			placeholder: "path",
			description:
				"The vault to record; <repo>/.archboard/vault or ARCHBOARD_VAULT is offered when absent",
		},
		{
			kind: "option",
			key: "doc",
			spellings: ["--doc"],
			value: "required",
			placeholder: "file",
			description:
				"The agent document to write the setup block into; an existing CLAUDE.md, then AGENTS.md, " +
				"when absent",
		},
		{
			kind: "option",
			key: "noDoc",
			spellings: ["--no-doc"],
			value: "none",
			description: "Install the skill files and write no repository setup",
		},
		{
			kind: "option",
			key: "yes",
			spellings: ["--yes"],
			value: "none",
			description: "Take the offered vault without asking",
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
				description: "Exclusive destination, supported agent/target, and document policy",
				rules: [
					"Validate only after --print-source's fixed-base early return",
					"Choose at most one destination spelling",
					"Reject --doc with --no-doc",
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
	 * Installs the skill and, unless told not to, writes the repo setup block.
	 * @param input - The parsed install input.
	 * @param context - The command execution context.
	 * @returns The install result.
	 */
	async handler(input, context) {
		return { result: await executeInstallSkill(input, context) };
	},
});

export {
	resolveInvocation,
	chooseDoc,
	applyBlock,
	InstallSkillInputSchema,
	type InstallSkillInput,
	InstallSkillRequestSchema,
	type InstallSkillRequest,
	InstallSkillSetupResultSchema,
	type InstallSkillSetupResult,
	InstallSkillResultSchema,
	type InstallSkillResult,
	installSkillContract,
};
