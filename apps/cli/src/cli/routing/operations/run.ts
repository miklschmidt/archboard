import {
	modelLocalityContract,
	modelFootprintContract,
} from "#cli/commands/model/operations/history.ts";
import { modelInspectContract } from "#cli/commands/model/operations/inspect.ts";
import { modelRasterizeContract } from "#cli/commands/model/operations/rasterize.ts";
import { modelReplayContract } from "#cli/commands/model/operations/replay.ts";
import { modelInitContract } from "#cli/commands/model/operations/initialize.ts";
import { modelSchemaContract } from "#cli/commands/model/operations/schema.ts";
import {
	modelExportContract,
	modelImportContract,
} from "#cli/commands/model/operations/portable.ts";
import { modelRecordContract } from "#cli/commands/model/operations/record.ts";
import { modelExplainContract } from "#cli/commands/model/operations/explain.ts";
import { modelRenderContract } from "#cli/commands/model/operations/render.ts";
import { modelArchiveInitContract } from "#cli/commands/model/operations/archive.ts";
import {
	modelPublicationContract,
	modelPublicationConfigureContract,
	modelPublishContract,
	modelFetchContract,
} from "#cli/commands/model/operations/publication.ts";
import {
	modelClaimContract,
	modelEditContract,
	modelReleaseContract,
	modelClaimsContract,
	modelRecoverContract,
} from "#cli/commands/model/operations/edit.ts";
import {
	checkAllContract,
	checkCodeContract,
	checkContract,
	checkEmbedsContract,
	checkSemanticsContract,
	semanticConfigContract,
} from "#cli/commands/vault/operations/vault.ts";
import { statusContract } from "#cli/commands/server-control/operations/status.ts";
import {
	modelCheckpointsContract,
	modelRetainContract,
} from "#cli/commands/model/operations/checkpoints.ts";
import {
	modelInventoryContract,
	modelPlanContract,
	modelMigrateContract,
} from "#cli/commands/model/operations/migration.ts";
import {
	modelContract,
	modelReadContract,
	modelProposalsContract,
	modelCompareContract,
} from "#cli/commands/model/operations/read.ts";
import {
	restartContract,
	startContract,
	stopContract,
} from "#cli/commands/server-control/operations/server.ts";
import {
	browserContract,
	browserShowContract,
	paneCloseContract,
	paneOpenContract,
	panesContract,
} from "#cli/commands/pane/operations/pane.ts";
import { repoLanguageServerContract } from "#cli/commands/repo/operations/language-server.ts";
import {
	repoAddContract,
	repoContract,
	repoForgetContract,
	repoListContract,
	repoUseContract,
} from "#cli/commands/repo/operations/repo.ts";
import { initContract } from "#cli/commands/init/operations/init.ts";
import { type CliBootstrap, runCliWith } from "#cli/routing/operations/session.ts";
import {
	type CliRegistryEntry,
	type CommandRoute,
	child,
	contract,
} from "#cli/routing/protocol/route.ts";
import { registryOf } from "#cli/routing/rules/registry.ts";

