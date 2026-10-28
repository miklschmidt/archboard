// Installing the skills is only half of setting a repository up. The other half
// is its vault: `<root>/.archboard/vault`, where a command run in the repository
// finds it (ADR 0049). Nothing else is written into the repository. Earlier
// versions also wrote a block into the repository's CLAUDE.md or AGENTS.md,
// between markers, that held paths of the machine that ran the installer. A
// rerun removes that block and touches nothing else in the file.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { VAULT_DIRECTORY } from "@archboard/workspace/vault";
import {
	initializeArchitectureModel,
	initializeArchitectureArchive,
} from "@archboard/board/store-write";
import { repoRootOf } from "@archboard/workspace/checkouts";
import { CliUsageError } from "#cli/protocol/contract/contract.ts";
import type { CommandContext } from "#cli/protocol/contract/contract.ts";
import { expandHome } from "#cli/operations/install-skill/skill-destination.ts";

/** The agent documents an earlier version wrote its block into. */
const AGENT_DOCUMENTS = ["CLAUDE.md", "AGENTS.md"] as const;

/**
 * A block an earlier version wrote, markers included, with the line ending that ended it. Each
 * marker stood on a line of its own, so a marker quoted inside a line is prose and stays. A begin
 * marker whose end marker somebody deleted stays too: the block runs from the last begin marker
 * before an end marker, never across another one.
 */
const OLD_BLOCK =
	/^<!-- archboard:begin -->\r?$(?:(?!^<!-- archboard:begin -->)[\s\S])*?^<!-- archboard:end -->\r?(?:\n|$)/gmu;

interface SetupResult {
	repo: string;
	vault: string;
	vaultCreated: boolean;
	vaultIgnored: boolean;
	/** The agent documents that held a block of an earlier version, which was removed. */
	removedBlocks: string[];
}

interface SetupOptions {
	repoSpec?: string;
	context: CommandContext;
}

/**
 * The root of the git checkout a directory is in, as git itself says, or the directory when it is
 * in none. The vault finder asks git the same question, so the vault made here is the one a command
 * run anywhere in the checkout finds, also when `--repo` names a directory inside the checkout.
 * @param from - The directory to start from.
 * @returns The checkout root, else the resolved directory.
 */
function checkoutRootOf(from: string): string {
	const directory = path.resolve(from);
	try {
		const root = execFileSync("git", ["-C", directory, "rev-parse", "--show-toplevel"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		return root === "" ? directory : root;
	} catch {
		return directory;
	}
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
 * Take each block of an earlier version out of a document: the lines from its begin marker through
 * its end marker, line endings included. Every other byte stays.
 * @param text - The document.
 * @returns The document without the block, or undefined when it holds none.
 */
function withoutOldBlock(text: string): string | undefined {
	const removed = text.replace(OLD_BLOCK, "");
	return removed === text ? undefined : removed;
}

/**
 * Remove the block of an earlier version from the repository's agent documents.
 * @param repo - The repository root.
 * @returns The documents it was removed from.
 */
function removeOldBlocks(repo: string): string[] {
	const removedFrom: string[] = [];
	for (const name of AGENT_DOCUMENTS) {
		const file = path.join(repo, name);
		if (!fs.existsSync(file)) continue;
		const without = withoutOldBlock(fs.readFileSync(file, "utf-8"));
		if (without === undefined) continue;
		fs.writeFileSync(file, without, "utf-8");
		removedFrom.push(file);
	}
	return removedFrom;
}

/**
 * Initialize a new vault through the existing archive and canonical installer.
 * @param repo The repository or untracked holder.
 * @param vault The new empty vault.
 */
async function initializeNewVault(repo: string, vault: string): Promise<void> {
	if ((await repoRootOf(repo)) === undefined) {
		const archive = await initializeArchitectureArchive(vault);
		if (!archive.success)
			throw new CliUsageError(
				archive.diagnostics
					.map((item) => `${item.code}: ${item.message} ${item.recovery}`)
					.join("\n"),
			);
	}
	const initialized = await initializeArchitectureModel(vault, {
		name: path.basename(repo),
		operationId: "repository-setup",
		writer: "installer",
		doing: "Initialize canonical architecture",
	});
	if (!initialized.success)
		throw new CliUsageError(
			initialized.diagnostics
				.map((item) => `${item.code}: ${item.message} ${item.recovery}`)
				.join("\n"),
		);
}
/**
 * Set a repository up: make its vault when it has none, and remove the block an earlier version
 * wrote into its agent documents. A repository's vault is where `archboard` finds it from the
 * repository, so nothing about it is written down.
 * @param options - Which repository, and the context.
 * @returns What was done.
 */
async function setUpRepository(options: SetupOptions): Promise<SetupResult> {
	const { context } = options;
	const repo = checkoutRootOf(options.repoSpec ? expandHome(options.repoSpec) : process.cwd());
	const vault = path.join(repo, VAULT_DIRECTORY);
	const vaultCreated = !fs.existsSync(vault);
	fs.mkdirSync(vault, { recursive: true });
	if (fs.readdirSync(vault).length === 0) await initializeNewVault(repo, vault);
	const removedBlocks = removeOldBlocks(repo);
	const vaultIgnored = gitIgnores(repo, vault);

	context.diagnostic(
		`${vaultCreated ? "Made" : "Found"} the architecture of this repository in ${vault}`,
	);
	for (const file of removedBlocks) {
		context.diagnostic(
			`Removed the setup block an earlier version wrote into ${file}, and changed nothing else in it. Commit that change.`,
		);
	}
	if (vaultIgnored) {
		context.diagnostic(
			`Git ignores ${VAULT_DIRECTORY}, so the architecture stays on this machine. Remove that rule to commit them with your code.`,
		);
	}
	return { repo, vault, vaultCreated, vaultIgnored, removedBlocks };
}

export { type SetupResult, type SetupOptions, setUpRepository, withoutOldBlock };
