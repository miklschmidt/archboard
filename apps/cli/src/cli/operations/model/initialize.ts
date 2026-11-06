import fs from "node:fs";
import path from "node:path";
import type { z } from "zod";
import { statedInvocation } from "@archboard/server-lifecycle/server-client";
import { serverRefusal, doingRefusal } from "#cli/protocol/contract/refusals.ts";
import {
	ArchitectureInitializationRequestSchema,
	ArchitectureModuleEditResultSchema,
	type ArchitectureModuleEditResult,
} from "@archboard/model/contract";
import {
	initializeArchitectureModel,
	initializeArchitectureArchive,
} from "@archboard/model/store-write";
import { repoRootOf } from "@archboard/workspace/checkouts";
import { VAULT_DIRECTORY } from "@archboard/workspace/vault";
import { initializeArchitectureModelOnServer } from "#cli/clients/server/architecture-model.ts";
import { modelArchiveInitContract } from "#cli/operations/model/archive.ts";
import { findVaultOf } from "#cli/operations/invocation/addressed-vault.ts";
import { defineCommand, type CommandContext } from "#cli/protocol/contract/contract.ts";

/** One initialization intent, complete with its doing line. */
type InitializationIntent = z.infer<typeof ArchitectureInitializationRequestSchema>;

/**
 * Make the vault of a repository that holds none: `<repo>/.archboard/vault`, with the default
 * vocabulary in `.archboard/config.yaml` and an empty planning model, through the canonical
 * installer. A repository outside Git first gets the private archive that its history needs.
 * Then the repository is registered, so that a browser lists it. `model init` in a checkout
 * without a vault and `install-skill` both make a vault here, so every new vault is made one way.
 * @param repo The checkout root, or the directory that holds an untracked vault.
 * @param intent The initialization intent.
 * @param context Where the line that names the new vault goes.
 * @returns The installer's receipt or refusal. A refusal registers nothing.
 */
async function makeVault(
	repo: string,
	intent: InitializationIntent,
	context: Pick<CommandContext, "diagnostic">,
): Promise<ArchitectureModuleEditResult> {
	const vault = path.join(repo, VAULT_DIRECTORY);
	fs.mkdirSync(vault, { recursive: true });
	if ((await repoRootOf(repo)) === undefined) {
		const archive = await initializeArchitectureArchive(vault);
		if (!archive.success) return archive;
	}
	const initialized = await initializeArchitectureModel(vault, intent);
	if (!initialized.success) return initialized;
	await findVaultOf(repo, "-C");
	context.diagnostic(`Made the architecture of this repository in ${vault}`);
	return initialized;
}

/**
 * The diagnostic lines of a refusal.
 * @param result The refusal.
 * @returns One line for each diagnostic.
 */
function refusalLines(result: Extract<ArchitectureModuleEditResult, { success: false }>): string[] {
	return result.diagnostics.map((item) => `${item.code}: ${item.message} ${item.recovery}`);
}

const modelInitContract = defineCommand({
	...modelArchiveInitContract,
	shared: ["url", "directory", "doing"],
	runsWithoutVault: true,
	refusals: [serverRefusal, doingRefusal],
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "Canonical initialization receipt or structured refusal",
			},
		],
		/**
		 * Select the declared JSON receipt.
		 * @returns The output identity.
		 */
		select: () => "json",
	},
	path: ["model", "init"],
	summary: "Initialize an empty canonical planning model",
	description:
		"Creates one canonical model through the existing signed installation and recovery workflow. Existing models and legacy boards are never replaced. In a Git checkout that has no vault, it first makes <root>/.archboard/vault with the default vocabulary, registers the checkout, and needs no server.",
	examples: [
		"archboard model init --name Shop --operation-id initialize-shop --writer agent --doing 'Initialize architecture'",
	],
	parameters: (
		[
			["name", "The model name"],
			["operationId", "The stable retry identity"],
			["writer", "The author identity"],
		] as const
	).map(([key, description]) => ({
		kind: "option" as const,
		key,
		spellings: [key === "operationId" ? "--operation-id" : `--${key}`] as const,
		value: "required" as const,
		placeholder: "value",
		required: true,
		description,
	})),
	input: { ingress: ArchitectureInitializationRequestSchema.omit({ doing: true }) },
	result: ArchitectureModuleEditResultSchema,
	effects: ["write", "server-state-write", "local-write"],
	relationships: [
		{
			method: "POST",
			path: "/api/architecture/init",
			cardinality: "conditional",
			description:
				"Initialize the addressed empty vault through the canonical installer; a checkout without a vault is initialized locally",
		},
	],
	/**
	 * Initialize the addressed empty vault, or make the vault of a checkout that has none.
	 * @param input The stable intent.
	 * @param context The invocation capabilities.
	 * @returns The durable result or refusal.
	 */
	async handler(input, context) {
		if (context.checkout === null) await context.require("server", "model init");
		const request = context.parse(ArchitectureInitializationRequestSchema, {
			...input,
			doing: statedInvocation().doing,
		});
		const result =
			context.checkout === null
				? await initializeArchitectureModelOnServer(request)
				: await makeVault(context.checkout, request, context);
		return {
			result,
			...(result.success ? {} : { outcome: "unavailable", diagnostics: refusalLines(result) }),
		};
	},
});

export { makeVault, modelInitContract, refusalLines };
