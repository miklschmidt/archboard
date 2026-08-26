import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { z } from "zod";
import { CliUsageError, defineCommand, type CommandContext } from "../command-contract/contract.js";

const SKILL_NAME = "archboard";
const RETIRED_SKILL_NAMES = ["excalidraw-skill"];

// Installing the skill is only half of setting a repo up. The other half is
// writing down what the next agent in that repo cannot discover: where the
// vault is, how to invoke the binary, and which boards cover this code. That
// lives in the repo's own CLAUDE.md or AGENTS.md, between these markers so a
// re-run replaces the block instead of appending a second copy.
const BLOCK_BEGIN = "<!-- archboard:begin -->";
const BLOCK_END = "<!-- archboard:end -->";

// The assumed vault when nobody says otherwise: local to the repo being set
// up. A cross-repo vault is still the better answer for a diagram whose boxes
// span five checkouts, but it is the answer somebody has to choose, and the
// cost of guessing wrong here is a directory nobody used.
const LOCAL_VAULT_DIR = path.join(".archboard", "vault");

// Matches the default in core/config.ts. Only a URL that differs from it is
// worth writing down, because only then is it something an agent cannot guess.
const DEFAULT_CANVAS_URL = "http://127.0.0.1:3000";

// The checkout layout is <root>/{src,skills,bin,...}; this module lives at
// src/cli/commands/, so the root is three levels up. Resolving relative to the
// module path keeps this working from any cwd.
function packageRoot(): string {
	return fileURLToPath(new URL("../../..", import.meta.url));
}

function findSkillSource(): string {
	const source = path.join(packageRoot(), "skills", SKILL_NAME);
	if (!fs.existsSync(path.join(source, "SKILL.md"))) {
		throw new Error(`Bundled skill not found at ${source} (broken install?)`);
	}
	return source;
}

function expandHome(input: string): string {
	if (input === "~") return os.homedir();
	if (input.startsWith(`~${path.sep}`)) return path.join(os.homedir(), input.slice(2));
	return input;
}

function resolveSkillsRoot(target: string): string {
	if (target === "agents") return path.join(os.homedir(), ".agents", "skills");
	if (target === "claude") return path.join(os.homedir(), ".claude", "skills");
	if (target === "codex") {
		throw new CliUsageError(
			"--target codex is obsolete. The default install root is ~/.agents/skills; use --dir <skills-root> for a custom location.",
		);
	}
	throw new CliUsageError(
		`Unknown --target ${target}. Supported targets: claude. Omit --target for ~/.agents/skills, or use --dir <skills-root> for a custom location.`,
	);
}

function resolveTarget(target: string): { root: string; target: string; mode: string } {
	const root = resolveSkillsRoot(target);
	return { root, target: path.join(root, SKILL_NAME), mode: `target:${target}` };
}

function resolveAgent(agent: string): {
	root: string;
	target: string;
	mode: string;
	targetSpec: string;
} {
	const targetSpec = agent === "codex" ? "agents" : agent === "claude-code" ? "claude" : undefined;
	if (!targetSpec) {
		throw new CliUsageError(`Unknown --agent ${agent}. Supported agents: codex, claude-code.`);
	}
	const resolved = resolveTarget(targetSpec);
	return { ...resolved, mode: `agent:${agent}`, targetSpec };
}

function countFiles(dir: string): number {
	let count = 0;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name));
		else count++;
	}
	return count;
}

function realpathOrNull(candidate: string): string | null {
	try {
		return fs.realpathSync(candidate);
	} catch {
		return null;
	}
}

/**
 * How the next agent should type "archboard".
 *
 * The skill's every example says `archboard`, which is a lie in any repo where
 * nobody linked it onto PATH. So check: an `archboard` on PATH counts only
 * when it actually resolves to this build. Otherwise return the absolute
 * path of the entry point that is running right now, which always works.
 */
export function resolveInvocation(): { command: string; onPath: boolean } {
	const root = packageRoot();
	const wrapper = path.join(root, "bin", "canvas");
	const entry = path.join(root, "src", "bin.ts");
	const ours = new Set(
		[wrapper, entry].map(realpathOrNull).filter((value): value is string => value !== null),
	);

	for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
		if (!dir) continue;
		const resolved = realpathOrNull(path.join(dir, "archboard"));
		if (resolved && ours.has(resolved)) return { command: "archboard", onPath: true };
	}

	if (fs.existsSync(wrapper)) return { command: wrapper, onPath: false };
	return { command: `bun ${entry}`, onPath: false };
}

