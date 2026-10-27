import { modelLocalityContract, modelFootprintContract } from "#cli/operations/model/history.ts";
import { modelRasterizeContract } from "#cli/operations/model/rasterize.ts";
import { modelReplayContract } from "#cli/operations/model/replay.ts";
import { modelInitContract } from "#cli/operations/model/initialize.ts";
import { modelExportContract, modelImportContract } from "#cli/operations/model/portable.ts";
import { modelRecordContract } from "#cli/operations/model/record.ts";
import { modelExplainContract } from "#cli/operations/model/explain.ts";
import { modelRenderContract } from "#cli/operations/model/render.ts";
import { modelArchiveInitContract } from "#cli/operations/model/archive.ts";
import {
	modelPublicationContract,
	modelPublicationConfigureContract,
	modelPublishContract,
	modelFetchContract,
} from "#cli/operations/model/publication.ts";
import {
	modelClaimContract,
	modelEditContract,
	modelReleaseContract,
	modelClaimsContract,
	modelRecoverContract,
} from "#cli/operations/model/edit.ts";
import {
	checkAllContract,
	checkCodeContract,
	checkContract,
	checkEmbedsContract,
	checkSemanticsContract,
	semanticConfigContract,
} from "#cli/operations/vault/vault.ts";
import { statusContract } from "#cli/operations/server/status.ts";
import {
	modelCheckpointsContract,
	modelRetainContract,
} from "#cli/operations/model/checkpoints.ts";
import {
	modelInventoryContract,
	modelPlanContract,
	modelMigrateContract,
} from "#cli/operations/model/migration.ts";
import {
	modelContract,
	modelReadContract,
	modelProposalsContract,
	modelCompareContract,
} from "#cli/operations/model/read.ts";
import { restartContract, startContract, stopContract } from "#cli/operations/server/server.ts";
import {
	browserContract,
	browserShowContract,
	paneCloseContract,
	paneOpenContract,
	panesContract,
} from "#cli/operations/pane/pane.ts";
import { repoLanguageServerContract } from "#cli/operations/repo/language-server.ts";
import {
	repoAddContract,
	repoContract,
	repoForgetContract,
	repoListContract,
	repoUseContract,
} from "#cli/operations/repo/repo.ts";
import { installSkillContract } from "#cli/operations/install-skill/install-skill.ts";
import { type CliBootstrap, runCliWith } from "#cli/operations/invocation/session.ts";
import {
	type CliRegistryEntry,
	type CommandRoute,
	child,
	contract,
} from "#cli/protocol/routing/route.ts";
import { registryOf } from "#cli/rules/routing/registry.ts";

