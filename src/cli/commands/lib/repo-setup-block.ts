// Installing the skill is only half of setting a repo up. The other half is
// writing down what the next agent in that repo cannot discover: where the
// vault is, how to invoke the binary, and which boards cover this code. That
// lives in the repo's own CLAUDE.md or AGENTS.md, between these markers so a
// re-run replaces the block instead of appending a second copy.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { CommandContext } from "@/cli/command-contract/contract";
import { expandHome, packageRoot, resolveInvocation } from "@/cli/commands/lib/skill-destination";

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

interface SetupOptions {
	repoSpec?: string;
	vaultSpec?: string;
	docSpec?: string;
	targetSpec: string;
	skill: string;
	assumeYes: boolean;
	context: CommandContext;
}

/**
 * The git repository containing `from`, or `from` itself when there is none.
 * @param from - The directory to start from.
 * @returns The nearest ancestor holding a .git entry, else the resolved start directory.
 */
function findRepoRoot(from: string): string {
	let dir = path.resolve(from);
	for (;;) {
		if (fs.existsSync(path.join(dir, ".git"))) {
			return dir;
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			return path.resolve(from);
		}
		dir = parent;
	}
}

/**
 * Which file the next agent will actually read.
 *
 * An existing CLAUDE.md wins, then an existing AGENTS.md. Creating the other
 * one alongside is how a repo ends up with two agent docs that disagree, so it
 * never happens: a repo with neither gets the one matching the skill target.
 * @param repo - The repository root.
 * @param targetSpec - The skill target, which decides the name when neither doc exists.
 * @returns The doc path and whether it already existed.
 */
function chooseDoc(repo: string, targetSpec: string): { file: string; existed: boolean } {
	for (const name of ["CLAUDE.md", "AGENTS.md"]) {
		const candidate = path.join(repo, name);
		if (fs.existsSync(candidate)) {
			return { file: candidate, existed: true };
		}
	}
	const created = targetSpec === "claude" ? "CLAUDE.md" : "AGENTS.md";
	return { file: path.join(repo, created), existed: false };
}

/**
 * Renders the managed setup block: the environment, how to run the CLI here, and the section
 * a human fills in about which boards cover the repo.
 * @param options - What the block must tell a reader about this checkout.
 * @param options.vault - The vault path to export.
 * @param options.command - How the CLI is invoked when it is not on PATH.
 * @param options.onPath - Whether `archboard` resolves on PATH.
 * @param options.skill - Where the installed skill lives.
 * @param options.canvasUrl - The canvas URL when it is not the default.
 * @returns The block text, markers included, ending in a newline.
 */
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
	if (canvasUrl) {
		env.push(`export EXPRESS_SERVER_URL=${canvasUrl}`);
	}

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

/**
 * Replaces the managed block in place, or appends it when there is none.
 * @param existing - The current document text.
 * @param block - The rendered block.
 * @returns The document with exactly one managed block.
 */
function applyBlock(existing: string, block: string): string {
	const start = existing.indexOf(BLOCK_BEGIN);
	const end = existing.indexOf(BLOCK_END);
	if (start !== -1 && end > start) {
		const after = existing.slice(end + BLOCK_END.length).replace(/^\n/u, "");
		return existing.slice(0, start) + block + after;
	}
	if (!existing.trim()) {
		return block;
	}
	return existing.replace(/\n*$/u, "\n\n") + block;
}

/**
 * Whether git ignores a path inside the repository.
 * @param repo - The repository root.
 * @param target - The path to check.
 * @returns True when `git check-ignore` matches; false when it does not or git is unavailable.
 */