/** The git repository containing `from`, or `from` itself when there is none. */
function findRepoRoot(from: string): string {
	let dir = path.resolve(from);
	for (;;) {
		if (fs.existsSync(path.join(dir, ".git"))) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) return path.resolve(from);
		dir = parent;
	}
}

/**
 * Which file the next agent will actually read.
 *
 * An existing CLAUDE.md wins, then an existing AGENTS.md. Creating the other
 * one alongside is how a repo ends up with two agent docs that disagree, so it
 * never happens: a repo with neither gets the one matching the skill target.
 */
export function chooseDoc(repo: string, targetSpec: string): { file: string; existed: boolean } {
	for (const name of ["CLAUDE.md", "AGENTS.md"]) {
		const candidate = path.join(repo, name);
		if (fs.existsSync(candidate)) return { file: candidate, existed: true };
	}
	const created = targetSpec === "claude" ? "CLAUDE.md" : "AGENTS.md";
	return { file: path.join(repo, created), existed: false };
}

function renderBlock(options: {
	vault: string;
	command: string;
	onPath: boolean;
	skill: string;
	canvasUrl?: string;
}): string {
	const { vault, command, onPath, skill, canvasUrl } = options;
	const cli = onPath ? "archboard" : command;
	const env = [`export ARCHBOARD_VAULT=${vault}`];
	if (canvasUrl) env.push(`export EXPRESS_SERVER_URL=${canvasUrl}`);

	return [
		BLOCK_BEGIN,
		"<!-- Written by `archboard install-skill`. Re-running replaces this block, so keep",
		'     your own notes under "Boards for this repo" and they will survive. -->',
		"## Architecture canvas (archboard)",
		"",
		"Architecture diagrams for this repo live on an archboard canvas: a live",
		"Excalidraw board an agent draws on and a human rearranges. The commands are in",
		`the \`archboard\` skill at \`${skill}\`. Below is the part of the setup that`,
		"only this machine knows.",
		"",
		"### Environment",
		"",
		"Boards are `.excalidraw.md` notes in an Obsidian vault. This repo uses:",
		"",
		"```bash",
		...env,
		"```",
		"",
		"Every archboard command needs that in its environment, and so does the canvas",
		"server, which is what does the vault I/O. If your shell does not carry",
		"variables from one command to the next, prefix each command instead:",
		"",
		"```bash",
		`ARCHBOARD_VAULT=${vault} ${cli} board list`,
		"```",
		"",
		"The server keeps the vault it was started with. `board list` prints the vault",
		`in use. If that is not the one above, run \`${cli} stop\` and try again with the`,
		"variable set.",
		"",
		"### Running the CLI",
		"",
		onPath
			? "The CLI is on PATH as `archboard`, which is the name the skill uses."
			: `The CLI is not on PATH here, so \`archboard\` will not resolve. Use the absolute\npath wherever the skill says \`archboard\`:`,
		"",
		"```bash",
		`${cli} status`,
		"```",
		"",
		"archboard runs its TypeScript directly, so bun has to be on PATH for any of",
		"this to work.",
		"",
		`The canvas server starts on the first command and serves ${canvasUrl ?? "http://127.0.0.1:3000"}.`,
		"Open that in a browser to watch, or to let a human move things. Drawing,",
		"reading and saving a board all work without one; screenshots and image export",
		"do not.",
		"",
		"### Boards for this repo",
		"",
		"Fill this in. Nothing links a repo to its boards automatically, so an agent",
		"that finds nothing here has to ask.",
		"",
		"- Boards: none recorded yet. Make one with",
		`  \`${cli} board new <name> --level service\`, draw on it, then`,
		`  \`${cli} board save --board <name>\`.`,
		"- Level vocabulary: `system`, `service`, `module`, unless this project says",
		"  otherwise here.",
		"- Conventions and gotchas an agent cannot read off the source: none recorded yet.",
		BLOCK_END,
		"",
	].join("\n");
}