// The one command table: every top-level command and its subcommands. What each is
// called and what it accepts is its contract's; dispatch, the registry and help live in routing/rules/.
const COMMANDS: Record<string, CommandRoute> = {
	model: {
		owner: contract(modelContract, "apps/cli/src/cli/commands/model/operations/read.ts"),
		children: {
			rasterize: child(
				contract(modelRasterizeContract, "apps/cli/src/cli/commands/model/operations/rasterize.ts"),
			),
			replay: child(
				contract(modelReplayContract, "apps/cli/src/cli/commands/model/operations/replay.ts"),
			),
			config: child(
				contract(semanticConfigContract, "apps/cli/src/cli/commands/vault/operations/vault.ts"),
			),
			schema: child(
				contract(modelSchemaContract, "apps/cli/src/cli/commands/model/operations/schema.ts"),
			),
			init: child(
				contract(modelInitContract, "apps/cli/src/cli/commands/model/operations/initialize.ts"),
			),
			"archive-init": child(
				contract(modelArchiveInitContract, "apps/cli/src/cli/commands/model/operations/archive.ts"),
			),
			export: child(
				contract(modelExportContract, "apps/cli/src/cli/commands/model/operations/portable.ts"),
			),
			import: child(
				contract(modelImportContract, "apps/cli/src/cli/commands/model/operations/portable.ts"),
			),
			edit: child(
				contract(modelEditContract, "apps/cli/src/cli/commands/model/operations/edit.ts"),
			),
			claim: child(
				contract(modelClaimContract, "apps/cli/src/cli/commands/model/operations/edit.ts"),
			),
			release: child(
				contract(modelReleaseContract, "apps/cli/src/cli/commands/model/operations/edit.ts"),
			),
			claims: child(
				contract(modelClaimsContract, "apps/cli/src/cli/commands/model/operations/edit.ts"),
			),
			recover: child(
				contract(modelRecoverContract, "apps/cli/src/cli/commands/model/operations/edit.ts"),
			),
			record: child(
				contract(modelRecordContract, "apps/cli/src/cli/commands/model/operations/record.ts"),
			),
			render: child(
				contract(modelRenderContract, "apps/cli/src/cli/commands/model/operations/render.ts"),
			),
			locality: child(
				contract(modelLocalityContract, "apps/cli/src/cli/commands/model/operations/history.ts"),
			),
			footprint: child(
				contract(modelFootprintContract, "apps/cli/src/cli/commands/model/operations/history.ts"),
			),
			explain: child(
				contract(modelExplainContract, "apps/cli/src/cli/commands/model/operations/explain.ts"),
			),
			read: child(
				contract(modelReadContract, "apps/cli/src/cli/commands/model/operations/read.ts"),
			),
			inspect: child(
				contract(modelInspectContract, "apps/cli/src/cli/commands/model/operations/inspect.ts"),
			),
			proposals: child(
				contract(modelProposalsContract, "apps/cli/src/cli/commands/model/operations/read.ts"),
			),
			compare: child(
				contract(modelCompareContract, "apps/cli/src/cli/commands/model/operations/read.ts"),
			),
			retain: child(
				contract(modelRetainContract, "apps/cli/src/cli/commands/model/operations/checkpoints.ts"),
			),
			checkpoints: child(
				contract(
					modelCheckpointsContract,
					"apps/cli/src/cli/commands/model/operations/checkpoints.ts",
				),
			),
			inventory: child(
				contract(modelInventoryContract, "apps/cli/src/cli/commands/model/operations/migration.ts"),
			),
			publication: child(
				contract(
					modelPublicationContract,
					"apps/cli/src/cli/commands/model/operations/publication.ts",
				),
			),
			"publication-configure": child(
				contract(
					modelPublicationConfigureContract,
					"apps/cli/src/cli/commands/model/operations/publication.ts",
				),
			),
			publish: child(
				contract(modelPublishContract, "apps/cli/src/cli/commands/model/operations/publication.ts"),
			),
			fetch: child(
				contract(modelFetchContract, "apps/cli/src/cli/commands/model/operations/publication.ts"),
			),
			migrate: child(
				contract(modelMigrateContract, "apps/cli/src/cli/commands/model/operations/migration.ts"),
			),
			plan: child(
				contract(modelPlanContract, "apps/cli/src/cli/commands/model/operations/migration.ts"),
			),
		},
		bare: { kind: "default", child: "read", withLeadingOptions: true },
	},
	check: {
		owner: contract(checkContract, "apps/cli/src/cli/commands/vault/operations/vault.ts"),
		children: {
			all: child(contract(checkAllContract, "apps/cli/src/cli/commands/vault/operations/vault.ts")),
			semantics: child(
				contract(checkSemanticsContract, "apps/cli/src/cli/commands/vault/operations/vault.ts"),
			),
			code: child(
				contract(checkCodeContract, "apps/cli/src/cli/commands/vault/operations/vault.ts"),
			),
			embeds: child(
				contract(checkEmbedsContract, "apps/cli/src/cli/commands/vault/operations/vault.ts"),
			),
		},
		bare: { kind: "default", child: "all", withLeadingOptions: true },
	},
	start: {
		owner: contract(startContract, "apps/cli/src/cli/commands/server-control/operations/server.ts"),
	},
	stop: {
		owner: contract(stopContract, "apps/cli/src/cli/commands/server-control/operations/server.ts"),
	},
	restart: {
		owner: contract(
			restartContract,
			"apps/cli/src/cli/commands/server-control/operations/server.ts",
		),
	},
	status: {
		owner: contract(
			statusContract,
			"apps/cli/src/cli/commands/server-control/operations/status.ts",
		),
	},
	browser: {
		owner: contract(browserContract, "apps/cli/src/cli/commands/pane/operations/pane.ts"),
		children: {
			panes: child(contract(panesContract, "apps/cli/src/cli/commands/pane/operations/pane.ts")),
			open: child(contract(paneOpenContract, "apps/cli/src/cli/commands/pane/operations/pane.ts")),
			close: child(
				contract(paneCloseContract, "apps/cli/src/cli/commands/pane/operations/pane.ts"),
			),
			show: child(
				contract(browserShowContract, "apps/cli/src/cli/commands/pane/operations/pane.ts"),
			),
		},
		bare: {
			kind: "namespace-refusal",
			message: "browser needs a subcommand: panes, open, close, or show",
		},
	},
	repo: {
		owner: contract(repoContract, "apps/cli/src/cli/commands/repo/operations/repo.ts"),
		children: {
			list: child(contract(repoListContract, "apps/cli/src/cli/commands/repo/operations/repo.ts")),
			add: child(contract(repoAddContract, "apps/cli/src/cli/commands/repo/operations/repo.ts")),
			use: child(contract(repoUseContract, "apps/cli/src/cli/commands/repo/operations/repo.ts")),
			forget: child(
				contract(repoForgetContract, "apps/cli/src/cli/commands/repo/operations/repo.ts"),
			),
			"language-server": child(
				contract(
					repoLanguageServerContract,
					"apps/cli/src/cli/commands/repo/operations/language-server.ts",
				),
			),
		},
		bare: { kind: "default", child: "list", withLeadingOptions: true },
	},
	init: {
		owner: contract(initContract, "apps/cli/src/cli/commands/init/operations/init.ts"),
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
