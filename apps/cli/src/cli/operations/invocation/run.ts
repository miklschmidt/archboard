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
import { modelInventoryContract, modelPlanContract } from "#cli/operations/model/migration.ts";
import { modelContract, modelReadContract } from "#cli/operations/model/read.ts";
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
import {
	semanticContract,
	semanticBranchContract,
	semanticEditContract,
	semanticNewContract,
	semanticShowContract,
} from "#cli/operations/semantic/board/board.ts";
import {
	semanticAdoptContract,
	semanticResolveContract,
	semanticShelveContract,
} from "#cli/operations/semantic/board/lifecycle.ts";
import { semanticCompareContract } from "#cli/operations/semantic/compare/compare.ts";
import { semanticCorrectContract } from "#cli/operations/semantic/board/correct.ts";
import { semanticMoveContract } from "#cli/operations/semantic/board/move.ts";
import { semanticDeleteContract } from "#cli/operations/semantic/board/delete.ts";
import { semanticRenameContract } from "#cli/operations/semantic/board/rename.ts";
import { semanticInspectContract } from "#cli/operations/semantic/inspect/inspect.ts";
import { semanticFootprintContract } from "#cli/operations/semantic/history/footprint.ts";
import { semanticLocalityContract } from "#cli/operations/semantic/history/locality.ts";
import { semanticRenderContract } from "#cli/operations/semantic/draw/render.ts";
import { semanticRasterizeContract } from "#cli/operations/semantic/draw/rasterize.ts";
import { semanticViewsContract } from "#cli/operations/semantic/board/views.ts";
import { semanticRecordContract } from "#cli/operations/semantic/draw/record.ts";
import { semanticReplayContract } from "#cli/operations/semantic/draw/replay.ts";
import { claimContract, releaseContract } from "#cli/operations/claim/claim.ts";
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
			"archive-init": child(
				contract(modelArchiveInitContract, "apps/cli/src/cli/operations/model/archive.ts"),
			),
			edit: child(contract(modelEditContract, "apps/cli/src/cli/operations/model/edit.ts")),
			claim: child(contract(modelClaimContract, "apps/cli/src/cli/operations/model/edit.ts")),
			release: child(contract(modelReleaseContract, "apps/cli/src/cli/operations/model/edit.ts")),
			claims: child(contract(modelClaimsContract, "apps/cli/src/cli/operations/model/edit.ts")),
			recover: child(contract(modelRecoverContract, "apps/cli/src/cli/operations/model/edit.ts")),
			render: child(contract(modelRenderContract, "apps/cli/src/cli/operations/model/render.ts")),
			read: child(contract(modelReadContract, "apps/cli/src/cli/operations/model/read.ts")),
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
	semantic: {
		owner: contract(semanticContract, "apps/cli/src/cli/operations/semantic/board/board.ts"),
		children: {
			config: child(contract(semanticConfigContract, "apps/cli/src/cli/operations/vault/vault.ts")),
			new: child(
				contract(semanticNewContract, "apps/cli/src/cli/operations/semantic/board/board.ts"),
			),
			edit: child(
				contract(semanticEditContract, "apps/cli/src/cli/operations/semantic/board/board.ts"),
			),
			branch: child(
				contract(semanticBranchContract, "apps/cli/src/cli/operations/semantic/board/board.ts"),
			),
			resolve: child(
				contract(
					semanticResolveContract,
					"apps/cli/src/cli/operations/semantic/board/lifecycle.ts",
				),
			),
			adopt: child(
				contract(semanticAdoptContract, "apps/cli/src/cli/operations/semantic/board/lifecycle.ts"),
			),
			shelve: child(
				contract(semanticShelveContract, "apps/cli/src/cli/operations/semantic/board/lifecycle.ts"),
			),
			rename: child(
				contract(semanticRenameContract, "apps/cli/src/cli/operations/semantic/board/rename.ts"),
			),
			correct: child(
				contract(semanticCorrectContract, "apps/cli/src/cli/operations/semantic/board/correct.ts"),
			),
			move: child(
				contract(semanticMoveContract, "apps/cli/src/cli/operations/semantic/board/move.ts"),
			),
			delete: child(
				contract(semanticDeleteContract, "apps/cli/src/cli/operations/semantic/board/delete.ts"),
			),
			show: child(
				contract(semanticShowContract, "apps/cli/src/cli/operations/semantic/board/board.ts"),
			),
			compare: child(
				contract(
					semanticCompareContract,
					"apps/cli/src/cli/operations/semantic/compare/compare.ts",
				),
			),
			inspect: child(
				contract(
					semanticInspectContract,
					"apps/cli/src/cli/operations/semantic/inspect/inspect.ts",
				),
			),
			footprint: child(
				contract(
					semanticFootprintContract,
					"apps/cli/src/cli/operations/semantic/history/footprint.ts",
				),
			),
			locality: child(
				contract(
					semanticLocalityContract,
					"apps/cli/src/cli/operations/semantic/history/locality.ts",
				),
			),
			views: child(
				contract(semanticViewsContract, "apps/cli/src/cli/operations/semantic/board/views.ts"),
			),
			render: child(
				contract(semanticRenderContract, "apps/cli/src/cli/operations/semantic/draw/render.ts"),
			),
			rasterize: child(
				contract(
					semanticRasterizeContract,
					"apps/cli/src/cli/operations/semantic/draw/rasterize.ts",
				),
			),
			record: child(
				contract(semanticRecordContract, "apps/cli/src/cli/operations/semantic/draw/record.ts"),
			),
			replay: child(
				contract(semanticReplayContract, "apps/cli/src/cli/operations/semantic/draw/replay.ts"),
			),
		},
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
	claim: {
		owner: contract(claimContract, "apps/cli/src/cli/operations/claim/claim.ts"),
	},
	release: {
		owner: contract(releaseContract, "apps/cli/src/cli/operations/claim/claim.ts"),
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