/** Replace the managed block in place, or append it when there is none. */
export function applyBlock(existing: string, block: string): string {
	const start = existing.indexOf(BLOCK_BEGIN);
	const end = existing.indexOf(BLOCK_END);
	if (start !== -1 && end > start) {
		const after = existing.slice(end + BLOCK_END.length).replace(/^\n/, "");
		return existing.slice(0, start) + block + after;
	}
	if (!existing.trim()) return block;
	return existing.replace(/\n*$/, "\n\n") + block;
}

function gitIgnores(repo: string, target: string): boolean {
	try {
		execFileSync("git", ["-C", repo, "check-ignore", "-q", target], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

export const InstallSkillInputSchema = z.object({
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
export type InstallSkillInput = z.infer<typeof InstallSkillInputSchema>;

export const InstallSkillSetupResultSchema = z.object({
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
export type InstallSkillSetupResult = z.infer<typeof InstallSkillSetupResultSchema>;

export const InstallSkillResultSchema = z.union([
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
export type InstallSkillResult = z.infer<typeof InstallSkillResultSchema>;

async function executeInstallSkill(
	input: InstallSkillInput,
	context: CommandContext,
): Promise<InstallSkillResult> {
	const source = findSkillSource();

	if (input.printSource) {
		return {
			success: true,
			skill: SKILL_NAME,
			source,
			files: countFiles(source),
		};
	}

	const destinations = [input.dir, input.target, input.agent].filter(
		(value) => value !== undefined,
	);
	if (destinations.length > 1) {
		throw new CliUsageError(
			"Use only one of --dir <skills-root>, --agent <agent>, or --target claude",
		);
	}
	if (input.noDoc && input.doc !== undefined) {
		throw new CliUsageError("Use either --doc <file> or --no-doc, not both");
	}

	const explicitDir = input.dir;
	const agentSpec = input.agent;
	const targetSpec = input.target ?? "agents";
	const explicitRoot = explicitDir ? path.resolve(expandHome(explicitDir)) : undefined;
	const agentTarget = agentSpec ? resolveAgent(agentSpec) : undefined;
	const resolved = explicitRoot
		? { root: explicitRoot, target: path.join(explicitRoot, SKILL_NAME), mode: "dir" }
		: (agentTarget ?? resolveTarget(targetSpec));
	const { root, target, mode } = resolved;

	// Replace, never overlay: stale files from older skill versions (e.g. the
	// pre-1.1 scripts/*.cjs helpers) must not survive an upgrade.
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

	// Stage into a sibling temp dir, then swap
	fs.mkdirSync(root, { recursive: true });
	const staging = fs.mkdtempSync(path.join(root, `.${SKILL_NAME}-staging-`));

	try {
		fs.cpSync(source, staging, { recursive: true });
		if (lstat) {
			fs.rmSync(target, { recursive: true, force: true });
			context.diagnostic(`Replaced existing install at ${target}`);
		}
		fs.renameSync(staging, target);

		// A rename must not leave two discoverable names for the same skill.
		// Remove these only after the new copy is in place, so a failed install
		// never takes away the working legacy copy first.
		for (const retiredName of RETIRED_SKILL_NAMES) {
			const retired = path.join(root, retiredName);
			let retiredExists = false;
			try {
				fs.lstatSync(retired);
				retiredExists = true;
			} catch {
				/* retired install does not exist */
			}
			if (retired === target || !retiredExists) continue;
			fs.rmSync(retired, { recursive: true, force: true });
			context.diagnostic(`Removed retired install at ${retired}`);
		}
	} catch (error) {
		fs.rmSync(staging, { recursive: true, force: true });
		throw error;
	}

	const setup = input.noDoc
		? undefined
		: await writeSetup({
				repoSpec: input.repo,
				vaultSpec: input.vault,
				docSpec: input.doc,
				targetSpec: explicitRoot ? "dir" : (agentTarget?.targetSpec ?? targetSpec),
				skill: target,
				assumeYes: input.yes,
				context,
			});

	return {
		success: true,
		skill: SKILL_NAME,
		mode,
		root,
		target,
		files: countFiles(target),
		...(setup ? { setup } : {}),
	};
}

interface SetupResult {
	repo: string;
	vault: string;
	vaultCreated: boolean;
	vaultIgnored: boolean;
	doc: string;
	docCreated: boolean;
	blockUpdated: boolean;
	command: string;
	onPath: boolean;
}

/**
 * Write the setup into the repo's own agent doc.
 *
 * Everything an agent needs beyond the skill is machine-specific: the vault
 * path, whether the binary is on PATH, which boards cover this code. Left in
 * the installing human's head it is invisible, so it goes in the file the next
 * agent reads before it does anything else.
 */
async function writeSetup(options: {
	repoSpec?: string;
	vaultSpec?: string;
	docSpec?: string;
	targetSpec: string;
	skill: string;
	assumeYes: boolean;
	context: CommandContext;
}): Promise<SetupResult | undefined> {
	const repo = options.repoSpec
		? path.resolve(expandHome(options.repoSpec))
		: findRepoRoot(process.cwd());

	// Installing from inside the archboard checkout is a maintainer re-running
	// the command, not a repo being set up. Its CLAUDE.md is authored, and a
	// generated block does not belong in it.
	if (path.resolve(repo) === path.resolve(packageRoot())) {
		options.context.diagnostic(
			"This is the archboard checkout itself, so no setup block was written. Point --repo at the repository you want to set up.",
		);
		return undefined;
	}

	// A vault local to the repo is the assumed answer; an ARCHBOARD_VAULT
	// already in the environment is somebody having answered already.
	const suggested = process.env.ARCHBOARD_VAULT
		? path.resolve(process.env.ARCHBOARD_VAULT)
		: path.join(repo, LOCAL_VAULT_DIR);
	const vault = options.vaultSpec
		? path.resolve(expandHome(options.vaultSpec))
		: options.assumeYes
			? suggested
			: path.resolve(
					expandHome(
						await options.context.prompt(
							"Where should this repo keep its boards? (an Obsidian vault, shared or local)",
							suggested,
						),
					),
				);

	const vaultCreated = !fs.existsSync(vault);
	fs.mkdirSync(vault, { recursive: true });

	const chosen = options.docSpec
		? {
				file: path.resolve(expandHome(options.docSpec)),
				existed: fs.existsSync(path.resolve(expandHome(options.docSpec))),
			}
		: chooseDoc(repo, options.targetSpec);

	const existing = chosen.existed ? fs.readFileSync(chosen.file, "utf-8") : "";
	const blockUpdated = existing.includes(BLOCK_BEGIN);
	const { command, onPath } = resolveInvocation();
	// A canvas on a non-default URL is part of the environment too, and the one
	// thing a fresh agent has no way of guessing.
	const canvasUrl =
		process.env.EXPRESS_SERVER_URL && process.env.EXPRESS_SERVER_URL !== DEFAULT_CANVAS_URL
			? process.env.EXPRESS_SERVER_URL
			: undefined;
	const block = renderBlock({ vault, command, onPath, skill: options.skill, canvasUrl });

	fs.mkdirSync(path.dirname(chosen.file), { recursive: true });
	fs.writeFileSync(chosen.file, applyBlock(existing, block), "utf-8");

	const inRepo = vault.startsWith(repo + path.sep);
	const ignored = gitIgnores(repo, vault);

	options.context.diagnostic(
		`${blockUpdated ? "Updated" : "Wrote"} the archboard setup in ${chosen.file}`,
	);
	options.context.diagnostic(`Boards for this repo: ${vault}`);
	if (inRepo && !ignored) {
		options.context.diagnostic(
			`That vault is inside the repo and not ignored, so boards will show up in git status. Commit them, or add ${path.relative(repo, vault)}/ to .gitignore.`,
		);
	}
	options.context.diagnostic(
		`Now fill in "Boards for this repo" in ${path.basename(chosen.file)}: which board covers this code, and any gotcha an agent cannot read off the source.`,
	);

	return {
		repo,
		vault,
		vaultCreated,
		vaultIgnored: ignored,
		doc: chosen.file,
		docCreated: !chosen.existed,
		blockUpdated,
		command,
		onPath,
	};
}

export const installSkillContract = defineCommand({
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
	input: { ingress: InstallSkillInputSchema },
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
		select: () => "json",
	},
	prerequisites: [],
	effects: ["local-read", "local-write"],
	refusals: [],
	relationships: [],
	async handler(input, context) {
		return { result: await executeInstallSkill(input, context) };
	},
});
