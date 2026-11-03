import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { modelContent, subjectsOf } from "@archboard/model/content";
import type { ArchitecturePaneReadingSchema } from "@archboard/model/pane-context";
import {
	ArchitectureModelReadSchema,
	ArchitectureClaimResultSchema,
	ArchitectureModuleEditResultSchema,
	type ArchitectureModuleEdit,
} from "@archboard/model/contract";

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

/** Why a writer claims subjects and what its edit says it is doing: the words a reader of a claim sees. */
interface Intent {
	readonly reason: string;
	readonly doing: string;
}

/** What an edit says when the scene gives no words of its own. */
const EXAMPLE_INTENT: Intent = {
	reason: "Author the example architecture",
	doing: "Author the example architecture",
};

/**
 * Apply one authored change through the public claim and edit commands.
 * @param server The isolated take server.
 * @param take The scratch directory that holds this take's authored inputs.
 * @param state The proposal to edit, or current when null.
 * @param changes The complete change batch.
 * @param proposal An explicit proposal lifecycle action, when needed.
 * @param intent The claim's reason and the edit's doing line.
 * @returns The durable operation receipt.
 */
async function editModel(
	server: TakeServer,
	take: string,
	state: string | null,
	changes: Batch["changes"],
	proposal?: Proposal,
	intent: Intent = EXAMPLE_INTENT,
) {
	const model = await readModel(server, state);
	const target = modelTarget(model);
	const operationId = crypto.randomUUID();
	const work = scratch("takes", take);
	const claimInput = join(work, `${operationId}.claim.json`);
	const input = join(work, `${operationId}.edit.json`);
	const writer = "readme";
	writeFileSync(
		claimInput,
		JSON.stringify({
			target,
			writer,
			reason: intent.reason,
			subjects: [
				...new Set([
					model.manifest.id,
					...(target.state === null ? [] : [target.state]),
					...model.proposals.map(({ id }) => id),
					...model.collections.map(({ id }) => `${model.manifest.id}#${id}`),
					...[...subjectsOf(modelContent(model))].map(({ id }) => id),
					...model.walkthroughs.flatMap((walkthrough) => [
						walkthrough.id,
						...walkthrough.beats.map(({ id }) => id),
					]),
				]),
			],
		}),
	);
	const claimed = ArchitectureClaimResultSchema.parse(
		modelResult(await server.cli(["model", "claim", "--input", claimInput])),
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
			modelResult(await server.cli(["model", "edit", "--input", input, "--doing", intent.doing])),
		);
		if (!result.success) throw new Error(JSON.stringify(result));
		return result;
	} finally {
		const releaseInput = join(work, `${operationId}.release.json`);
		writeFileSync(releaseInput, JSON.stringify({ claim: claimed.claim.id, writer }));
		await server.cli(["model", "release", "--input", releaseInput]);
	}
}

/**
 * Address the exact state returned by the canonical reader.
 * @param model The public reading.
 * @returns The explicit mutation target.
 */
function modelTarget(model: Awaited<ReturnType<typeof readModel>>) {
	return {
		model: model.manifest.id,
		state: model.selectedState?.id ?? model.manifest.current?.id ?? null,
	};
}

/**
 * Open a complete authored reading through the existing CLI input contract.
 * @param server The take's server.
 * @param take The directory that holds the reading instruction.
 * @param pane The addressed browser pane.
 * @param reading The canonical reading, including its explicit comparison when needed.
 */
async function showModel(
	server: TakeServer,
	take: string,
	pane: string,
	reading: z.input<typeof ArchitecturePaneReadingSchema>,
): Promise<void> {
	const input = join(scratch("takes", take), `${crypto.randomUUID()}.reading.json`);
	writeFileSync(input, JSON.stringify(reading));
	await server.cli(["browser", "show", "--input", input, "--pane", pane]);
}

export { readModel, editModel, modelResult, showModel };
