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
	resolveAgent,
	resolveExplicitDir,
	resolveInvocation,
	resolveTarget,
} from "@/cli/commands/lib/skill-destination";
import { applyBlock, chooseDoc, writeSetup } from "@/cli/commands/lib/repo-setup-block";

const RETIRED_SKILL_NAMES = ["excalidraw-skill"];

const InstallSkillInputSchema = z.object({
	dir: z.string().optional(),
	target: z.string().optional(),
	agent: z.string().optional(),
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
 * spelling, --doc and --no-doc exclusive, and only supported agent and target names.
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
	const agent = agentIssue(input.agent);
	if (agent !== undefined) {
		issues.push(agent);
	}
	const target = targetIssue(input.target);
	if (target !== undefined) {
		issues.push(target);
	}
	return issues;
}

/**
 * The problem with an --agent spelling, if any: a name this installer does not know.
 * @param agent - The agent spelling, if given.
 * @returns The message, or undefined when the agent is absent or supported.
 */
function agentIssue(agent: string | undefined): string | undefined {
	if (agent !== undefined && !["codex", "claude-code"].includes(agent)) {
		return `Unknown --agent ${agent}. Supported agents: codex, claude-code.`;
	}
	return undefined;
}

/**
 * The problem with a --target spelling, if any: the obsolete codex target or an unknown name.
 * @param target - The target spelling, if given.
 * @returns The message, or undefined when the target is absent or supported.
 */
function targetIssue(target: string | undefined): string | undefined {
	if (target === "codex") {
		return "--target codex is obsolete. The default install root is ~/.agents/skills; use --dir <skills-root> for a custom location.";
	}
	if (target !== undefined && !["agents", "claude"].includes(target)) {
		return `Unknown --target ${target}. Supported targets: claude. Omit --target for ~/.agents/skills, or use --dir <skills-root> for a custom location.`;
	}
	return undefined;
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
 * Whether a path exists at all, symlinks included.
 * @param candidate - The path to check.
 * @returns True when lstat succeeds.
 */
function pathExists(candidate: string): boolean {
	try {
		fs.lstatSync(candidate);
		return true;
	} catch {
		return false;
	}
}

/**
 * A rename must not leave two discoverable names for the same skill. Removes retired names
 * only after the new copy is in place, so a failed install never takes away the working
 * legacy copy first.
 * @param root - The skills root.
 * @param target - The freshly installed skill directory, which is never removed.
 * @param context - The command context that receives the diagnostics.
 */
function removeRetiredInstalls(root: string, target: string, context: CommandContext): void {
	for (const retiredName of RETIRED_SKILL_NAMES) {
		const retired = path.join(root, retiredName);
		if (retired === target || !pathExists(retired)) {
			continue;
		}
		fs.rmSync(retired, { recursive: true, force: true });
		context.diagnostic(`Removed retired install at ${retired}`);
	}
}

/**
 * Copies the skill into the root by staging into a sibling temp dir and swapping it in.
 * Replace, never overlay: stale files from older skill versions (e.g. the pre-1.1
 * scripts/*.cjs helpers) must not survive an upgrade.
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
		if (lstat) {
			fs.rmSync(target, { recursive: true, force: true });
			context.diagnostic(`Replaced existing install at ${target}`);
		}
		fs.renameSync(staging, target);
		removeRetiredInstalls(root, target, context);
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
	summary: "Install the bundled agent skill and write the setup into this repo",
	usage: [
		"install-skill [--agent codex|claude-code] [--target claude] [--dir <skills-root>]",
		"              [--print-source]",
		"              [--repo <dir>] [--vault <path>] [--doc <file>] [--no-doc] [--yes]",
	].join("\n"),
	description: "Installs the bundled skill locally and optionally records repo-specific setup.",
	examples: ["archboard install-skill --yes", "archboard install-skill --print-source"],
	parameters: [
		{
			kind: "option",
			key: "dir",
			spellings: ["--dir"],
			value: "required",
			description: "Custom skills root",
		},
		{
			kind: "option",
			key: "target",
			spellings: ["--target"],
			value: "required",
			description: "Legacy destination shortcut",
		},
		{
			kind: "option",
			key: "agent",
			spellings: ["--agent"],
			value: "required",
			description: "Skills-compatible agent",
		},
		{
			kind: "option",
			key: "printSource",
			spellings: ["--print-source"],
			value: "none",
			description: "Report the bundled source without installing",
		},
		{
			kind: "option",
			key: "repo",
			spellings: ["--repo"],
			value: "required",
			description: "Repository to configure",
		},
		{
			kind: "option",
			key: "vault",
			spellings: ["--vault"],
			value: "required",
			description: "Vault path to record",
		},
		{
			kind: "option",
			key: "doc",
			spellings: ["--doc"],
			value: "required",
			description: "Agent document to update",
		},
		{
			kind: "option",
			key: "noDoc",
			spellings: ["--no-doc"],
			value: "none",
			description: "Do not write repository setup",
		},
		{
			kind: "option",
			key: "yes",
			spellings: ["--yes"],
			value: "none",
			description: "Accept the suggested vault",
		},
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
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
				held: "none",
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
