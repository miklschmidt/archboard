import { writeFileSync } from "node:fs";
import { z } from "zod";
import {
	ArchitectureModelReadSchema,
	ArchitectureClaimResultSchema,
	ArchitectureModuleEditResultSchema,
	type ArchitectureModuleEdit,
} from "@archboard/board/model";

// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { scratch, type TakeServer } from "./kit.ts";

type Batch = Extract<ArchitectureModuleEdit, { changes: unknown }>;
type Proposal = Extract<Batch, { proposal: unknown }>["proposal"];

/**
 * Remove CLI invocation metadata before reading the shared result contract.
 * @param reply The CLI JSON answer.
 * @returns The public runtime result.
 */
function modelResult(reply: unknown) {
	const { vault: _vault, ...result } = z.record(z.string(), z.unknown()).parse(reply);
	return result;
}

/**
 * Read a complete canonical state through the take's CLI.
 * @param server The isolated take server.
 * @param state A proposal identity or name, or current when absent.
 * @returns The successful public reading.
 */
async function readModel(server: TakeServer, state: string | null = null) {
	const model = ArchitectureModelReadSchema.parse(
		modelResult(await server.cli(["model", "read", ...(state === null ? [] : ["--state", state])])),
	);
	if (!model.success) throw new Error(JSON.stringify(model));
	return model;
}

/**
 * Apply one authored change through the public claim and edit commands.
 * @param server The isolated take server.
 * @param take The scratch directory that holds this take's authored inputs.
 * @param state The proposal to edit, or current when null.
 * @param changes The complete change batch.
 * @param proposal An explicit proposal lifecycle action, when needed.
 * @returns The durable operation receipt.
 */
async function editModel(
	server: TakeServer,
	take: string,
	state: string | null,
	changes: Batch["changes"],
	proposal?: Proposal,
) {
	const model = await readModel(server, state);
	const target = {
		model: model.manifest.id,
		state: model.selectedState?.id ?? model.manifest.current?.id ?? null,
	};
	const operationId = crypto.randomUUID();
	const input = scratch("takes", take, `${operationId}.json`);
	const writer = "readme";
	writeFileSync(
		input,
		JSON.stringify({
			target,
			writer,
			reason: "Author the synthetic README example",
			subjects: [
				...new Set([
					model.manifest.id,
					...(target.state === null ? [] : [target.state]),
					...model.proposals.map(({ id }) => id),
					...model.modules.map(({ id }) => id),
					...model.relationships.map(({ id }) => id),
				]),
			],
		}),
	);
	const claimed = ArchitectureClaimResultSchema.parse(
		modelResult(await server.cli(["model", "claim", "--input", input])),
	);
	if (!claimed.success) throw new Error(JSON.stringify(claimed));
	try {
		writeFileSync(
			input,
			JSON.stringify({
				target,
				expectedRevision: model.revision,
				operationId,
				writer,
				claim: claimed.claim.id,
				changes,
				...(proposal === undefined ? {} : { proposal }),
			}),
		);
		const result = ArchitectureModuleEditResultSchema.parse(
			modelResult(
				await server.cli([
					"model",
					"edit",
					"--input",
					input,
					"--doing",
					"Author the synthetic README example",
				]),
			),
		);
		if (!result.success) throw new Error(JSON.stringify(result));
		return result;
	} finally {
		writeFileSync(input, JSON.stringify({ claim: claimed.claim.id, writer }));
		await server.cli(["model", "release", "--input", input]);
	}
}

export { readModel, editModel, modelResult };
