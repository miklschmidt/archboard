import { relative } from "node:path";
import { z } from "zod";
import {
	ArchitectureModelReadSchema,
	ModelSnapshotSchema,
	type ArchitectureModelRead,
} from "@archboard/model/contract";
import { readArchitectureModelOnServer } from "#cli/server-access/clients/architecture-model.ts";
import { checkSemanticVaultOnServer } from "#cli/server-access/clients/vault-check.ts";
import { CliUsageError, defineCommand } from "#cli/contract/protocol/contract.ts";
import { serverRefusal } from "#cli/contract/protocol/refusals.ts";
import { PendingArtifactSchema } from "#cli/contract/protocol/schemas.ts";
import { packageVersion } from "#cli/routing/store/package-version.ts";
import {
	modelReadContract,
	refusedRead,
	unavailableOutcome,
} from "#cli/commands/model/operations/read.ts";

type Reading = Extract<ArchitectureModelRead, { success: true }>;

/** The selectors of `model read` that choose the state a snapshot holds. */
const SelectionSchema = modelReadContract.input.ingress.pick({
	state: true,
	against: true,
	model: true,
	flow: true,
});

/**
 * The selectors that read the comparison state alone: its exact checkpoint or
 * state, with no comparison of its own.
 * @param comparison The comparison metadata of the selected reading.
 * @returns The read arguments of the comparison state.
 */
function comparisonSelection(comparison: NonNullable<Reading["comparison"]>) {
	if (comparison.checkpoint !== undefined || comparison.against === null) return { compare: false };
	if (comparison.against.lifecycle === "current") return {};
	return { state: comparison.against.id, compare: false };
}

/**
 * Read the selected state, then the state it is compared against.
 * @param selection The selectors of `model read`.
 * @param selection.flow The selected flow, which only the selected state reads.
 * @returns Both readings, or the refusal of either read.
 */
async function readStates({ flow, ...selection }: z.output<typeof SelectionSchema>) {
	const reading = await readArchitectureModelOnServer(undefined, undefined, flow, selection);
	if (!reading.success) return reading;
	if (reading.comparison === undefined) return { reading, comparisonReading: null };
	const comparisonReading = await readArchitectureModelOnServer(
		undefined,
		reading.comparison.checkpoint,
		undefined,
		{ model: selection.model, ...comparisonSelection(reading.comparison) },
	);
	return comparisonReading.success ? { reading, comparisonReading } : comparisonReading;
}

/**
 * What the command answers about the file it wrote.
 * @param file The written file.
 * @param snapshot The snapshot in it.
 * @returns The receipt.
 */
function receiptOf(file: string, snapshot: z.output<typeof ModelSnapshotSchema>) {
	return {
		success: true as const,
		file,
		format: snapshot.format,
		revision: snapshot.reading.revision.digest,
		comparisonRevision: snapshot.comparisonReading?.revision.digest ?? null,
	};
}

const modelSnapshotContract = defineCommand({
	path: ["model", "snapshot"],
	shared: ["url", "directory"],
	summary: "Write a state and its comparison state to one portable file",
	description: [
		"Writes one JSON file that holds everything needed to draw a state without an Archboard server: the model reading, the reading of its comparison state, the vault check with its policy and diagnostics, and the path data of the icons that the policy names. Share or archive the file to keep one reading of the model.",
		"",
		"The selectors are those of `model read`. The `format` field names the version of the file format, and `cliVersion` the CLI that wrote it. An unchanged vault gives the same bytes.",
	].join("\n"),
	examples: [
		"archboard model snapshot --out model.snapshot.json",
		"archboard model snapshot --state 'Queued fulfilment' --out queued.snapshot.json",
	],
	parameters: [
		...modelReadContract.parameters.filter((parameter) => parameter.key in SelectionSchema.shape),
		{
			kind: "option",
			key: "out",
			spellings: ["--out"],
			value: "required",
			placeholder: "file.json",
			required: true,
			description: "Write the snapshot to this file",
		},
	],
	input: { ingress: SelectionSchema.extend({ out: z.string() }) },
	result: z.union([
		z.strictObject({
			success: z.literal(true),
			file: z.string(),
			format: ModelSnapshotSchema.shape.format,
			revision: z.string(),
			comparisonRevision: z.string().nullable(),
		}),
		ArchitectureModelReadSchema.options[1],
	]),
	output: {
		cases: [
			{
				id: "file",
				when: {},
				mode: "file-receipt",
				artifact: PendingArtifactSchema,
				description: "The written snapshot's receipt or structured diagnostics",
			},
		],
		/**
		 * Select the snapshot file receipt.
		 * @returns The file output case.
		 */
		select: () => "file",
	},
	prerequisites: ["server"],
	effects: ["read", "local-write"],
	refusals: [serverRefusal],
	outcomes: [unavailableOutcome],
	relationships: [
		{
			method: "GET",
			path: "/api/architecture/model",
			cardinality: "conditional",
			description: "The selected state, then its comparison state when it has one",
		},
		{
			method: "GET",
			path: "/api/vault/check",
			cardinality: "one",
			description: "The policy and diagnostics of the selected state",
		},
	],
	/**
	 * Read the selected state, its comparison state and the vault check, and stage the file.
	 * @param input The selectors and the file.
	 * @param context The invocation capabilities.
	 * @returns The file receipt, or the refusal of either read.
	 */
	async handler(input, context) {
		await context.require("server", "model snapshot");
		if (!context.vault) throw new CliUsageError("A snapshot requires an explicit vault.");
		const { out, ...selection } = input;
		const states = await readStates(selection);
		if ("success" in states) return { result: states, ...refusedRead(states) };
		const check = await checkSemanticVaultOnServer(
			context.signal,
			states.reading.selectedState?.id,
		);
		// Loaded here, not with the command table: the icon set is large and only this command reads it.
		const { policyIconPaths } = await import("@archboard/renderer/bun");
		const snapshot = ModelSnapshotSchema.parse({
			format: 1,
			cliVersion: packageVersion(),
			...states,
			// The file names no path of the machine that wrote it.
			check: { ...check, configurationFile: relative(context.vault.path, check.configurationFile) },
			icons: policyIconPaths(check.policy),
		});
		const file = context.resolvePath(out);
		return {
			result: receiptOf(file, snapshot),
			pendingArtifact: {
				path: file,
				content: `${JSON.stringify(snapshot)}\n`,
				encoding: "utf8" as const,
			},
		};
	},
});

export { modelSnapshotContract };
