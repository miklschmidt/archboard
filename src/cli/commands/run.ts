import { checkContract, semanticConfigContract } from "@/cli/commands/vault";
import { statusContract } from "@/cli/command-contract/status";
import { startContract, stopContract } from "@/cli/commands/server";
import {
	browserContract,
	browserShowContract,
	paneCloseContract,
	paneOpenContract,
	panesContract,
} from "@/cli/commands/pane";
import {
	repoAddContract,
	repoContract,
	repoForgetContract,
	repoListContract,
} from "@/cli/commands/repo";
import {
	semanticContract,
	semanticBranchContract,
	semanticEditContract,
	semanticNewContract,
	semanticRenderContract,
	semanticShowContract,
} from "@/cli/commands/semantic";
import { semanticAdoptContract, semanticResolveContract } from "@/cli/commands/semantic-lifecycle";
import { claimContract, releaseContract } from "@/cli/commands/claim";
import { installSkillContract } from "@/cli/commands/install-skill";
import {
	type CliRegistryEntry,
	type CommandRoute,
	child,
	cliSurfaceOf,
	contract,
	helpFor,
	registryOf,
	runCliWith,
} from "@/cli/command-routing/index";

// The one command table: every top-level command, its subcommands, and the help wording the
// table owns. Dispatch, registry projection and help rendering live under lib/.
const COMMANDS: Record<string, CommandRoute> = {
	check: { owner: contract(checkContract, "src/cli/commands/vault.ts") },
	start: {
		owner: contract(startContract, "src/cli/commands/server.ts"),
	},
	stop: {
		owner: contract(stopContract, "src/cli/commands/server.ts"),
	},
	status: {
		owner: contract(statusContract, "src/cli/command-contract/status.ts"),
	},
	semantic: {
		owner: contract(semanticContract, "src/cli/commands/semantic.ts"),
		children: {
			config: child(contract(semanticConfigContract, "src/cli/commands/vault.ts")),
			new: child(contract(semanticNewContract, "src/cli/commands/semantic.ts")),
			edit: child(contract(semanticEditContract, "src/cli/commands/semantic.ts")),
			branch: child(contract(semanticBranchContract, "src/cli/commands/semantic.ts")),
			resolve: child(contract(semanticResolveContract, "src/cli/commands/semantic-lifecycle.ts")),
			adopt: child(contract(semanticAdoptContract, "src/cli/commands/semantic-lifecycle.ts")),
			show: child(contract(semanticShowContract, "src/cli/commands/semantic.ts")),
			render: child(contract(semanticRenderContract, "src/cli/commands/semantic.ts")),
		},
		summary: "Author, read and draw an architecture board",
		usage: [
			"semantic new <name> [--input f.json] | semantic edit <name> --expect-version <n> [--input f.json]",
			"         | semantic branch <name> --as <proposal> --expect-version <n>",
			"         | semantic resolve <name> --expect-version <n> [--input f.json]",
			"         | semantic adopt <name> --variant <v> --expect-version <n>",
			"         | semantic show <name> | semantic render <name> --out f.svg",
			"",
			"  You state what the architecture IS — nodes, what contains what, how they are wired,",
			"  the flows between them, the views that explain them — and the renderer owns every",
			"  coordinate, colour, font size and connector route (ADR 0023). There is no way to move",
			"  a box, and there is deliberately none: a diagram whose layout somebody repaired by",
			"  hand cannot be improved for every board at once.",
			"",
			"  The stated shape is JSON, on standard input or in a file, because nodes and their",
			"  relationships are a structure and a flag grammar for a structure is a second contract",
			"  to keep in step with the first.",
		].join("\n"),
	},
	browser: {
		owner: contract(browserContract, "src/cli/commands/pane.ts"),
		children: {
			panes: child(contract(panesContract, "src/cli/commands/pane.ts")),
			open: child(contract(paneOpenContract, "src/cli/commands/pane.ts")),
			close: child(contract(paneCloseContract, "src/cli/commands/pane.ts")),
			show: child(contract(browserShowContract, "src/cli/commands/pane.ts")),
		},
		bare: {
			kind: "namespace-refusal",
			message: "browser needs a subcommand: panes, open, close, or show",
		},
		summary: "Inspect or control the connected browser session",
		usage: [
			"browser panes [--text]",
			"        | open | close <pane> | show <board>[@<variant>] --pane <pane>",
			"  <pane> accepts left, right, top, bottom, focused, primary, a position, or a pane id.",
			"",
			"  These commands inspect or visibly change a connected browser session. Except for",
			"  `panes`, they require a live pane and exit 4 when none exists. None writes a board.",
			"  `show` requires an explicit pane once two are open, so the visible target never",
			"  depends on focus. Use `semantic render --board <key> --out f.svg` for a picture of a",
			"  board with no browser involved.",
		].join("\n"),
	},
	claim: {
		owner: contract(claimContract, "src/cli/commands/claim.ts"),
		summary: "Take a board for a stretch of work, so twenty writes are one uninterrupted act",
		usage: [
			'claim --board <key> --reason "redrawing the payment path" [--for 10m]',
			"",
			"  FOR WORK YOU KNOW IN ADVANCE IS SUBSTANTIAL, and for nothing smaller. An ordinary write",
			"  already takes the board for as long as it takes to write, so there is nothing to claim for",
			"  one edit. What a claim buys is the twenty writes in between: taking and releasing the",
			"  board twenty times leaves nineteen gaps for somebody else to write into, and a board that",
			"  is never once in the state you meant it to be in.",
			"",
			"  NOTHING TO CARRY. Every write you make to this board while the claim stands goes under the",
			"  claim, because the board is named on it. Claim again to extend, with the reason brought up",
			"  to date; a write does not extend it. --for takes a unit (90s, 10m, 1h), and defaults to ten",
			"  minutes.",
			"",
			"  Every pane shows your reason and latest step. A PERSON CAN RELEASE YOUR CLAIM with one",
			"  explicit control. Your next act is then refused once and says so, and NOTHING IS ROLLED",
			"  BACK: every write you made is on the board. So leave the board sensible after each write.",
			"  Stop when you are told; do not claim it again to finish.",
		].join("\n"),
	},
	release: {
		owner: contract(releaseContract, "src/cli/commands/claim.ts"),
		summary: "Give back a board you claimed",
		usage: [
			"release --board <key>",
			"",
			"  Ends the claim. The board goes back to being taken one write at a time, and everything you",
			"  wrote stays where it is. Releasing a claim that has expired, or that somebody took back, is",
			"  not an error — it answers `released: false`.",
		].join("\n"),
	},
	repo: {
		owner: contract(repoContract, "src/cli/commands/repo.ts"),
		children: {
			list: child(contract(repoListContract, "src/cli/commands/repo.ts")),
			add: child(contract(repoAddContract, "src/cli/commands/repo.ts")),
			forget: child(contract(repoForgetContract, "src/cli/commands/repo.ts")),
		},
		bare: { kind: "default", child: "list", withLeadingOptions: true },
		summary:
			"The repository checkouts on this machine, so a binding can name a repo instead of a directory",
		usage: [
			"repo list [--text] | repo add [dir] | repo forget <identity>",
			"",
			"  A binding is a repository identity plus a path inside it, never a directory on one machine.",
			"  Boards live in a vault that spans repositories and is meant to be readable from any of them",
			"  (ADR 0004). This is where archboard writes down where each repository actually is HERE.",
			"",
			"  Register a checkout and it can be named from anywhere, which is what makes a system board",
			"  covering five repositories buildable in one session (ADR 0011).",
			"",
			"  `add` takes the identity from git (origin, else the directory name) and never from you, because",
			"  two people naming one clone differently is what would make the addresses useless. With no",
			"  argument it registers the directory you are standing in.",
		].join("\n"),
	},
	"install-skill": {
		owner: contract(installSkillContract, "src/cli/commands/install-skill.ts"),
		summary: "Install the bundled agent skill and write the setup into this repo",
		usage: [
			"install-skill [--agent codex|claude-code] [--target claude] [--dir <skills-root>]",
			"              [--print-source]",
			"              [--repo <dir>] [--vault <path>] [--doc <file>] [--no-doc] [--yes]",
			"",
			"  Copies the skill into a skills root, then writes the setup into the repo's own CLAUDE.md",
			"  or AGENTS.md — an existing CLAUDE.md first, else an existing AGENTS.md, else AGENTS.md by",
			"  default or CLAUDE.md for the Claude destination. The other one is never created. The block",
			"  is fenced by markers and replaced in place on a re-run, so re-installing does not leave two",
			"  of them.",
			"",
			"  With no destination flag, installs to ~/.agents/skills. For skills.sh-compatible agent",
			"  selection, --agent codex uses that root and --agent claude-code uses ~/.claude/skills.",
			"  --target claude is a shortcut for the latter. Custom roots use --dir; --target codex is",
			"  obsolete and refused.",
			"",
			"  The block records what the skill cannot know: the vault path and how to invoke this binary",
			"  when it is not on PATH. The vault defaults to <repo>/.archboard/vault — boards local to",
			"  the repo — or to ARCHBOARD_VAULT when it is already set; on a terminal you are asked,",
			"  with that as the offered answer. --vault names one outright, --yes takes the offer",
			"  without asking, and",
			"  --no-doc installs the skill and touches nothing else.",
		].join("\n"),
	},
};

/**
 * Every way the CLI can be invoked, as `{ name, subcommands }`: the command table read as
 * data for contract and documentation checks.
 * @returns One entry per top-level command with its subcommand names.
 */
function cliSurface(): { name: string; subcommands: readonly string[] }[] {
	return cliSurfaceOf(COMMANDS);
}

/**
 * The contract registry: every command and subcommand, classified and architecture-checked.
 * @returns The registry entries in table order.
 */
function cliContractRegistry(): CliRegistryEntry[] {
	return registryOf(COMMANDS);
}

/**
 * Renders one help topic from the same route and contract registry used for dispatch.
 * @param topic - The words after `help`.
 * @returns The help text, or null when the topic names no command.
 */
function commandHelp(topic: readonly string[]): string | null {
	return helpFor(COMMANDS, topic);
}

/**
 * Runs one CLI invocation and sets the process exit code.
 * @param argv - The arguments after the executable name.
 */
async function runCli(argv: string[]): Promise<void> {
	await runCliWith(COMMANDS, argv);
}

export { cliSurface, type CliRegistryEntry, cliContractRegistry, commandHelp, runCli };