// The one command table: every top-level command and its subcommands. What each is
// called and what it accepts is its contract's; dispatch, the registry and help live in rules/routing/.
const COMMANDS: Record<string, CommandRoute> = {
	model: {
		owner: contract(modelContract, "apps/cli/src/cli/operations/model/read.ts"),
		children: {
			rasterize: child(
				contract(modelRasterizeContract, "apps/cli/src/cli/operations/model/rasterize.ts"),
			),
			replay: child(contract(modelReplayContract, "apps/cli/src/cli/operations/model/replay.ts")),
			config: child(contract(semanticConfigContract, "apps/cli/src/cli/operations/vault/vault.ts")),
			init: child(contract(modelInitContract, "apps/cli/src/cli/operations/model/initialize.ts")),
			"archive-init": child(
				contract(modelArchiveInitContract, "apps/cli/src/cli/operations/model/archive.ts"),
			),
			export: child(contract(modelExportContract, "apps/cli/src/cli/operations/model/portable.ts")),
			import: child(contract(modelImportContract, "apps/cli/src/cli/operations/model/portable.ts")),
			edit: child(contract(modelEditContract, "apps/cli/src/cli/operations/model/edit.ts")),
			claim: child(contract(modelClaimContract, "apps/cli/src/cli/operations/model/edit.ts")),
			release: child(contract(modelReleaseContract, "apps/cli/src/cli/operations/model/edit.ts")),
			claims: child(contract(modelClaimsContract, "apps/cli/src/cli/operations/model/edit.ts")),
			recover: child(contract(modelRecoverContract, "apps/cli/src/cli/operations/model/edit.ts")),
			record: child(contract(modelRecordContract, "apps/cli/src/cli/operations/model/record.ts")),
			render: child(contract(modelRenderContract, "apps/cli/src/cli/operations/model/render.ts")),
			locality: child(
				contract(modelLocalityContract, "apps/cli/src/cli/operations/model/history.ts"),
			),
			footprint: child(
				contract(modelFootprintContract, "apps/cli/src/cli/operations/model/history.ts"),
			),
			explain: child(
				contract(modelExplainContract, "apps/cli/src/cli/operations/model/explain.ts"),
			),
			read: child(contract(modelReadContract, "apps/cli/src/cli/operations/model/read.ts")),
			proposals: child(
				contract(modelProposalsContract, "apps/cli/src/cli/operations/model/read.ts"),
			),
			compare: child(contract(modelCompareContract, "apps/cli/src/cli/operations/model/read.ts")),
			retain: child(
				contract(modelRetainContract, "apps/cli/src/cli/operations/model/checkpoints.ts"),
			),
			checkpoints: child(
				contract(modelCheckpointsContract, "apps/cli/src/cli/operations/model/checkpoints.ts"),
			),
			inventory: child(
				contract(modelInventoryContract, "apps/cli/src/cli/operations/model/migration.ts"),
			),
			publication: child(
				contract(modelPublicationContract, "apps/cli/src/cli/operations/model/publication.ts"),
			),
			"publication-configure": child(
				contract(
					modelPublicationConfigureContract,
					"apps/cli/src/cli/operations/model/publication.ts",
				),
			),
			publish: child(
				contract(modelPublishContract, "apps/cli/src/cli/operations/model/publication.ts"),
			),
			fetch: child(
				contract(modelFetchContract, "apps/cli/src/cli/operations/model/publication.ts"),
			),
			migrate: child(
				contract(modelMigrateContract, "apps/cli/src/cli/operations/model/migration.ts"),
			),
			plan: child(contract(modelPlanContract, "apps/cli/src/cli/operations/model/migration.ts")),
		},
		bare: { kind: "default", child: "read", withLeadingOptions: true },
	},
	check: {
		owner: contract(checkContract, "apps/cli/src/cli/operations/vault/vault.ts"),
		children: {
			all: child(contract(checkAllContract, "apps/cli/src/cli/operations/vault/vault.ts")),
			semantics: child(
				contract(checkSemanticsContract, "apps/cli/src/cli/operations/vault/vault.ts"),
			),
			code: child(contract(checkCodeContract, "apps/cli/src/cli/operations/vault/vault.ts")),
			embeds: child(contract(checkEmbedsContract, "apps/cli/src/cli/operations/vault/vault.ts")),
		},
		bare: { kind: "default", child: "all", withLeadingOptions: true },
	},
	start: {
		owner: contract(startContract, "apps/cli/src/cli/operations/server/server.ts"),
	},
	stop: {
		owner: contract(stopContract, "apps/cli/src/cli/operations/server/server.ts"),
	},
	restart: {
		owner: contract(restartContract, "apps/cli/src/cli/operations/server/server.ts"),
	},
	status: {
		owner: contract(statusContract, "apps/cli/src/cli/operations/server/status.ts"),
	},
	browser: {
		owner: contract(browserContract, "apps/cli/src/cli/operations/pane/pane.ts"),
		children: {
			panes: child(contract(panesContract, "apps/cli/src/cli/operations/pane/pane.ts")),
			open: child(contract(paneOpenContract, "apps/cli/src/cli/operations/pane/pane.ts")),
			close: child(contract(paneCloseContract, "apps/cli/src/cli/operations/pane/pane.ts")),
			show: child(contract(browserShowContract, "apps/cli/src/cli/operations/pane/pane.ts")),
		},
		bare: {
			kind: "namespace-refusal",
			message: "browser needs a subcommand: panes, open, close, or show",
		},
	},
	repo: {
		owner: contract(repoContract, "apps/cli/src/cli/operations/repo/repo.ts"),
		children: {
			list: child(contract(repoListContract, "apps/cli/src/cli/operations/repo/repo.ts")),
			add: child(contract(repoAddContract, "apps/cli/src/cli/operations/repo/repo.ts")),
			use: child(contract(repoUseContract, "apps/cli/src/cli/operations/repo/repo.ts")),
			forget: child(contract(repoForgetContract, "apps/cli/src/cli/operations/repo/repo.ts")),
			"language-server": child(
				contract(repoLanguageServerContract, "apps/cli/src/cli/operations/repo/language-server.ts"),
			),
		},
		bare: { kind: "default", child: "list", withLeadingOptions: true },
	},
	"install-skill": {
		owner: contract(
			installSkillContract,
			"apps/cli/src/cli/operations/install-skill/install-skill.ts",
		),
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
