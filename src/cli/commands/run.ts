import { checkContract, semanticConfigContract } from "@/cli/commands/vault";
import { statusContract } from "@/cli/command-contract/status";
import { restartContract, startContract, stopContract } from "@/cli/commands/server";
import {
	browserContract,
	browserShowContract,
	paneCloseContract,
	paneOpenContract,
	panesContract,
} from "@/cli/commands/pane";
import { repoLanguageServerContract } from "@/cli/commands/repo-language-server";
import {
	repoAddContract,
	repoContract,
	repoForgetContract,
	repoListContract,
	repoUseContract,
} from "@/cli/commands/repo";
import {
	semanticContract,
	semanticBranchContract,
	semanticEditContract,
	semanticNewContract,
	semanticShowContract,
} from "@/cli/commands/semantic";
import {
	semanticAdoptContract,
	semanticResolveContract,
	semanticShelveContract,
} from "@/cli/commands/semantic-lifecycle";
import { semanticCompareContract } from "@/cli/commands/semantic-compare";
import { semanticMoveContract } from "@/cli/commands/semantic-move";
import { semanticRenameContract } from "@/cli/commands/semantic-rename";
import { semanticInspectContract } from "@/cli/commands/semantic-inspect";
import { semanticFootprintContract } from "@/cli/commands/semantic-footprint";
import { semanticLocalityContract } from "@/cli/commands/semantic-locality";
import { semanticRenderContract } from "@/cli/commands/semantic-render";
import { semanticRasterizeContract } from "@/cli/commands/semantic-rasterize";
import { semanticViewsContract } from "@/cli/commands/semantic-views";
import { semanticRecordContract } from "@/cli/commands/semantic-record";
import { semanticReplayContract } from "@/cli/commands/semantic-replay";
import { claimContract, releaseContract } from "@/cli/commands/claim";
import { installSkillContract } from "@/cli/commands/install-skill";
import {
	type CliBootstrap,
	type CliRegistryEntry,
	type CommandRoute,
	child,
	contract,
	registryOf,
	runCliWith,
} from "@/cli/command-routing/index";

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
	restart: {
		owner: contract(restartContract, "src/cli/commands/server.ts"),
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
			shelve: child(contract(semanticShelveContract, "src/cli/commands/semantic-lifecycle.ts")),
			rename: child(contract(semanticRenameContract, "src/cli/commands/semantic-rename.ts")),
			move: child(contract(semanticMoveContract, "src/cli/commands/semantic-move.ts")),
			show: child(contract(semanticShowContract, "src/cli/commands/semantic.ts")),
			compare: child(contract(semanticCompareContract, "src/cli/commands/semantic-compare.ts")),
			inspect: child(contract(semanticInspectContract, "src/cli/commands/semantic-inspect.ts")),
			footprint: child(
				contract(semanticFootprintContract, "src/cli/commands/semantic-footprint.ts"),
			),
			locality: child(contract(semanticLocalityContract, "src/cli/commands/semantic-locality.ts")),
			views: child(contract(semanticViewsContract, "src/cli/commands/semantic-views.ts")),
			render: child(contract(semanticRenderContract, "src/cli/commands/semantic-render.ts")),
			rasterize: child(
				contract(semanticRasterizeContract, "src/cli/commands/semantic-rasterize.ts"),
			),
			record: child(contract(semanticRecordContract, "src/cli/commands/semantic-record.ts")),
			replay: child(contract(semanticReplayContract, "src/cli/commands/semantic-replay.ts")),
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
			use: child(contract(repoUseContract, "src/cli/commands/repo.ts")),
			forget: child(contract(repoForgetContract, "src/cli/commands/repo.ts")),
			"language-server": child(
				contract(repoLanguageServerContract, "src/cli/commands/repo-language-server.ts"),
			),
		},
		bare: { kind: "default", child: "list", withLeadingOptions: true },
	},
	"install-skill": {
		owner: contract(installSkillContract, "src/cli/commands/install-skill.ts"),
	},
};

/**
 * The contract registry: every command and subcommand, classified and architecture-checked.
 * @returns The registry entries in table order.
 */
function cliContractRegistry(): CliRegistryEntry[] {
	return registryOf(COMMANDS);
}

/**
 * Runs one CLI invocation and sets the process exit code.
 * @param argv - The arguments after the executable name.
 * @param bootstrap - What the bootstrap took before runtime configuration loaded.
 */
async function runCli(argv: string[], bootstrap?: CliBootstrap): Promise<void> {
	await runCliWith(COMMANDS, argv, bootstrap);
}
export { type CliRegistryEntry, cliContractRegistry, runCli };
