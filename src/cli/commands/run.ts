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
	semanticShowContract,
} from "@/cli/commands/semantic";
import { semanticAdoptContract, semanticResolveContract } from "@/cli/commands/semantic-lifecycle";
import { semanticInspectContract } from "@/cli/commands/semantic-inspect";
import { semanticRenderContract } from "@/cli/commands/semantic-render";
import { claimContract, releaseContract } from "@/cli/commands/claim";
import { installSkillContract } from "@/cli/commands/install-skill";
import {
	type CliBootstrap,
	type CliRegistryEntry,
	type CommandRoute,
	child,
	cliSurfaceOf,
	contract,
	helpText,
	registryOf,
	runCliWith,
} from "@/cli/command-routing/index";
import { packageVersion } from "@/runtime/engine/package-version";

// The one command table: every top-level command and its subcommands. What each is
// called and what it accepts is its contract's; dispatch, the registry and help live under lib/.
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
			inspect: child(contract(semanticInspectContract, "src/cli/commands/semantic-inspect.ts")),
			render: child(contract(semanticRenderContract, "src/cli/commands/semantic-render.ts")),
		},
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
	},
	claim: {
		owner: contract(claimContract, "src/cli/commands/claim.ts"),
	},
	release: {
		owner: contract(releaseContract, "src/cli/commands/claim.ts"),
	},
	repo: {
		owner: contract(repoContract, "src/cli/commands/repo.ts"),
		children: {
			list: child(contract(repoListContract, "src/cli/commands/repo.ts")),
			add: child(contract(repoAddContract, "src/cli/commands/repo.ts")),
			forget: child(contract(repoForgetContract, "src/cli/commands/repo.ts")),
		},
		bare: { kind: "default", child: "list", withLeadingOptions: true },
	},
	"install-skill": {
		owner: contract(installSkillContract, "src/cli/commands/install-skill.ts"),
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
 * Renders one help topic from the same command table used for dispatch.
 * @param topic - The command words after `help`; none for the root.
 * @returns The help text.
 */
function commandHelp(topic: readonly string[]): string {
	return helpText(COMMANDS, packageVersion(), topic);
}

/**
 * Runs one CLI invocation and sets the process exit code.
 * @param argv - The arguments after the executable name.
 * @param bootstrap - What the bootstrap took before runtime configuration loaded.
 */
async function runCli(argv: string[], bootstrap?: CliBootstrap): Promise<void> {
	await runCliWith(COMMANDS, argv, bootstrap);
}
export { cliSurface, type CliRegistryEntry, cliContractRegistry, commandHelp, runCli };