function gitIgnores(repo: string, target: string): boolean {
	try {
		execFileSync("git", ["-C", repo, "check-ignore", "-q", target], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

/**
 * Decides the vault path: --vault outright, else the suggestion under --yes, else the person
 * is asked with the suggestion offered. The suggestion is an ARCHBOARD_VAULT already in the
 * environment (somebody having answered already), else a vault local to the repo.
 * @param options - The setup options.
 * @param repo - The repository root.
 * @returns The absolute vault path.
 */
async function chooseVault(options: SetupOptions, repo: string): Promise<string> {
	if (options.vaultSpec) {
		return path.resolve(expandHome(options.vaultSpec));
	}
	const fromEnvironment = process.env["ARCHBOARD_VAULT"];
	const suggested = fromEnvironment
		? path.resolve(fromEnvironment)
		: path.join(repo, LOCAL_VAULT_DIR);
	if (options.assumeYes) {
		return suggested;
	}
	const answer = await options.context.prompt(
		"Where should this repo keep its boards? (an Obsidian vault, shared or local)",
		suggested,
	);
	return path.resolve(expandHome(answer));
}

/**
 * Decides which agent document receives the block: --doc as given, else the repo's own.
 * @param options - The setup options.
 * @param repo - The repository root.
 * @returns The doc path and whether it already existed.
 */
function chooseSetupDoc(options: SetupOptions, repo: string): { file: string; existed: boolean } {
	if (options.docSpec) {
		const file = path.resolve(expandHome(options.docSpec));
		return { file, existed: fs.existsSync(file) };
	}
	return chooseDoc(repo, options.targetSpec);
}

/**
 * A canvas on a non-default URL is part of the environment too, and the one thing a fresh
 * agent has no way of guessing.
 * @returns The configured canvas URL when it differs from the default, else undefined.
 */
function canvasUrlOverride(): string | undefined {
	const configured = process.env["EXPRESS_SERVER_URL"];
	return configured && configured !== DEFAULT_CANVAS_URL ? configured : undefined;
}

/**
 * Tells the person what was written and what is left for them: the doc, the vault, a vault
 * inside the repo that git does not ignore, and the section to fill in.
 * @param options - The setup options.
 * @param result - The setup that was written.
 */
function reportSetup(options: SetupOptions, result: SetupResult): void {
	const { context } = options;
	context.diagnostic(
		`${result.blockUpdated ? "Updated" : "Wrote"} the archboard setup in ${result.doc}`,
	);
	context.diagnostic(`Boards for this repo: ${result.vault}`);
	const inRepo = result.vault.startsWith(result.repo + path.sep);
	if (inRepo && !result.vaultIgnored) {
		context.diagnostic(
			`That vault is inside the repo and not ignored, so boards will show up in git status. Commit them, or add ${path.relative(result.repo, result.vault)}/ to .gitignore.`,
		);
	}
	context.diagnostic(
		`Now fill in "Boards for this repo" in ${path.basename(result.doc)}: which board covers this code, and any gotcha an agent cannot read off the source.`,
	);
}

/**
 * Write the setup into the repo's own agent doc.
 *
 * Everything an agent needs beyond the skill is machine-specific: the vault
 * path, whether the binary is on PATH, which boards cover this code. Left in
 * the installing human's head it is invisible, so it goes in the file the next
 * agent reads before it does anything else.
 * @param options - Which repo, vault and doc to use, the installed skill path, and the context.
 * @returns What was written, or undefined when the repo is the archboard checkout itself.
 */
async function writeSetup(options: SetupOptions): Promise<SetupResult | undefined> {
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

	const vault = await chooseVault(options, repo);
	const vaultCreated = !fs.existsSync(vault);
	fs.mkdirSync(vault, { recursive: true });

	const chosen = chooseSetupDoc(options, repo);
	const existing = chosen.existed ? fs.readFileSync(chosen.file, "utf-8") : "";
	const blockUpdated = existing.includes(BLOCK_BEGIN);
	const { command, onPath } = resolveInvocation();
	const canvasUrl = canvasUrlOverride();
	const block = renderBlock({
		vault,
		command,
		onPath,
		skill: options.skill,
		...(canvasUrl === undefined ? {} : { canvasUrl }),
	});

	fs.mkdirSync(path.dirname(chosen.file), { recursive: true });
	fs.writeFileSync(chosen.file, applyBlock(existing, block), "utf-8");

	const result: SetupResult = {
		repo,
		vault,
		vaultCreated,
		vaultIgnored: gitIgnores(repo, vault),
		doc: chosen.file,
		docCreated: !chosen.existed,
		blockUpdated,
		command,
		onPath,
	};
	reportSetup(options, result);
	return result;
}

export { type SetupResult, type SetupOptions, chooseDoc, applyBlock, writeSetup };
